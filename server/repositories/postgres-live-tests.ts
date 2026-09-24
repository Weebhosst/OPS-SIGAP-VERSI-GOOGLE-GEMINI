import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

if (process.env.DATABASE_PROVIDER !== 'postgres') {
  throw new Error('test:postgres wajib dijalankan dengan DATABASE_PROVIDER=postgres');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL wajib tersedia untuk PostgreSQL integration test');
}
if (!process.env.CHECKPOINT_TOKEN_SECRET) {
  throw new Error('CHECKPOINT_TOKEN_SECRET wajib tersedia untuk PostgreSQL integration test');
}

const { runMigrations } = await import('../db/migrate');
const { importJsonDatabase } = await import('../db/importJson');
const { repositories } = await import('./index');
const { RepositoryError } = await import('./contracts');
const { closePostgresPool } = await import('../db/postgres');

const now = new Date().toISOString();
const suffix = Date.now().toString(36).toUpperCase();

try {
  const firstMigration = await runMigrations();
  assert.ok(firstMigration.applied.length >= 3, 'Fresh PostgreSQL harus menerapkan seluruh migration.');

  const secondMigration = await runMigrations();
  assert.equal(secondMigration.applied.length, 0, 'Migration kedua harus idempotent.');
  assert.ok(secondMigration.skipped.length >= 3, 'Migration kedua harus men-skip migration yang sudah diterapkan.');

  const firstImport = await importJsonDatabase();
  for (const [name, result] of Object.entries(firstImport)) {
    assert.equal(result.failed, 0, `Import pertama ${name} tidak boleh gagal.`);
  }

  const secondImport = await importJsonDatabase();
  for (const [name, result] of Object.entries(secondImport)) {
    assert.equal(result.failed, 0, `Import kedua ${name} tidak boleh gagal.`);
    if (result.source > 0) {
      assert.equal(result.inserted, 0, `Import kedua ${name} harus idempotent.`);
    }
  }

  const health = await repositories.health();
  assert.deepEqual(health, { provider: 'postgres', database: 'connected' });

  const importedUsers = await repositories.users.list({ limit: 1, offset: 0 });
  const importedSites = await repositories.sites.list({ limit: 1, offset: 0 });
  const importedCheckpoints = await repositories.checkpoints.list({ limit: 1, offset: 0 });
  assert.ok(importedUsers.total > 0, 'JSON import harus menghasilkan user di PostgreSQL.');
  assert.ok(importedSites.total > 0, 'JSON import harus menghasilkan site di PostgreSQL.');
  assert.ok(importedCheckpoints.total > 0, 'JSON import harus menghasilkan checkpoint di PostgreSQL.');

  const customerId = `CUST-PG-${suffix}`;
  const siteId = `SITE-PG-${suffix}`;
  const userOneId = `USR-PG-A-${suffix}`;
  const userTwoId = `USR-PG-B-${suffix}`;
  const checkpointId = `${siteId}-CP01`;

  const customer = await repositories.customers.create({
    id: customerId,
    code: `PG${suffix.slice(-6)}`,
    name: 'PostgreSQL Integration Customer',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  assert.equal((await repositories.customers.findById(customer.id))?.id, customer.id);

  const site = await repositories.sites.create({
    id: siteId,
    code: siteId,
    name: 'PostgreSQL Integration Site',
    customerId,
    personnelCapacity: 1,
    targetRoundsPerShift: 1,
    timezone: 'Asia/Jakarta',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  assert.equal((await repositories.sites.findById(site.id))?.personnelCapacity, 1);

  const createTestUser = async (id: string, npk: string) => repositories.users.create({
    id,
    name: id,
    npk,
    email: `${npk}@integration.local`,
    role: 'ANGGOTA',
    customerId,
    siteId,
    position: 'ANGGOTA SECURITY',
    assignmentHistory: [{ customerId, siteId, effectiveAt: now, changedBy: null }],
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync(npk, 4),
    createdAt: now,
    updatedAt: now,
  });

  const userOne = await createTestUser(userOneId, `91${suffix.slice(-6)}1`);
  const userTwo = await createTestUser(userTwoId, `91${suffix.slice(-6)}2`);
  assert.equal((await repositories.users.findById(userOne.id))?.siteId, siteId);

  const authTokenHash = `AUTH-HASH-${suffix}`;
  const authSession = await repositories.authSessions.create({
    id: `AUTH-PG-${suffix}`,
    tokenHash: authTokenHash,
    userId: userOne.id,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
    ipAddress: '127.0.0.1',
    userAgent: 'postgres-live-test',
  });
  assert.equal((await repositories.authSessions.findActiveByTokenHash(authTokenHash, now))?.id, authSession.id);
  await repositories.authSessions.touch(authSession.id, new Date().toISOString());

  const resetUser = await repositories.users.resetPassword(userTwo.id, bcrypt.hashSync(userTwo.npk, 4), new Date().toISOString());
  assert.equal(resetUser?.mustChangePassword, true, 'Reset password harus memaksa rotasi password.');
  const changedUser = await repositories.users.changePassword(userTwo.id, bcrypt.hashSync('SecureTest123', 4), new Date().toISOString());
  assert.equal(changedUser?.mustChangePassword, false, 'Change password harus menyelesaikan rotasi password.');

  await repositories.authSessions.revokeByTokenHash(authTokenHash, new Date().toISOString());
  assert.equal(await repositories.authSessions.findActiveByTokenHash(authTokenHash, new Date().toISOString()), undefined);

  const checkpoint = await repositories.checkpoints.create({
    id: checkpointId,
    siteId,
    code: 'CP01',
    name: 'Integration Checkpoint',
    latitude: -6.5,
    longitude: 107.6,
    radiusMeters: 20,
    coordinateMethod: 'MANUAL',
    qrToken: '',
    status: 'ACTIVE',
    qrStatus: 'INACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  const plainToken = `PG-TOKEN-${suffix}`;
  const tokenCheckpoint = await repositories.checkpoints.replaceToken(checkpoint.id, plainToken, userOne.id, true);
  assert.equal(tokenCheckpoint?.qrToken, plainToken, 'Token QR harus dapat didekripsi setelah disimpan.');
  assert.equal((await repositories.checkpoints.findById(checkpoint.id))?.qrToken, plainToken, 'Token QR harus tetap tersedia setelah query baru.');
  assert.equal((await repositories.checkpoints.findByToken(plainToken))?.id, checkpoint.id, 'Hash lookup token QR harus menemukan checkpoint.');

  const sessionOne = await repositories.sessions.startAtomic({
    personnelCapacity: 1,
    session: {
      id: `SES-PG-A-${suffix}`,
      userId: userOne.id,
      npk: userOne.npk,
      customerId,
      siteId,
      shiftCode: 'SHIFT_1',
      shiftDate: now.slice(0, 10),
      startedAt: now,
      status: 'ACTIVE',
      totalRequired: 1,
      totalValid: 0,
      completionPct: 0,
      startDocumentationCompleted: true,
      endDocumentationCompleted: false,
      forceClosed: false,
      createdAt: now,
      updatedAt: now,
    },
  });

  await assert.rejects(
    () => repositories.sessions.startAtomic({
      personnelCapacity: 1,
      session: {
        ...sessionOne,
        id: `SES-PG-B-${suffix}`,
        userId: userTwo.id,
        npk: userTwo.npk,
      },
    }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'SITE_CAPACITY_FULL',
    'Capacity 1 harus menolak sesi aktif kedua.',
  );

  await assert.rejects(
    () => repositories.sites.update(siteId, { personnelCapacity: 0 }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'SITE_CAPACITY_BELOW_ACTIVE',
    'Site capacity tidak boleh diturunkan di bawah session aktif.',
  );

  const validLog = await repositories.patrol.addLogAtomic({
    id: `LOG-PG-VALID-${suffix}`,
    sessionId: sessionOne.id,
    checkpointId: checkpoint.id,
    userId: userOne.id,
    siteId,
    roundNumber: 1,
    validationStatus: 'VALID',
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    calculatedDistanceM: 0,
    observationStatus: 'AMAN',
    clientCapturedAt: now,
    serverReceivedAt: now,
    syncSource: 'ONLINE',
    createdAt: now,
  });
  assert.equal(validLog.validationStatus, 'VALID');

  await assert.rejects(
    () => repositories.patrol.addLogAtomic({
      ...validLog,
      id: `LOG-PG-DUP-${suffix}`,
    }),
    (error: unknown) => error instanceof RepositoryError && error.code === 'DUPLICATE_CHECKPOINT',
    'Unique valid checkpoint per session/round harus aktif.',
  );

  const reviewLog = await repositories.patrol.addLogAtomic({
    ...validLog,
    id: `LOG-PG-REVIEW-${suffix}`,
    checkpointId: 'UNKNOWN',
    validationStatus: 'REVIEW',
    rejectionReason: 'GPS_LOW_ACCURACY',
    rejectionMessage: 'Integration review',
  });
  const alert = (await repositories.alerts.list('OPEN', { limit: 100, offset: 0 }))
    .items.find((item) => item.patrolLogId === reviewLog.id);
  assert.ok(alert, 'REVIEW log harus membuat validation alert.');
  assert.equal((await repositories.alerts.transition(alert!.id, 'REVIEW', userOne.id)).status, 'UNDER_REVIEW');
  assert.equal((await repositories.alerts.transition(alert!.id, 'CLOSE', userOne.id, 'Integration verified')).status, 'CLOSED');
  assert.equal((await repositories.alerts.transition(alert!.id, 'REOPEN', userOne.id)).status, 'OPEN');

  const handoverId = `HND-PG-${suffix}`;
  await repositories.handovers.create({
    id: handoverId,
    sessionId: sessionOne.id,
    siteId,
    shiftDate: sessionOne.shiftDate,
    shiftCode: sessionOne.shiftCode,
    handoverType: 'SERAH_TERIMA',
    fromUserId: userOne.id,
    toUserId: userTwo.id,
    eventAt: now,
    itemName: 'Radio HT',
    itemQuantity: '1',
    itemCondition: 'BAIK',
    handedFrom: userOne.name,
    handedTo: userTwo.name,
    conditionStatus: 'BAIK',
    personnelStatus: 'Lengkap',
    equipmentStatus: 'Baik',
    keysStatus: 'Baik',
    vehicleStatus: 'Baik',
    ackFrom: true,
    ackTo: false,
    status: 'SUBMITTED',
    createdBy: userOne.id,
    createdAt: now,
    updatedAt: now,
  });

  const handoverMediaUrl = 'https://example.invalid/handover.jpg';
  await repositories.media.add({
    id: `MED-PG-HND-${suffix}`,
    sourceModule: 'HANDOVER',
    sourceTable: 'shift_handovers',
    sourceId: handoverId,
    siteId,
    userId: userOne.id,
    shiftDate: sessionOne.shiftDate,
    shiftCode: sessionOne.shiftCode,
    category: 'SERAH TERIMA BARANG',
    documentType: 'SERAH_TERIMA_BARANG',
    photoUrl: handoverMediaUrl,
    caption: 'Integration handover evidence',
    eventAt: now,
    handoverId,
    status: 'ACTIVE',
    createdAt: now,
    createdBy: userOne.id,
  }, sessionOne.id, customerId);
  assert.equal((await repositories.handovers.findById(handoverId))?.photoUrls?.includes(handoverMediaUrl), true);

  const incidentId = `INC-PG-${suffix}`;
  await repositories.incidents.create({
    id: incidentId,
    sessionId: sessionOne.id,
    customerId,
    siteId,
    userId: userOne.id,
    incidentAt: now,
    shiftCode: sessionOne.shiftCode,
    shiftDate: sessionOne.shiftDate,
    category: 'INSIDENTIL',
    severity: 'RENDAH',
    title: 'PostgreSQL integration incident',
    locationText: 'Integration area',
    chronology: 'Repository integration test',
    initialAction: 'Verified',
    status: 'OPEN',
    escalated: false,
    createdBy: userOne.id,
    createdAt: now,
    updatedAt: now,
  });

  const incidentMediaUrl = 'https://example.invalid/incident.jpg';
  await repositories.media.add({
    id: `MED-PG-INC-${suffix}`,
    sourceModule: 'INCIDENT',
    sourceTable: 'incident_reports',
    sourceId: incidentId,
    siteId,
    userId: userOne.id,
    shiftDate: sessionOne.shiftDate,
    shiftCode: sessionOne.shiftCode,
    category: 'INSIDEN',
    documentType: 'INSIDEN',
    photoUrl: incidentMediaUrl,
    caption: 'Integration incident evidence',
    eventAt: now,
    incidentId,
    status: 'ACTIVE',
    createdAt: now,
    createdBy: userOne.id,
  }, sessionOne.id, customerId);
  assert.equal((await repositories.incidents.findById(incidentId))?.photoUrls?.includes(incidentMediaUrl), true);

  await assert.rejects(
    () => repositories.media.add({
      id: `MED-PG-BASE64-${suffix}`,
      sourceModule: 'PATROL',
      sourceTable: 'patrol_logs',
      sourceId: validLog.id,
      siteId,
      userId: userOne.id,
      shiftDate: sessionOne.shiftDate,
      shiftCode: sessionOne.shiftCode,
      category: 'PATROLI_QR',
      documentType: 'PATROLI_QR',
      photoUrl: 'data:image/jpeg;base64,AAAA',
      caption: 'Must be rejected',
      eventAt: now,
      checkpointId: checkpoint.id,
      status: 'ACTIVE',
      createdAt: now,
      createdBy: userOne.id,
    }, sessionOne.id, customerId),
    (error: unknown) => error instanceof RepositoryError && error.code === 'MEDIA_STORAGE_NOT_READY',
    'PostgreSQL tidak boleh menyimpan binary/base64 media.',
  );

  const filterState = await repositories.adminState.set(userOne.id, {
    siteId,
    shiftCode: 'SHIFT_1',
    memberUserId: userOne.id,
  });
  assert.equal(filterState.siteId, siteId);
  assert.equal((await repositories.adminState.get(userOne.id))?.memberUserId, userOne.id);

  const calibration = await repositories.radiusCalibrations.create({
    id: `CAL-PG-${suffix}`,
    siteId,
    checkpointId: checkpoint.id,
    testedByUserId: userOne.id,
    testedAt: now,
    latitude: checkpoint.latitude,
    longitude: checkpoint.longitude,
    gpsAccuracyM: 5,
    calculatedDistanceM: 0,
    configuredRadiusM: checkpoint.radiusMeters,
    verdict: 'VALID',
    deviceModel: 'CI',
    notes: 'PostgreSQL integration test',
    createdAt: now,
  });
  assert.equal(
    (await repositories.radiusCalibrations.list({ limit: 100, offset: 0 })).items.some((item) => item.id === calibration.id),
    true,
  );

  const forced = await repositories.sessions.forceCloseAtomic(sessionOne.id, userOne.id, 'ADMIN', 'Integration cleanup');
  assert.equal(forced.status, 'FORCE_CLOSED');

  const sessionTwo = await repositories.sessions.startAtomic({
    personnelCapacity: 1,
    session: {
      ...sessionOne,
      id: `SES-PG-B-${suffix}`,
      userId: userTwo.id,
      npk: userTwo.npk,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });
  assert.equal(sessionTwo.status, 'ACTIVE', 'Setelah force close, slot capacity harus tersedia kembali.');

  console.log('PASS PostgreSQL migrations apply and are idempotent');
  console.log('PASS JSON -> PostgreSQL live import and idempotency');
  console.log('PASS PostgreSQL provider health and imported data visibility');
  console.log('PASS PostgreSQL customer/site/user/checkpoint CRUD');
  console.log('PASS PostgreSQL authenticated session persistence and password rotation');
  console.log('PASS encrypted QR token persistence and hash lookup');
  console.log('PASS PostgreSQL active-session uniqueness and site capacity');
  console.log('PASS PostgreSQL checkpoint uniqueness and validation alert workflow');
  console.log('PASS PostgreSQL handover/incident media relations');
  console.log('PASS PostgreSQL base64 media safety gate');
  console.log('PASS PostgreSQL admin filter state and radius calibration');
  console.log('PASS PostgreSQL force-close releases site capacity');
} finally {
  await closePostgresPool();
}
