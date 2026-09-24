import { createHash, createHmac } from 'crypto';
import { config } from './config';
import { RepositoryError } from './repositories/contracts';

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PreparedMedia {
  photoUrl: string;
  storageProvider: 'inline_json' | 'external_url' | 'railway_s3';
  storageKey: string;
  mimeType: string;
  fileName: string;
  fileSize: number | null;
}

export interface MediaObjectRef {
  id: string;
  storageProvider: string;
  storageKey: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

export interface PrepareMediaInput {
  mediaId: string;
  sourceModule: 'PATROL' | 'HANDOVER' | 'INCIDENT';
  siteId: string;
  userId: string;
  documentType: string;
  eventAt: string;
  photoUrl: string;
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function amzTimestamp(date = new Date()): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function sanitizeSegment(value: string): string {
  const sanitized = String(value || '').trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'unknown';
}

function extensionForMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function assertImageMagic(buffer: Buffer, mimeType: string): void {
  const jpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const webp = buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const valid = mimeType === 'image/jpeg' ? jpeg : mimeType === 'image/png' ? png : webp;
  if (!valid) {
    throw new RepositoryError('MEDIA_SIGNATURE_INVALID', 'Isi file foto tidak sesuai dengan format gambar yang dikirim.', 400);
  }
}

export function parseImageDataUrl(value: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(value.trim());
  if (!match) {
    throw new RepositoryError('MEDIA_FORMAT_UNSUPPORTED', 'Format foto tidak didukung. Gunakan JPEG, PNG, atau WEBP.', 400);
  }
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    throw new RepositoryError('MEDIA_FORMAT_UNSUPPORTED', 'Format foto tidak didukung.', 400);
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new RepositoryError('MEDIA_EMPTY', 'Foto kosong atau rusak.', 400);
  if (buffer.length > MAX_MEDIA_BYTES) {
    throw new RepositoryError('MEDIA_TOO_LARGE', 'Ukuran satu foto maksimal 8 MB.', 413);
  }
  assertImageMagic(buffer, mimeType);
  return { mimeType, buffer };
}

export function buildMediaObjectKey(input: Pick<PrepareMediaInput, 'mediaId' | 'siteId' | 'documentType' | 'eventAt'>, mimeType: string): string {
  const date = new Date(input.eventAt);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = String(safeDate.getUTCFullYear());
  const month = String(safeDate.getUTCMonth() + 1).padStart(2, '0');
  return [
    'ops-sigap',
    year,
    month,
    sanitizeSegment(input.siteId),
    sanitizeSegment(input.documentType),
    `${sanitizeSegment(input.mediaId)}.${extensionForMime(mimeType)}`,
  ].join('/');
}

function requireS3Config() {
  if (config.mediaProvider !== 'railway_s3') {
    throw new RepositoryError(
      'MEDIA_STORAGE_NOT_READY',
      'Object storage belum aktif untuk provider database ini.',
      503,
    );
  }
  const missing = [
    ['MEDIA_BUCKET', config.mediaBucket],
    ['MEDIA_ACCESS_KEY_ID', config.mediaAccessKeyId],
    ['MEDIA_SECRET_ACCESS_KEY', config.mediaSecretAccessKey],
    ['MEDIA_REGION', config.mediaRegion],
    ['MEDIA_ENDPOINT', config.mediaEndpoint],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new RepositoryError(
      'MEDIA_STORAGE_MISCONFIGURED',
      `Konfigurasi object storage belum lengkap: ${missing.join(', ')}.`,
      503,
    );
  }
  return {
    bucket: config.mediaBucket,
    accessKeyId: config.mediaAccessKeyId,
    secretAccessKey: config.mediaSecretAccessKey,
    region: config.mediaRegion,
    endpoint: config.mediaEndpoint,
    urlStyle: config.mediaUrlStyle,
  };
}

function encodeObjectPath(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function objectUrl(key = ''): URL {
  const s3 = requireS3Config();
  const endpoint = new URL(s3.endpoint);
  const cleanBasePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey = encodeObjectPath(key);

  if (s3.urlStyle === 'path') {
    const path = [cleanBasePath, encodeURIComponent(s3.bucket), encodedKey].filter(Boolean).join('/');
    endpoint.pathname = path.startsWith('/') ? path : `/${path}`;
    return endpoint;
  }

  endpoint.hostname = `${s3.bucket}.${endpoint.hostname}`;
  const path = [cleanBasePath, encodedKey].filter(Boolean).join('/');
  endpoint.pathname = path ? (path.startsWith('/') ? path : `/${path}`) : '/';
  return endpoint;
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) => aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function signedHeaders(method: string, url: URL, body: Buffer, date = new Date()): Record<string, string> {
  const s3 = requireS3Config();
  const payloadHash = sha256Hex(body);
  const { amzDate, dateStamp } = amzTimestamp(date);
  const headers = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${String(value).trim()}\n`)
    .join('');
  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname || '/',
    canonicalQuery(url),
    canonicalHeaders,
    signedHeaderNames,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${s3.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${s3.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, s3.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: `AWS4-HMAC-SHA256 Credential=${s3.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
  };
}

async function s3Request(method: 'GET' | 'PUT' | 'DELETE' | 'HEAD', key: string, body = Buffer.alloc(0), contentType?: string): Promise<Response> {
  const url = objectUrl(key);
  const headers: Record<string, string> = signedHeaders(method, url, body);
  if (contentType) headers['content-type'] = contentType;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'PUT' ? body : undefined,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    throw new RepositoryError('MEDIA_STORAGE_UNAVAILABLE', `Object storage tidak dapat dihubungi: ${message}`, 503);
  } finally {
    clearTimeout(timeout);
  }
}

async function putObject(key: string, body: Buffer, mimeType: string): Promise<void> {
  const response = await s3Request('PUT', key, body, mimeType);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new RepositoryError(
      'MEDIA_UPLOAD_FAILED',
      `Upload foto ke object storage gagal (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      503,
    );
  }
}

export async function deleteMediaObject(key: string): Promise<void> {
  if (!key || config.mediaProvider !== 'railway_s3') return;
  try {
    await s3Request('DELETE', key);
  } catch {
    // Best-effort compensation only. Metadata/audit remains the authoritative record.
  }
}

export function mediaDeliveryUrl(mediaId: string): string {
  return `/api/media/${encodeURIComponent(mediaId)}/content`;
}

export async function prepareMedia(input: PrepareMediaInput): Promise<PreparedMedia> {
  const raw = input.photoUrl.trim();
  if (!raw) throw new RepositoryError('MEDIA_REQUIRED', 'Foto wajib tersedia.', 400);

  if (!raw.startsWith('data:')) {
    return {
      photoUrl: raw,
      storageProvider: 'external_url',
      storageKey: raw,
      mimeType: raw.toLowerCase().endsWith('.png') ? 'image/png' : raw.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg',
      fileName: `${sanitizeSegment(input.mediaId)}.jpg`,
      fileSize: null,
    };
  }

  if (config.databaseProvider === 'json') {
    const parsed = parseImageDataUrl(raw);
    return {
      photoUrl: raw,
      storageProvider: 'inline_json',
      storageKey: raw,
      mimeType: parsed.mimeType,
      fileName: `${sanitizeSegment(input.mediaId)}.${extensionForMime(parsed.mimeType)}`,
      fileSize: parsed.buffer.length,
    };
  }

  const parsed = parseImageDataUrl(raw);
  const storageKey = buildMediaObjectKey(input, parsed.mimeType);
  await putObject(storageKey, parsed.buffer, parsed.mimeType);

  return {
    photoUrl: mediaDeliveryUrl(input.mediaId),
    storageProvider: 'railway_s3',
    storageKey,
    mimeType: parsed.mimeType,
    fileName: storageKey.split('/').pop() || `${sanitizeSegment(input.mediaId)}.${extensionForMime(parsed.mimeType)}`,
    fileSize: parsed.buffer.length,
  };
}

export async function prepareMediaBatch(inputs: PrepareMediaInput[]): Promise<PreparedMedia[]> {
  const prepared: PreparedMedia[] = [];
  try {
    for (const input of inputs) prepared.push(await prepareMedia(input));
    return prepared;
  } catch (error) {
    await Promise.all(
      prepared
        .filter((item) => item.storageProvider === 'railway_s3')
        .map((item) => deleteMediaObject(item.storageKey)),
    );
    throw error;
  }
}

export async function cleanupPreparedMedia(items: PreparedMedia[]): Promise<void> {
  await Promise.all(
    items
      .filter((item) => item.storageProvider === 'railway_s3')
      .map((item) => deleteMediaObject(item.storageKey)),
  );
}

export async function readMediaObject(ref: MediaObjectRef): Promise<{ body: Buffer; mimeType: string; fileName: string }> {
  if (ref.storageProvider === 'external_url') {
    throw new RepositoryError('MEDIA_EXTERNAL_REDIRECT', ref.storageKey, 302);
  }
  if (ref.storageProvider !== 'railway_s3') {
    throw new RepositoryError('MEDIA_CONTENT_UNAVAILABLE', 'Media lama tidak tersedia melalui object storage.', 404);
  }

  const response = await s3Request('GET', ref.storageKey);
  if (response.status === 404) throw new RepositoryError('MEDIA_OBJECT_NOT_FOUND', 'File media tidak ditemukan di object storage.', 404);
  if (!response.ok) {
    throw new RepositoryError('MEDIA_DOWNLOAD_FAILED', `Gagal membaca media dari object storage (HTTP ${response.status}).`, 503);
  }

  const lengthHeader = Number(response.headers.get('content-length') || 0);
  if (lengthHeader > MAX_MEDIA_BYTES) {
    throw new RepositoryError('MEDIA_TOO_LARGE', 'Ukuran media melebihi batas layanan.', 413);
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > MAX_MEDIA_BYTES) {
    throw new RepositoryError('MEDIA_TOO_LARGE', 'Ukuran media melebihi batas layanan.', 413);
  }
  return {
    body,
    mimeType: ref.mimeType || response.headers.get('content-type') || 'application/octet-stream',
    fileName: ref.fileName || ref.id,
  };
}

export async function checkMediaStorage(): Promise<{ provider: string; configured: boolean; connected: boolean; error?: string }> {
  if (config.mediaProvider !== 'railway_s3') {
    return { provider: config.mediaProvider, configured: config.databaseProvider === 'json', connected: config.databaseProvider === 'json' };
  }
  try {
    requireS3Config();
    const response = await s3Request('HEAD', '');
    return {
      provider: config.mediaProvider,
      configured: true,
      connected: response.ok || response.status === 403,
      ...(response.ok || response.status === 403 ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      provider: config.mediaProvider,
      configured: false,
      connected: false,
      error: error instanceof Error ? error.message : 'unknown',
    };
  }
}
