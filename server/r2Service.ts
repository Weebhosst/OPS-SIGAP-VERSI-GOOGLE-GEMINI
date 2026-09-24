import { AwsClient } from 'aws4fetch';
import { randomUUID } from 'node:crypto';
import { config, requireR2Config } from './config';

export type MediaPurpose =
  | 'PATROL'
  | 'SERTIGAS'
  | 'HANDOVER'
  | 'TARUNA'
  | 'INCIDENT'
  | 'ATTENDANCE'
  | 'DOCUMENT'
  | 'TEMP';

const PURPOSE_FOLDER: Record<MediaPurpose, string> = {
  PATROL: 'patrol/checkpoint',
  SERTIGAS: 'patrol/sertigas',
  HANDOVER: 'handover',
  TARUNA: 'handover/taruna',
  INCIDENT: 'incident',
  ATTENDANCE: 'attendance',
  DOCUMENT: 'documents',
  TEMP: 'temp',
};

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

function getDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '00';
  return { year: value('year'), month: value('month'), day: value('day') };
}

function encodeKey(key: string): string {
  return key.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

function createClient() {
  const r2 = requireR2Config();
  return {
    r2,
    client: new AwsClient({
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
      region: r2.region,
      service: 's3',
      retries: 2,
    }),
  };
}

export function isAllowedMediaPurpose(value: string): value is MediaPurpose {
  return Object.prototype.hasOwnProperty.call(PURPOSE_FOLDER, value);
}

export function isAllowedMediaType(contentType: string): boolean {
  return Boolean(MIME_EXTENSION[contentType]);
}

export function isSafeObjectKey(key: string): boolean {
  return key.startsWith('ops-sigap/') && !key.includes('..') && !key.includes('\\');
}

export function getSiteIdFromObjectKey(key: string): string | null {
  if (!isSafeObjectKey(key)) return null;
  const parts = key.split('/');
  return parts.length >= 3 ? parts[1] : null;
}

export function createObjectKey(input: {
  siteId: string;
  userId: string;
  purpose: MediaPurpose;
  contentType: string;
}): string {
  const extension = MIME_EXTENSION[input.contentType];
  if (!extension) throw new Error('Tipe file tidak didukung.');
  const { year, month, day } = getDateParts();
  const siteId = String(input.siteId || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g, '_');
  const userId = String(input.userId || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `ops-sigap/${siteId}/${PURPOSE_FOLDER[input.purpose]}/${year}/${month}/${day}/${userId}/${randomUUID()}.${extension}`;
}

export function mediaUrlForKey(key: string): string {
  return `/api/media/object?key=${encodeURIComponent(key)}`;
}

export async function createPresignedUploadUrl(input: {
  key: string;
  contentType: string;
}): Promise<{ uploadUrl: string; expiresIn: number }> {
  if (!isSafeObjectKey(input.key)) throw new Error('Object key tidak valid.');
  if (!isAllowedMediaType(input.contentType)) throw new Error('Tipe file tidak didukung.');

  const { r2, client } = createClient();
  const url = new URL(`${r2.endpoint}/${r2.bucket}/${encodeKey(input.key)}`);
  url.searchParams.set('X-Amz-Expires', String(r2.expiresSeconds));

  const signed = await client.sign(
    new Request(url, {
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
    }),
    { aws: { signQuery: true } }
  );

  return { uploadUrl: signed.url, expiresIn: r2.expiresSeconds };
}

export async function createPresignedReadUrl(key: string): Promise<string> {
  if (!isSafeObjectKey(key)) throw new Error('Object key tidak valid.');
  const { r2, client } = createClient();
  const url = new URL(`${r2.endpoint}/${r2.bucket}/${encodeKey(key)}`);
  url.searchParams.set('X-Amz-Expires', '60');
  const signed = await client.sign(new Request(url, { method: 'GET' }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
