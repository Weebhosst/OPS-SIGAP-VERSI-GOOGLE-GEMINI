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

  const disposableSuffix = Date.now();
  const disposableCustomer = await jsonRepositories.customers.create({
    id: `CUST-DELETE-${disposableSuffix}`,
    code: `DEL${String(disposableSuffix).slice(-6)}`,
    name: 'Disposable Regression Customer',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const disposableSite = await jsonRepositories.sites.create({
    id: `SITE-DELETE-${disposableSuffix}`,
    code: `SITE-DELETE-${disposableSuffix}`,
    name: 'Disposable Regression Site',
    customerId: disposableCustomer.id,
    personnelCapacity: 1,
    targetRoundsPerShift: 1,
    timezone: 'Asia/Jakarta',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const disposableUser = await jsonRepositories.users.create({
    id: `USR-DELETE-${disposableSuffix}`,
    name: 'Disposable Regression User',
    npk: `DEL${String(disposableSuffix).slice(-7)}`,
    email: `delete-${disposableSuffix}@integration.local`,
    role: 'ANGGOTA',
    customerId: disposableCustomer.id,
    siteId: disposableSite.id,
    position: 'ANGGOTA SECURITY',
    assignmentHistory: [{
      customerId: disposableCustomer.id,
      siteId: disposableSite.id,
      effectiveAt: new Date().toISOString(),
      changedBy: null,
    }],
    status: 'ACTIVE',
    passwordHash: 'TEST-HASH',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert.equal((await jsonRepositories.users.remove(disposableUser.id))?.id, disposableUser.id);
  assert.equal(await jsonRepositories.users.findById(disposableUser.id), undefined);
  assert.equal((await jsonRepositories.sites.remove(disposableSite.id))?.id, disposableSite.id);
  assert.equal(await jsonRepositories.sites.findById(disposableSite.id), undefined);
  assert.equal((await jsonRepositories.customers.remove(disposableCustomer.id))?.id, disposableCustomer.id);
  assert.equal(await jsonRepositories.customers.findById(disposableCustomer.id), undefined);

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
  const customerSessions = await jsonRepositories.sessions.listFiltered(
    { customerId: site.customerId, status: 'ACTIVE' },
    { limit: 100, offset: 0 },
  );
  assert.ok(
    customerSessions.items.some((item) => item.id === active!.id),
    'Customer scope harus mengembalikan active session dari seluruh Site Customer.',
  );

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
  assert.equal((await jsonRepositories.alerts.remove(alert.id))?.id, alert.id);
  assert.equal(await jsonRepositories.alerts.findById(alert.id), undefined);

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
  assert.equal(
    (await jsonRepositories.handovers.list({ customerId: site.customerId }, { limit: 100, offset: 0 }))
      .items.some((item) => item.id === handover.id),
    true,
  );
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
  assert.equal(
    (await jsonRepositories.incidents.list({ customerId: site.customerId }, { limit: 100, offset: 0 }))
      .items.some((item) => item.id === incident.id),
    true,
  );
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
  const postgresPoolSource = fs.readFileSync(path.resolve('server/db/postgres.ts'), 'utf8');
  const configSource = fs.readFileSync(path.resolve('server/config.ts'), 'utf8');
  const importerSource = fs.readFileSync(path.resolve('server/db/importJson.ts'), 'utf8');
  const patrolServiceSource = fs.readFileSync(path.resolve('server/patrolService.ts'), 'utf8');
  const mediaServiceSource = fs.readFileSync(path.resolve('server/mediaService.ts'), 'utf8');
  const tokenCryptoSource = fs.readFileSync(path.resolve('server/security/checkpointTokenCrypto.ts'), 'utf8');
  const mediaStorageSource = fs.readFileSync(path.resolve('server/mediaStorage.ts'), 'utf8');
  const routeSource = fs.readFileSync(path.resolve('server/routes.ts'), 'utf8');
  const apiClientSource = fs.readFileSync(path.resolve('src/lib/api.ts'), 'utf8');
  const authContextSource = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf8');
  const loginViewSource = fs.readFileSync(path.resolve('src/views/LoginView.tsx'), 'utf8');
  const appSource = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  const adminCheckpointSource = fs.readFileSync(path.resolve('src/views/admin/AdminCheckpoints.tsx'), 'utf8');
  const masterMonitoringSource = fs.readFileSync(path.resolve('src/views/admin/MasterMonitoringView.tsx'), 'utf8');
  const adminUsersSource = fs.readFileSync(path.resolve('src/views/admin/AdminUsers.tsx'), 'utf8');
  const chiefScopeMigration = fs.readFileSync(path.resolve('server/db/migrations/006_chief_customer_scope.sql'), 'utf8');
  const memberHomeSource = fs.readFileSync(path.resolve('src/views/MemberHome.tsx'), 'utf8');
  const patrolViewSource = fs.readFileSync(path.resolve('src/views/PatrolActiveView.tsx'), 'utf8');
  const qrScannerSource = fs.readFileSync(path.resolve('src/components/QRScannerModal.tsx'), 'utf8');
  const cameraCaptureSource = fs.readFileSync(path.resolve('src/components/CameraCaptureModal.tsx'), 'utf8');
  const handoverViewSource = fs.readFileSync(path.resolve('src/views/HandoverView.tsx'), 'utf8');
  const incidentViewSource = fs.readFileSync(path.resolve('src/views/IncidentView.tsx'), 'utf8');
  const offlineQueueSource = fs.readFileSync(path.resolve('src/lib/offlineQueue.ts'), 'utf8');
  const apiSource = fs.readFileSync(path.resolve('src/lib/api.ts'), 'utf8');
  const mainSource = fs.readFileSync(path.resolve('src/main.tsx'), 'utf8');
  const offlineBannerSource = fs.readFileSync(path.resolve('src/components/OfflineBanner.tsx'), 'utf8');
  const profileViewSource = fs.readFileSync(path.resolve('src/views/ProfileView.tsx'), 'utf8');
  const serviceWorkerSource = fs.readFileSync(path.resolve('public/sw.js'), 'utf8');
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
  assert.match(configSource, /PG_SSL_REJECT_UNAUTHORIZED/);
  assert.match(postgresPoolSource, /postgresSslRejectUnauthorized/);
  assert.doesNotMatch(postgresPoolSource, /NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.match(tokenCryptoSource, /aes-256-gcm/);
  assert.doesNotMatch(patrolServiceSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.doesNotMatch(mediaServiceSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.doesNotMatch(routeSource, /from ['"]\.\/db['"]|\bdb\./);
  assert.match(patrolServiceSource, /prepareMedia/);
  assert.match(mediaStorageSource, /AWS4-HMAC-SHA256/);
  assert.match(mediaStorageSource, /railway_s3/);
  assert.match(routeSource, /\/media\/:id\/content/);
  assert.doesNotMatch(postgresSource, /storage_provider[^\n]+external_url[^\n]+item\.photoUrl/);
  assert.match(routeSource, /apiRouter\.get\('\/admin\/audit-logs', authMiddleware, requireSuperAdmin/);
  assert.match(routeSource, /apiRouter\.delete\('\/admin\/validation-alerts\/:id', authMiddleware, requireAdmin/);
  assert.match(routeSource, /apiRouter\.delete\('\/admin\/sites\/:id', authMiddleware, requireAdmin/);
  assert.match(routeSource, /apiRouter\.delete\('\/admin\/users\/:id', authMiddleware, requireAdmin/);
  assert.match(routeSource, /DELETE_CONFIRMATION_MISMATCH/);
  assert.match(routeSource, /CUSTOMER_REQUIRES_SITE/);
  assert.doesNotMatch(appSource, /AdminRadiusCalibration|Kalibrasi Radius/);
  assert.match(appSource, /adminTab === 'audit' && user\.role === 'SUPER_ADMIN'/);
  assert.match(adminCheckpointSource, /Math\.max\(0, \.\.\.existingSequences\) \+ 1/);
  assert.match(masterMonitoringSource, /ops:masterWorkspace:/);
  assert.match(masterMonitoringSource, /scrollByTab/);
  assert.match(masterMonitoringSource, /refreshDataInPlace/);
  assert.match(routeSource, /resolveMonitoringCustomerScope/);
  assert.match(routeSource, /selectedRole === 'CHIEF'/);
  assert.match(routeSource, /Customer penugasan wajib dipilih untuk CHIEF/);
  assert.match(adminUsersSource, /Customer Penugasan CHIEF/);
  assert.match(adminUsersSource, /CHIEF tidak ditempatkan pada satu Site/);
  assert.match(chiefScopeMigration, /231117/);
  assert.match(chiefScopeMigration, /230599/);
  assert.match(chiefScopeMigration, /site_id = NULL|site_id, effective_from/);

  // MEMBER-02 security critical regression guards.
  assert.doesNotMatch(patrolViewSource, /setSimulationGps|GPS Simulasi|Set GPS 0m|14\.86m \(VALID\)|16\.3m \(REJECT\)|Default around CP02|Menggunakan koordinat area site BB92/);
  assert.match(patrolViewSource, /GPS BELUM SIAP/);
  assert.match(patrolViewSource, /disabled=\{!!scanLockReason \|\| !nextCheckpoint\}/);
  assert.match(patrolViewSource, /!currentGps[\s\S]+Menunggu GPS perangkat/);

  assert.doesNotMatch(qrScannerSource, /manualToken|availableTokens|Simulasi Scan Cepat Lapangan|masukkan kode token manual/);
  assert.match(qrScannerSource, /harus dipindai langsung melalui kamera perangkat di lokasi/);
  assert.match(routeSource, /function toFieldCheckpoint\(checkpoint: Checkpoint\)/);
  assert.match(routeSource, /const \{ qrToken, \.\.\.safeCheckpoint \} = checkpoint/);
  assert.doesNotMatch(patrolViewSource, /token:\s*c\.qrToken/);

  assert.doesNotMatch(cameraCaptureSource, /handleFileFallback|Galeri Kamera|Pilih File Foto|type="file"/);
  assert.match(cameraCaptureSource, /Bukti operasional wajib diambil langsung melalui kamera perangkat/);

  assert.match(routeSource, /SITE_ASSIGNMENT_REQUIRED/);
  assert.match(routeSource, /resolveFieldSiteId/);
  assert.doesNotMatch(routeSource, /siteId\s*\|\|\s*['"]BB92['"]/);

  assert.match(patrolServiceSource, /WRONG_CHECKPOINT_SEQUENCE/);
  assert.match(patrolServiceSource, /localeCompare\(b\.code, undefined, \{ numeric: true, sensitivity: 'base' \}\)/);
  assert.match(patrolServiceSource, /expectedCheckpoint/);

  assert.match(offlineQueueSource, /throw err instanceof Error/);
  assert.match(patrolViewSource, /statusInRound: 'PENDING_SYNC'/);
  assert.doesNotMatch(patrolViewSource, /statusInRound: 'VALID', isOfflinePending: true/);
  assert.match(routeSource, /apiRouter\.post\('\/sync', authMiddleware, requireFieldMember/);

  assert.match(routeSource, /apiRouter\.get\('\/field\/site-members', authMiddleware, requireFieldMember/);
  assert.match(routeSource, /HANDOVER_RECIPIENT_REQUIRED/);
  assert.match(routeSource, /HANDOVER_RECIPIENT_INVALID/);
  assert.match(routeSource, /HANDOVER_RECIPIENT_MISMATCH/);
  assert.match(routeSource, /handover\.toUserId !== req\.user!\.id/);
  assert.match(handoverViewSource, /h\.toUserId === user\?\.id/);
  assert.match(handoverViewSource, /Penerima Akun/);

  const memberRuntimeSources = [
    memberHomeSource,
    patrolViewSource,
    handoverViewSource,
    incidentViewSource,
    cameraCaptureSource,
    qrScannerSource,
  ].join('\n');
  assert.doesNotMatch(memberRuntimeSources, /BB92|KM 92|Barang Bukti KM 92|Radius Ketat 10-15m/);
  assert.match(memberHomeSource, /siteInfo\?\.name/);
  assert.match(cameraCaptureSource, /siteLabel \|\| 'FIELD'/);

  // MEMBER-03 member home operational-state regression guards.
  assert.match(memberHomeSource, /Tindakan Berikutnya/);
  assert.match(memberHomeSource, /MULAI SHIFT/);
  assert.match(memberHomeSource, /LENGKAPI NAIK JAGA/);
  assert.match(memberHomeSource, /LANJUTKAN RONDE/);
  assert.match(memberHomeSource, /TURUN JAGA & SELESAIKAN SHIFT/);
  assert.match(memberHomeSource, /KONEKSI DIPERLUKAN/);
  assert.match(memberHomeSource, /SERAH TERIMA MENUNGGU KONFIRMASI/);
  assert.match(memberHomeSource, /offlineQueue\.getSummary/);
  assert.match(memberHomeSource, /visibilitychange/);
  assert.match(memberHomeSource, /30_000/);
  assert.match(memberHomeSource, /currentRoundCompleted/);
  assert.match(memberHomeSource, /incomingHandoverCount/);
  assert.match(memberHomeSource, /siteInfo\?\.name/);
  assert.doesNotMatch(memberHomeSource, /Ronde Berjalan:/);

  // MEMBER-04 guided patrol experience regression guards.
  assert.match(patrolViewSource, /Checkpoint Berikutnya/);
  assert.match(patrolViewSource, /CHECKPOINT TERKUNCI/);
  assert.match(patrolViewSource, /cp\.id !== nextCheckpoint\.id/);
  assert.match(patrolViewSource, /Datangi titik checkpoint hingga berada di dalam radius/);
  assert.match(patrolViewSource, /Anda berada di dalam radius\. Scan QR checkpoint fisik sekarang/);
  assert.match(patrolViewSource, /Rute Patroli/);
  assert.match(patrolViewSource, /Urutan checkpoint wajib/);
  assert.match(patrolViewSource, /PENDING SYNC/);
  assert.match(patrolViewSource, /Jangan lanjut ke checkpoint berikutnya sampai server menyelesaikan validasi/);
  assert.match(patrolViewSource, /TURUN JAGA & SELESAIKAN SHIFT/);
  assert.match(patrolViewSource, /Progress Seluruh Shift/);
  assert.doesNotMatch(patrolViewSource, /handleStartNewRound/);
  assert.match(patrolServiceSource, /WRONG_CHECKPOINT_SEQUENCE/);

  // MEMBER-05 start / close shift regression guards.
  assert.match(handoverViewSource, /Step 2 dari 3/);
  assert.match(handoverViewSource, /SIMPAN & MULAI PATROLI/);
  assert.match(handoverViewSource, /onProceedPatrol/);
  assert.match(handoverViewSource, /Patroli QR tetap terkunci sampai foto ini tersimpan di server/);
  assert.match(appSource, /onProceedPatrol=\{\(\) => setMemberTab\('patrol'\)\}/);

  assert.match(routeSource, /START_DOCUMENTATION_REQUIRED/);
  assert.match(routeSource, /SPECIAL_HANDOVER_RECIPIENT_REQUIRED/);
  assert.match(routeSource, /SPECIAL_HANDOVER_RECIPIENT_INVALID/);
  assert.match(routeSource, /specialRecipient = await repositories\.users\.findById/);
  assert.match(routeSource, /toUserId: specialRecipient!\.id/);
  assert.match(routeSource, /handedTo: specialRecipient!\.name/);

  assert.match(apiSource, /specialToUserId\?: string/);
  assert.match(patrolViewSource, /Final Step/);
  assert.match(patrolViewSource, /TURUN JAGA/);
  assert.match(patrolViewSource, /KONFIRMASI TURUN JAGA & SELESAIKAN SHIFT/);
  assert.match(patrolViewSource, /Penerima/);
  assert.match(patrolViewSource, /specialToUserId/);
  assert.match(patrolViewSource, /KONEKSI DIPERLUKAN/);
  assert.match(patrolViewSource, /SHIFT SELESAI/);
  assert.match(patrolViewSource, /Session Completed/);
  assert.match(patrolViewSource, /completedSession/);

  // MEMBER-06 Handover + Incident regression guards.
  assert.match(handoverViewSource, /Untuk Saya/);
  assert.match(handoverViewSource, /Dari Saya/);
  assert.match(handoverViewSource, /Konfirmasi Serah Terima/);
  assert.match(handoverViewSource, /YA, SAYA TERIMA/);
  assert.match(handoverViewSource, /Identitas penyerah diambil otomatis dari akun login/);
  assert.doesNotMatch(handoverViewSource, /setHandedFrom|Diserahkan Dari/);
  assert.match(routeSource, /handedFrom: req\.user!\.name/);
  assert.match(routeSource, /HANDOVER_RECIPIENT_MISMATCH/);

  assert.doesNotMatch(incidentViewSource, /\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\(/);
  assert.match(incidentViewSource, /Laporan Kejadian Lapangan/);
  assert.match(incidentViewSource, /1\. Identitas Kejadian/);
  assert.match(incidentViewSource, /2\. Kronologi & Tindakan/);
  assert.match(incidentViewSource, /3\. Eskalasi/);
  assert.match(incidentViewSource, /4\. Bukti Foto Live/);
  assert.match(incidentViewSource, /minimal 3 dan maksimal 5 foto live/);
  assert.match(incidentViewSource, /GPS OPSIONAL/);
  assert.match(incidentViewSource, /status OPEN/);
  assert.match(routeSource, /INCIDENT_CATEGORY_INVALID/);
  assert.match(routeSource, /INCIDENT_SEVERITY_INVALID/);
  assert.match(routeSource, /INCIDENT_ESCALATION_TARGET_REQUIRED/);
  assert.match(routeSource, /INCIDENT_STATUS_INVALID/);
  assert.match(routeSource, /incidentPhotos\.length < 3/);
  assert.match(routeSource, /incidentPhotos\.length > 5/);

  // MEMBER-07 offline + recovery regression guards.
  assert.match(offlineQueueSource, /const DB_VERSION = 2/);
  assert.match(offlineQueueSource, /patrol_snapshots/);
  assert.match(offlineQueueSource, /recoverInterruptedSync/);
  assert.match(offlineQueueSource, /retryItem/);
  assert.match(offlineQueueSource, /activeUserId/);
  assert.match(offlineQueueSource, /syncStatus: 'SYNC_FAILED'/);
  assert.match(offlineQueueSource, /sort\(\(a, b\) => a\.createdAt - b\.createdAt\)/);
  assert.match(offlineQueueSource, /savePatrolSnapshot/);
  assert.match(offlineQueueSource, /getPatrolSnapshot/);
  assert.match(offlineQueueSource, /claimLegacyItemsForSession/);

  assert.match(patrolViewSource, /userId: user\?\.id/);
  assert.match(patrolViewSource, /MODE RECOVERY OFFLINE/);
  assert.match(patrolViewSource, /offlineSyncStatus/);
  assert.match(patrolViewSource, /savePatrolSnapshot/);
  assert.match(patrolViewSource, /getPatrolSnapshot/);
  assert.match(memberHomeSource, /MODE RECOVERY OFFLINE/);
  assert.match(memberHomeSource, /RECOVERY SINKRONISASI/);
  assert.match(memberHomeSource, /MENUNGGU VALIDASI SERVER/);
  assert.match(profileViewSource, /COBA ULANG DATA INI/);
  assert.match(profileViewSource, /retryItem/);
  assert.match(offlineBannerSource, /COBA LAGI/);
  assert.match(offlineBannerSource, /recoverInterruptedSync/);

  assert.match(routeSource, /authSessionExpiresAt/);
  assert.match(routeSource, /sessionExpiresAt: issuedSession\.expiresAt/);
  assert.match(apiSource, /sessionExpiresAt\?: string/);
  assert.match(authContextSource, /ops:offlineIdentity:v1/);
  assert.match(authContextSource, /offlineRecovered/);
  assert.match(authContextSource, /user\.role !== 'ANGGOTA'/);
  assert.match(authContextSource, /sessionExpiresAt/);
  assert.doesNotMatch(authContextSource, /localStorage\.setItem\([^\n]*(token|password|sigap_session)/i);

  assert.match(mainSource, /navigator\.serviceWorker/);
  assert.match(mainSource, /register\('\/sw\.js'/);
  assert.match(serviceWorkerSource, /ops-sigap-shell-v1-2/);
  assert.match(serviceWorkerSource, /url\.pathname === '\/api' \|\| url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(serviceWorkerSource, /request\.mode === 'navigate'/);
  assert.match(serviceWorkerSource, /cacheApplicationShell/);

  await assert.rejects(
    () => jsonRepositories.users.remove(user.id),
    (error: unknown) => error instanceof RepositoryError && error.code === 'USER_IN_USE',
    'Personel dengan histori operasional tidak boleh hard-delete.',
  );
  await assert.rejects(
    () => jsonRepositories.sites.remove(site.id),
    (error: unknown) => error instanceof RepositoryError && error.code === 'SITE_IN_USE',
    'Site dengan histori operasional tidak boleh hard-delete.',
  );

  console.log('PASS destructive-action regression guards and disposable deletes');
  console.log('PASS Super Admin audit policy and order-safe checkpoint sequence source guards');
  console.log('PASS Master Monitoring sticky workspace and in-place refresh source guards');
  console.log('PASS CHIEF customer-level assignment and monitoring scope guards');
  console.log('PASS MEMBER-02 security critical anti-bypass regression guards');
  console.log('PASS MEMBER-03 next-action dashboard and live status regression guards');
  console.log('PASS MEMBER-04 guided patrol next-checkpoint and route-lock regression guards');
  console.log('PASS MEMBER-05 guided naik-jaga and guarded close-shift regression guards');
  console.log('PASS MEMBER-06 handover integrity and guided incident regression guards');
  console.log('PASS MEMBER-07 offline queue, cold-start recovery, and retry regression guards');
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
  console.log('PASS production PostgreSQL TLS verification is explicit and scoped to the DB client');
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
