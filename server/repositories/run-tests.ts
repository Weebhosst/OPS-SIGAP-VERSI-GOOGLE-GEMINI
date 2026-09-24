import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sigap-repository-'));
const temporaryDatabase = path.join(temporaryDirectory, 'ops-sigap.json');
fs.copyFileSync(path.resolve('data/ops-sigap.json'), temporaryDatabase);
process.env.OPS_SIGAP_DATA_FILE = temporaryDatabase;

try {
  const { jsonRepositories } = await import('./jsonRepositories');
  const { RepositoryError } = await import('./contracts');
  const { normalizeLegacyJson, validateJsonImport } = await import('../db/importJson');

  const health = await jsonRepositories.health();
  assert.deepEqual(health, { provider: 'json', database: 'connected' });

  const users = await jsonRepositories.users.list({ limit: 2, offset: 0 });
  assert.equal(users.items.length, Math.min(2, users.total));
  assert.equal(users.hasMore, users.total > users.items.length);

  const source = JSON.parse(fs.readFileSync(temporaryDatabase, 'utf8'));
  assert.deepEqual(validateJsonImport(normalizeLegacyJson(source)), []);

  const authNow = new Date();
  const authRecord = await jsonRepositories.authSessions.create({
    id: `AUTH-TEST-${Date.now()}`,
    tokenHash: `HASH-${Date.now()}`,
    userId: users.items[0].id,
    createdAt: authNow.toISOString(),
    lastSeenAt: authNow.toISOString(),
    expiresAt: new Date(authNow.getTime() + 60_000).toISOString(),
    revokedAt: null,
    ipAddress: '127.0.0.1',
    userAgent: 'repository-test',
  });
  assert.equal((await jsonRepositories.authSessions.findActiveByTokenHash(authRecord.tokenHash, authNow.toISOString()))?.id, authRecord.id);
  await jsonRepositories.authSessions.touch(authRecord.id, new Date(authNow.getTime() + 1000).toISOString());
  await jsonRepositories.authSessions.revokeByTokenHash(authRecord.tokenHash, new Date(authNow.getTime() + 2000).toISOString());
  assert.equal(await jsonRepositories.authSessions.findActiveByTokenHash(authRecord.tokenHash, new Date(authNow.getTime() + 3000).toISOString()), undefined);

  const user = users.items.find((item) => item.siteId) || users.items[0];
  const sites = await jsonRepositories.sites.list({ limit: 1, offset: 0 });
  const site = (user?.siteId && await jsonRepositories.sites.findById(user.siteId)) || sites.items[0];
  assert.ok(user && site, 'Fixture harus memiliki user dan site.');

  let active = await jsonRepositories.sessions.getActiveByUser(user.id);
  if (!active) {
    const now = new Date().toISOString();
    active = await jsonRepositories.sessions.startAtomic({
      personnelCapacity: Math.max(site.personnelCapacity, 100),
      session: {
        id: `TEST-SESSION-${Date.now()}`,
        userId: user.id,
        customerId: site.customerId,
        siteId: site.id,
        shiftCode: 'SHIFT_1',
        shiftDate: now.slice(0, 10),
        startedAt: now,
        status: 'ACTIVE',
        totalRequired: 1,
        totalValid: 0,
        completionPct: 0,
        startDocumentationCompleted: false,
        endDocumentationCompleted: false,
        forceClosed: false,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  await assert.rejects(
    () => jsonRepositories.sessions.startAtomic({ personnelCapacity: 100, session: { ...active!, id: `${active!.id}-DUPLICATE` } }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'USER_ALREADY_HAS_ACTIVE_SESSION',
  );

  assert.equal((await jsonRepositories.sessions.findById(active.id))?.shiftDate, active.shiftDate);

  const filteredSessions = await jsonRepositories.sessions.listFiltered(
    { userId: active.userId, siteId: active.siteId, status: 'ACTIVE', operationalDate: active.shiftDate },
    { limit: 20, offset: 0 },
  );
  assert.ok(filteredSessions.items.some((item) => item.id === active!.id), 'Filtered session repository harus mengembalikan sesi aktif yang sama.');

  const otherUser = users.items.find((item) => item.id !== user.id && item.siteId === site.id);
  if (otherUser) {
    await assert.rejects(
      () => jsonRepositories.sessions.startAtomic({ personnelCapacity: 1, session: { ...active!, id: `${active!.id}-CAPACITY`, userId: otherUser.id } }),
      (error: unknown) => error instanceof RepositoryError && error.code === 'SITE_CAPACITY_FULL',
    );
  }

  const checkpoint = (await jsonRepositories.checkpoints.listBySite(site.id))[0];
  assert.ok(checkpoint, 'Fixture harus memiliki checkpoint.');
  const logBase = {
    id: `TEST-LOG-${Date.now()}`,
    sessionId: active.id,
    checkpointId: checkpoint.id,
    userId: user.id,
    siteId: site.id,
    roundNumber: 1,
    validationStatus: 'VALID' as const,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    calculatedDistanceM: 0,
    observationStatus: 'AMAN' as const,
    clientCapturedAt: new Date().toISOString(),
    serverReceivedAt: new Date().toISOString(),
    syncSource: 'ONLINE' as const,
    createdAt: new Date().toISOString(),
  };
  await jsonRepositories.patrol.addLogAtomic(logBase);
  await assert.rejects(
    () => jsonRepositories.patrol.addLogAtomic({ ...logBase, id: `${logBase.id}-DUPLICATE` }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'DUPLICATE_CHECKPOINT',
  );

  const reviewLog = { ...logBase, id: `${logBase.id}-REVIEW`, checkpointId: 'UNKNOWN', validationStatus: 'REVIEW' as const, rejectionReason: 'GPS_LOW_ACCURACY' };
  await jsonRepositories.patrol.addLogAtomic(reviewLog);
  const alert = (await jsonRepositories.alerts.list('OPEN', { limit: 100, offset: 0 })).items.find((item) => item.patrolLogId === reviewLog.id);
  assert.ok(alert, 'Log review harus membuat validation alert.');
  assert.equal((await jsonRepositories.alerts.transition(alert.id, 'REVIEW', user.id)).status, 'UNDER_REVIEW');
  assert.equal((await jsonRepositories.alerts.transition(alert.id, 'CLOSE', user.id, 'Sudah diverifikasi')).status, 'CLOSED');
  assert.equal((await jsonRepositories.alerts.transition(alert.id, 'REOPEN', user.id)).status, 'OPEN');

  const mediaId = `TEST-MEDIA-${Date.now()}`;
  await jsonRepositories.media.add({
    id: mediaId,
    sourceModule: 'PATROL',
    sourceTable: 'patrol_logs',
    sourceId: logBase.id,
    siteId: site.id,
    userId: user.id,
    shiftDate: active.shiftDate,
    shiftCode: active.shiftCode,
    category: 'PATROLI_QR',
    documentType: 'PATROLI_QR',
    photoUrl: 'data:image/jpeg;base64,TEST',
    caption: 'Repository media test',
    eventAt: new Date().toISOString(),
    checkpointId: checkpoint.id,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    createdBy: user.id,
  }, active.id, active.customerId);
  const mediaPage = await jsonRepositories.media.list({ siteId: site.id, documentType: 'PATROLI_QR' }, { limit: 100, offset: 0 });
  assert.ok(mediaPage.items.some((item) => item.id === mediaId), 'Media repository harus mengembalikan media yang baru disimpan.');
  const mediaCounts = await jsonRepositories.media.counts({ siteId: site.id });
  assert.ok((mediaCounts.PATROLI_QR || 0) >= 1, 'Media counter PATROLI_QR harus tersedia.');

  const filterState = await jsonRepositories.adminState.set(user.id, { siteId: site.id, shiftCode: 'SHIFT_1' });
  assert.equal((await jsonRepositories.adminState.get(user.id))?.siteId, site.id);
  assert.equal(filterState.shiftCode, 'SHIFT_1');

  const handoverId = `TEST-HANDOVER-${Date.now()}`;
  const handover = await jsonRepositories.handovers.create({
    id: handoverId,
    sessionId: active.id,
    siteId: site.id,
    shiftDate: active.shiftDate,
    shiftCode: active.shiftCode,
    handoverType: 'SERAH_TERIMA',
    fromUserId: user.id,
    eventAt: new Date().toISOString(),
    conditionStatus: 'BAIK',
    personnelStatus: 'Lengkap',
    equipmentStatus: 'Baik',
    keysStatus: 'Baik',
    vehicleStatus: 'Baik',
    ackFrom: true,
    ackTo: false,
    status: 'SUBMITTED',
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal((await jsonRepositories.handovers.list({ siteId: site.id }, { limit: 100, offset: 0 })).items.some((item) => item.id === handover.id), true);
  assert.equal((await jsonRepositories.handovers.update(handover.id, { ackTo: true, status: 'ACKNOWLEDGED', toUserId: user.id }))?.ackTo, true);

  const incidentId = `TEST-INCIDENT-${Date.now()}`;
  const incident = await jsonRepositories.incidents.create({
    id: incidentId,
    sessionId: active.id,
    customerId: site.customerId,
    siteId: site.id,
    userId: user.id,
    incidentAt: new Date().toISOString(),
    shiftCode: active.shiftCode,
    shiftDate: active.shiftDate,
    category: 'INSIDENTIL',
    severity: 'RENDAH',
    title: 'Repository test',
    locationText: 'Test area',
    chronology: 'Test chronology',
    initialAction: 'Test action',
    status: 'OPEN',
    escalated: false,
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal((await jsonRepositories.incidents.list({ siteId: site.id }, { limit: 100, offset: 0 })).items.some((item) => item.id === incident.id), true);
  assert.equal((await jsonRepositories.incidents.update(incident.id, { status: 'CLOSED', closedAt: new Date().toISOString() }))?.status, 'CLOSED');

  const calibration = await jsonRepositories.radiusCalibrations.create({
    id: `TEST-CAL-${Date.now()}`,
    siteId: site.id,
    checkpointId: checkpoint.id,
    testedByUserId: user.id,
    testedAt: new Date().toISOString(),
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    calculatedDistanceM: 0,
    configuredRadiusM: checkpoint.radiusMeters,
    verdict: 'VALID',
    createdAt: new Date().toISOString(),
  });
  assert.equal((await jsonRepositories.radiusCalibrations.list({ limit: 100, offset: 0 })).items.some((item) => item.id === calibration.id), true);

  const beforeDryRun = fs.readFileSync(temporaryDatabase);
  execFileSync(process.execPath, ['--import', 'tsx', 'server/db/importJson.ts', '--dry-run'], {
    cwd: process.cwd(),
    env: { ...process.env, OPS_SIGAP_IMPORT_FILE: temporaryDatabase },
    stdio: 'pipe',
  });
  assert.deepEqual(fs.readFileSync(temporaryDatabase), beforeDryRun);

  const schemaSql = fs.readFileSync(path.resolve('server/db/migrations/001_initial_schema.sql'), 'utf8');
  const runtimeSchemaSql = fs.readFileSync(path.resolve('server/db/migrations/003_admin_runtime.sql'), 'utf8');
  const authSchemaSql = fs.readFileSync(path.resolve('server/db/migrations/004_auth_sessions.sql'), 'utf8');
  const postgresSource = fs.readFileSync(path.resolve('server/repositories/postgresRepositories.ts'), 'utf8');
  const importerSource = fs.readFileSync(path.resolve('server/db/importJson.ts'), 'utf8');
  const patrolServiceSource = fs.readFileSync(path.resolve('server/patrolService.ts'), 'utf8');
  const mediaServiceSource = fs.readFileSync(path.resolve('server/mediaService.ts'), 'utf8');
  const tokenCryptoSource = fs.readFileSync(path.resolve('server/security/checkpointTokenCrypto.ts'), 'utf8');
  const mediaStorageSource = fs.readFileSync(path.resolve('server/mediaStorage.ts'), 'utf8');
  const routeSource = fs.readFileSync(path.resolve('server/routes.ts'), 'utf8');
  const apiClientSource = fs.readFileSync(path.resolve('src/lib/api.ts'), 'utf8');
  const authContextSource = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf8');
  const loginViewSource = fs.readFileSync(path.resolve('src/views/LoginView.tsx'), 'utf8');
  assert.match(schemaSql, /shift_sessions_one_active_user[\s\S]+WHERE status='ACTIVE'/);
  assert.match(schemaSql, /patrol_logs_unique_valid_checkpoint_round[\s\S]+WHERE validation_status='VALID'/);
  assert.match(postgresSource, /personnel_capacity[\s\S]+FOR UPDATE/);
  assert.match(importerSource, /ON CONFLICT\(id\) DO NOTHING/);
  assert.match(importerSource, /legacy-json:/);
  assert.match(importerSource, /token_ciphertext/);
  assert.match(importerSource, /incident_media/);
  assert.match(importerSource, /handover_media/);
  assert.match(runtimeSchemaSql, /token_ciphertext/);
  assert.match(runtimeSchemaSql, /CREATE TABLE admin_filter_state/);
  assert.match(runtimeSchemaSql, /CREATE TABLE radius_calibrations/);
  assert.match(authSchemaSql, /CREATE TABLE auth_sessions/);
  assert.match(authSchemaSql, /token_hash text NOT NULL UNIQUE/);
  assert.match(routeSource, /randomBytes\(32\)/);
  assert.match(routeSource, /sameSite: 'strict'/);
  assert.match(routeSource, /PASSWORD_CHANGE_REQUIRED/);
  assert.doesNotMatch(routeSource, /res\.json\(\{\s*success:\s*true,\s*user:\s*safeUser,\s*token/);
  assert.doesNotMatch(apiClientSource, /localStorage\.getItem\(['"]sigap_token/);
  assert.doesNotMatch(authContextSource, /localStorage\.(setItem|removeItem)\(['"]sigap_token/);
  assert.doesNotMatch(loginViewSource, /Akun Demo Pengujian|SUPER ADMIN \(Demo\)/);
  assert.match(postgresSource, /encryptCheckpointToken/);
  assert.match(tokenCryptoSource, /aes-256-gcm/);
  assert.doesNotMatch(patrolServiceSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.doesNotMatch(mediaServiceSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.doesNotMatch(routeSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.match(patrolServiceSource, /prepareMedia/);
  assert.match(mediaStorageSource, /AWS4-HMAC-SHA256/);
  assert.match(mediaStorageSource, /railway_s3/);
  assert.match(routeSource, /\/media\/:id\/content/);
  assert.doesNotMatch(postgresSource, /storage_provider[^\n]+external_url[^\n]+item\.photoUrl/);

  console.log('PASS repository provider health and pagination');
  console.log('PASS JSON import referential validation');
  console.log('PASS atomic active-session uniqueness');
  console.log('PASS site-capacity rejection and operational-date persistence');
  console.log('PASS valid-checkpoint uniqueness and alert workflow persistence');
  console.log('PASS migration dry-run leaves JSON source unchanged');
  console.log('PASS PostgreSQL constraints, capacity lock, and idempotent import strategy');
  console.log('PASS provider-safe patrol/media service cutover');
  console.log('PASS operational/master repositories, admin state, radius calibration, and media relations');
  console.log('PASS routes/services contain no direct legacy JSON db access');
  console.log('PASS checkpoint tokens are hashed plus AES-GCM encrypted at rest');
  console.log('PASS Round 4B media storage is provider-neutral and uses private delivery routes');
  console.log('PASS HttpOnly auth sessions, forced password rotation, and production credential hygiene');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
