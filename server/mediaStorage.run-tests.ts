import assert from 'node:assert/strict';

process.env.DATABASE_PROVIDER = 'postgres';
process.env.MEDIA_PROVIDER = 'railway_s3';
process.env.MEDIA_BUCKET = 'ops-media-test';
process.env.MEDIA_ACCESS_KEY_ID = 'TESTACCESSKEY';
process.env.MEDIA_SECRET_ACCESS_KEY = 'TESTSECRETKEY';
process.env.MEDIA_REGION = 'auto';
process.env.MEDIA_ENDPOINT = 'https://t3.storageapi.dev';
process.env.MEDIA_URL_STYLE = 'virtual';

const requests: Array<{ url: string; method: string; headers: Headers }> = [];
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  requests.push({ url, method, headers });
  if (method === 'GET') {
    return new Response(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01]), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '9' },
    });
  }
  return new Response(null, { status: 200 });
}) as typeof fetch;

const {
  buildMediaObjectKey,
  checkMediaStorage,
  parseImageDataUrl,
  prepareMedia,
  prepareMediaBatch,
  readMediaObject,
} = await import('./mediaStorage');

const parsed = parseImageDataUrl(png);
assert.equal(parsed.mimeType, 'image/png');
assert.ok(parsed.buffer.length > 8);

assert.throws(
  () => parseImageDataUrl('data:text/plain;base64,SGVsbG8='),
  /Format foto tidak didukung/,
);

const key = buildMediaObjectKey({
  mediaId: 'MED-TEST-01',
  siteId: 'MO SUBANG',
  documentType: 'SERTIGAS_NAIK_JAGA',
  eventAt: '2026-09-24T07:00:00.000Z',
}, 'image/png');
assert.equal(key, 'ops-sigap/2026/09/MO_SUBANG/SERTIGAS_NAIK_JAGA/MED-TEST-01.png');

const prepared = await prepareMedia({
  mediaId: 'MED-TEST-01',
  sourceModule: 'HANDOVER',
  siteId: 'MO SUBANG',
  userId: 'USR-TEST',
  documentType: 'SERTIGAS_NAIK_JAGA',
  eventAt: '2026-09-24T07:00:00.000Z',
  photoUrl: png,
});
assert.equal(prepared.storageProvider, 'railway_s3');
assert.equal(prepared.storageKey, key);
assert.equal(prepared.photoUrl, '/api/media/MED-TEST-01/content');
assert.equal(requests[0].method, 'PUT');
assert.equal(requests[0].url, `https://ops-media-test.t3.storageapi.dev/${key}`);
assert.match(requests[0].headers.get('authorization') || '', /^AWS4-HMAC-SHA256 Credential=TESTACCESSKEY\//);
assert.ok(requests[0].headers.get('x-amz-content-sha256'));
assert.ok(requests[0].headers.get('x-amz-date'));

const downloaded = await readMediaObject({
  id: 'MED-TEST-01',
  storageProvider: 'railway_s3',
  storageKey: key,
  mimeType: 'image/png',
  fileName: 'evidence.png',
});
assert.equal(downloaded.mimeType, 'image/png');
assert.equal(downloaded.fileName, 'evidence.png');
assert.equal(downloaded.body[0], 0x89);

const health = await checkMediaStorage();
assert.equal(health.configured, true);
assert.equal(health.connected, true);
assert.ok(requests.some((item) => item.method === 'GET' && item.url.includes('ops-sigap/.healthcheck-missing-object')));

const external = await prepareMedia({
  mediaId: 'MED-EXT-01',
  sourceModule: 'INCIDENT',
  siteId: 'MO-SUBANG',
  userId: 'USR-TEST',
  documentType: 'INSIDEN',
  eventAt: '2026-09-24T07:00:00.000Z',
  photoUrl: 'https://example.invalid/photo.jpg',
});
assert.equal(external.storageProvider, 'external_url');
assert.equal(external.photoUrl, 'https://example.invalid/photo.jpg');

let batchPut = 0;
const batchRequests: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const method = String(init?.method || 'GET').toUpperCase();
  batchRequests.push(method);
  if (method === 'PUT') {
    batchPut += 1;
    if (batchPut === 2) return new Response('forced failure', { status: 500 });
    return new Response(null, { status: 200 });
  }
  if (method === 'DELETE') return new Response(null, { status: 204 });
  return new Response(null, { status: 200 });
}) as typeof fetch;

await assert.rejects(
  () => prepareMediaBatch([
    {
      mediaId: 'MED-BATCH-1',
      sourceModule: 'INCIDENT',
      siteId: 'MO-SUBANG',
      userId: 'USR-TEST',
      documentType: 'INSIDEN',
      eventAt: '2026-09-24T07:00:00.000Z',
      photoUrl: png,
    },
    {
      mediaId: 'MED-BATCH-2',
      sourceModule: 'INCIDENT',
      siteId: 'MO-SUBANG',
      userId: 'USR-TEST',
      documentType: 'INSIDEN',
      eventAt: '2026-09-24T07:00:00.000Z',
      photoUrl: png,
    },
  ]),
  /Upload foto ke object storage gagal/,
);
assert.ok(batchRequests.includes('DELETE'), 'Upload batch yang gagal harus membersihkan object yang sudah terunggah.');

console.log('PASS image data URL validation and size/type guard');
console.log('PASS deterministic Railway S3 object keys');
console.log('PASS AWS Signature V4 upload request construction');
console.log('PASS authenticated delivery URL metadata');
console.log('PASS object download path and storage health probe');
console.log('PASS external URL compatibility');
console.log('PASS failed batch upload compensates uploaded objects');
