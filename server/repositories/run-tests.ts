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

  const beforeDryRun = fs.readFileSync(temporaryDatabase);
  execFileSync(process.execPath, ['--import', 'tsx', 'server/db/importJson.ts', '--dry-run'], {
    cwd: process.cwd(),
    env: { ...process.env, OPS_SIGAP_IMPORT_FILE: temporaryDatabase },
    stdio: 'pipe',
  });
  assert.deepEqual(fs.readFileSync(temporaryDatabase), beforeDryRun);

  const schemaSql = fs.readFileSync(path.resolve('server/db/migrations/001_initial_schema.sql'), 'utf8');
  const postgresSource = fs.readFileSync(path.resolve('server/repositories/postgresRepositories.ts'), 'utf8');
  const importerSource = fs.readFileSync(path.resolve('server/db/importJson.ts'), 'utf8');
  assert.match(schemaSql, /shift_sessions_one_active_user[\s\S]+WHERE status='ACTIVE'/);
  assert.match(schemaSql, /patrol_logs_unique_valid_checkpoint_round[\s\S]+WHERE validation_status='VALID'/);
  assert.match(postgresSource, /personnel_capacity[\s\S]+FOR UPDATE/);
  assert.match(importerSource, /ON CONFLICT\(id\) DO NOTHING/);

  console.log('PASS repository provider health and pagination');
  console.log('PASS JSON import referential validation');
  console.log('PASS atomic active-session uniqueness');
  console.log('PASS site-capacity rejection and operational-date persistence');
  console.log('PASS valid-checkpoint uniqueness and alert workflow persistence');
  console.log('PASS migration dry-run leaves JSON source unchanged');
  console.log('PASS PostgreSQL constraints, capacity lock, and idempotent import strategy');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
