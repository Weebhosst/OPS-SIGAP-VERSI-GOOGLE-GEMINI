import assert from 'node:assert/strict';

if (process.env.DATABASE_PROVIDER !== 'postgres') {
  throw new Error('test:media-storage-live wajib dijalankan dengan DATABASE_PROVIDER=postgres');
}
if (process.env.MEDIA_PROVIDER !== 'railway_s3') {
  throw new Error('test:media-storage-live wajib dijalankan dengan MEDIA_PROVIDER=railway_s3');
}

const {
  checkMediaStorage,
  deleteMediaObject,
  parseImageDataUrl,
  prepareMedia,
  readMediaObject,
} = await import('./mediaStorage');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';
const parsed = parseImageDataUrl(png);
const mediaId = `MEDIA-PROBE-${Date.now()}`;
let storageKey = '';

try {
  // Perform the real object round trip first. This gives a precise S3 error
  // if signing/routing is wrong instead of hiding it behind a generic health probe.
  const prepared = await prepareMedia({
    mediaId,
    sourceModule: 'PATROL',
    siteId: 'HEALTHCHECK',
    userId: 'HEALTHCHECK',
    documentType: 'LAINNYA',
    eventAt: new Date().toISOString(),
    photoUrl: png,
  });
  storageKey = prepared.storageKey;

  assert.equal(prepared.storageProvider, 'railway_s3');
  assert.ok(storageKey.startsWith('ops-sigap/'));

  const downloaded = await readMediaObject({
    id: mediaId,
    storageProvider: prepared.storageProvider,
    storageKey,
    mimeType: prepared.mimeType,
    fileName: prepared.fileName,
  });

  assert.equal(downloaded.mimeType, 'image/png');
  assert.deepEqual(downloaded.body, parsed.buffer);

  const health = await checkMediaStorage();
  assert.equal(health.configured, true, `Object storage belum terkonfigurasi: ${health.error || 'unknown'}`);
  assert.equal(health.connected, true, `Object storage tidak terhubung: ${health.error || 'unknown'}`);

  console.log('PASS Railway S3 object PUT');
  console.log('PASS Railway S3 object GET');
  console.log('PASS Railway S3 signed readiness probe');
} finally {
  if (storageKey) {
    await deleteMediaObject(storageKey);
    console.log('PASS Railway S3 object DELETE cleanup');
  }
}
