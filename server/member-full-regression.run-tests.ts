import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sigap-member-full-'));
const temporaryDatabase = path.join(temporaryDirectory, 'ops-sigap.json');
fs.copyFileSync(path.resolve('data/ops-sigap.json'), temporaryDatabase);

process.env.DATABASE_PROVIDER = 'json';
process.env.NODE_ENV = 'test';
process.env.OPS_SIGAP_DATA_FILE = temporaryDatabase;
process.env.SESSION_TTL_HOURS = '1';

const LIVE_JPEG = 'data:image/jpeg;base64,/9j/';
let server: ReturnType<express.Express['listen']> | undefined;

try {
  const { repositories } = await import('./repositories');
  const suffix = Date.now().toString(36).toUpperCase();
  const now = new Date().toISOString();

  const customer = await repositories.customers.create({
    id: `CUST-M10-${suffix}`,
    code: `M10${suffix.slice(-5)}`,
    name: 'MEMBER-10 Disposable Customer',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  const site = await repositories.sites.create({
    id: `SITE-M10-${suffix}`,
    code: `M10-SITE-${suffix.slice(-5)}`,
    name: 'MEMBER-10 Disposable Site',
    customerId: customer.id,
    personnelCapacity: 3,
    targetRoundsPerShift: 1,
    timezone: 'Asia/Jakarta',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });

  const checkpoint = await repositories.checkpoints.create({
    id: `${site.id}-CP01`,
    siteId: site.id,
    code: 'CP01',
    name: 'MEMBER-10 Checkpoint',
    latitude: -6.500001,
    longitude: 107.600001,
    radiusMeters: 25,
    coordinateMethod: 'MANUAL',
    qrToken: '',
    status: 'ACTIVE',
    qrStatus: 'INACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  const qrToken = `M10-TOKEN-${suffix}`;

  const createUser = async (
    id: string,
    npk: string,
    name: string,
    role: 'ANGGOTA' | 'CHIEF',
    password: string,
  ) => repositories.users.create({
    id,
    name,
    npk,
    email: `${npk.toLowerCase()}@member10.test`,
    role,
    customerId: customer.id,
    siteId: role === 'ANGGOTA' ? site.id : null,
    position: role,
    assignmentHistory: [{
      customerId: customer.id,
      siteId: role === 'ANGGOTA' ? site.id : null,
      effectiveAt: now,
      changedBy: null,
    }],
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync(password, 4),
    mustChangePassword: false,
    passwordChangedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const memberAPassword = 'MemberA-Secure-456';
  const memberBPassword = 'MemberB-Secure-456';
  const chiefPassword = 'Chief-Secure-456';

  const memberA = await createUser(
    `USR-M10-A-${suffix}`,
    `M10A${suffix.slice(-6)}`,
    'MEMBER-10 Anggota A',
    'ANGGOTA',
    memberAPassword,
  );
  const memberB = await createUser(
    `USR-M10-B-${suffix}`,
    `M10B${suffix.slice(-6)}`,
    'MEMBER-10 Anggota B',
    'ANGGOTA',
    memberBPassword,
  );
  const chief = await createUser(
    `USR-M10-C-${suffix}`,
    `M10C${suffix.slice(-6)}`,
    'MEMBER-10 Chief',
    'CHIEF',
    chiefPassword,
  );

  await repositories.checkpoints.replaceToken(checkpoint.id, qrToken, memberA.id, true);

  const { apiRouter } = await import('./routes');
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}/api`;

  const login = async (npk: string, password: string) => {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ npk, password }),
    });
    assert.equal(response.status, 200, `Login ${npk} harus berhasil.`);
    const body = await response.json() as any;
    assert.equal(body.success, true);
    assert.equal(body.user.mustChangePassword, false);
    assert.ok(body.sessionExpiresAt, 'Login harus mengembalikan session expiry metadata.');
    const setCookie = response.headers.get('set-cookie') || '';
    assert.match(setCookie, /sigap_session=/);
    return setCookie.split(';')[0];
  };

  const jsonRequest = async (
    url: string,
    cookie: string,
    init: RequestInit = {},
  ) => {
    const response = await fetch(`${base}${url}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Cookie: cookie,
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({})) as any;
    return { response, body };
  };

  const cookieA = await login(memberA.npk, memberAPassword);
  const cookieB = await login(memberB.npk, memberBPassword);
  const cookieChief = await login(chief.npk, chiefPassword);

  // Role boundary: CHIEF is monitoring-only for member field writes.
  {
    const { response } = await jsonRequest('/patrol/session/start', cookieChief, { method: 'POST', body: '{}' });
    assert.equal(response.status, 403);
  }

  // Role boundary: ANGGOTA cannot access Super Admin audit.
  {
    const { response } = await jsonRequest('/admin/audit-logs', cookieA);
    assert.equal(response.status, 403);
  }

  // Start one ACTIVE session.
  const started = await jsonRequest('/patrol/session/start', cookieA, {
    method: 'POST',
    body: '{}',
  });
  assert.equal(started.response.status, 200);
  assert.equal(started.body.session.status, 'ACTIVE');
  assert.equal(started.body.session.totalRequired, 1);
  const sessionId = String(started.body.session.id);

  // Duplicate session is blocked.
  {
    const duplicate = await jsonRequest('/patrol/session/start', cookieA, { method: 'POST', body: '{}' });
    assert.equal(duplicate.response.status, 400);
    assert.equal(duplicate.body.code, 'USER_ALREADY_HAS_ACTIVE_SESSION');
  }

  // Patrol is not allowed before Naik Jaga.
  {
    const beforeStartDoc = await jsonRequest('/patrol/scan', cookieA, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        qrToken,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        gpsAccuracyM: 5,
        photoUrl: LIVE_JPEG,
        observationStatus: 'AMAN',
        clientCapturedAt: new Date().toISOString(),
        idempotencyId: `M10-BEFORE-DOC-${suffix}`,
      }),
    });
    assert.equal(beforeStartDoc.response.status, 200);
    assert.equal(beforeStartDoc.body.status, 'REJECTED');
    assert.equal(beforeStartDoc.body.rejectionReason, 'START_DOCUMENTATION_REQUIRED');
  }

  // Naik Jaga unlocks field operation.
  const startDoc = await jsonRequest(`/patrol/session/${sessionId}/start-documentation`, cookieA, {
    method: 'POST',
    body: JSON.stringify({ photoUrl: LIVE_JPEG }),
  });
  assert.equal(startDoc.response.status, 200);
  assert.equal(startDoc.body.session.startDocumentationCompleted, true);

  // Recipient directory is same-site ANGGOTA only, excluding sender.
  {
    const directory = await jsonRequest('/field/site-members', cookieA);
    assert.equal(directory.response.status, 200);
    assert.equal(directory.body.members.some((item: any) => item.id === memberB.id), true);
    assert.equal(directory.body.members.some((item: any) => item.id === memberA.id), false);
    assert.equal(directory.body.members.some((item: any) => item.id === chief.id), false);
  }

  // Handover create uses verified sender/recipient and live evidence.
  const handoverCreate = await jsonRequest('/handover', cookieA, {
    method: 'POST',
    body: JSON.stringify({
      handoverType: 'SERAH_TERIMA',
      toUserId: memberB.id,
      itemName: 'Radio HT Test',
      itemQuantity: '1',
      itemCondition: 'BAIK',
      conditionStatus: 'BAIK',
      photoUrls: [LIVE_JPEG],
      handoverNotes: 'MEMBER-10 handover',
    }),
  });
  assert.equal(handoverCreate.response.status, 200);
  assert.equal(handoverCreate.body.handover.fromUserId, memberA.id);
  assert.equal(handoverCreate.body.handover.toUserId, memberB.id);
  assert.equal(handoverCreate.body.handover.handedFrom, memberA.name);
  assert.equal(handoverCreate.body.handover.status, 'SUBMITTED');
  const handoverId = String(handoverCreate.body.handover.id);

  // Wrong user/sender cannot ACK their own handover.
  {
    const wrongAck = await jsonRequest(`/handover/${handoverId}/ack`, cookieA, { method: 'POST', body: '{}' });
    assert.equal(wrongAck.response.status, 403);
    assert.equal(wrongAck.body.code, 'HANDOVER_RECIPIENT_MISMATCH');
  }

  // Assigned recipient can ACK.
  {
    const ack = await jsonRequest(`/handover/${handoverId}/ack`, cookieB, { method: 'POST', body: '{}' });
    assert.equal(ack.response.status, 200);
    assert.equal(ack.body.handover.status, 'ACKNOWLEDGED');
    assert.equal(ack.body.handover.ackTo, true);
  }

  // Incident requires active shift and stores 3 live photos.
  const incidentCreate = await jsonRequest('/incidents', cookieA, {
    method: 'POST',
    body: JSON.stringify({
      category: 'KEAMANAN',
      severity: 'SEDANG',
      title: 'MEMBER-10 Incident',
      locationText: 'Disposable Checkpoint Area',
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      chronology: 'Integration regression chronology.',
      initialAction: 'Area diamankan dan dilaporkan.',
      photoUrls: [LIVE_JPEG, LIVE_JPEG, LIVE_JPEG],
      escalated: false,
    }),
  });
  assert.equal(incidentCreate.response.status, 200);
  assert.equal(incidentCreate.body.incident.status, 'OPEN');
  assert.equal(incidentCreate.body.incident.userId, memberA.id);

  // Valid patrol scan completes the only required checkpoint.
  const scan = await jsonRequest('/patrol/scan', cookieA, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      qrToken,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      gpsAccuracyM: 5,
      photoUrl: LIVE_JPEG,
      observationStatus: 'AMAN',
      notes: 'MEMBER-10 valid patrol',
      clientCapturedAt: new Date().toISOString(),
      idempotencyId: `M10-SCAN-${suffix}`,
    }),
  });
  assert.equal(scan.response.status, 200);
  assert.equal(scan.body.status, 'VALID');
  assert.equal(scan.body.totalValid, 1);
  assert.equal(scan.body.totalRequired, 1);

  // Idempotent replay returns the same result.
  {
    const replay = await jsonRequest('/patrol/scan', cookieA, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        qrToken,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        gpsAccuracyM: 5,
        photoUrl: LIVE_JPEG,
        observationStatus: 'AMAN',
        clientCapturedAt: new Date().toISOString(),
        idempotencyId: `M10-SCAN-${suffix}`,
      }),
    });
    assert.equal(replay.response.status, 200);
    assert.equal(replay.body.status, 'VALID');
  }

  // Gallery is scoped to the authenticated member and includes enriched source context.
  const galleryA = await jsonRequest('/gallery?limit=48', cookieA);
  assert.equal(galleryA.response.status, 200);
  assert.ok(galleryA.body.media.length >= 6, 'Member A harus memiliki evidence Naik Jaga, Handover, Incident, dan Patrol.');
  assert.ok(
    galleryA.body.media.some((item: any) =>
      item.sourceModule === 'PATROL'
      && item.sourceContext?.checkpointCode === 'CP01'
      && item.sourceContext?.validationStatus === 'VALID'
    ),
    'Gallery Patrol harus membawa sourceContext checkpoint dan VALID.',
  );
  assert.ok(
    galleryA.body.media.some((item: any) =>
      item.sourceModule === 'HANDOVER'
      && item.sourceContext?.handoverStatus === 'ACKNOWLEDGED'
      && item.sourceContext?.handedTo === memberB.name
    ),
    'Gallery Handover harus membawa status ACK dan penerima.',
  );
  assert.ok(
    galleryA.body.media.some((item: any) =>
      item.sourceModule === 'INCIDENT'
      && item.sourceContext?.incidentStatus === 'OPEN'
      && item.sourceContext?.incidentSeverity === 'SEDANG'
    ),
    'Gallery Incident harus membawa status dan severity.',
  );

  // Member B cannot use Gallery query parameters to read Member A evidence.
  {
    const galleryB = await jsonRequest(`/gallery?siteId=${encodeURIComponent(site.id)}&limit=48`, cookieB);
    assert.equal(galleryB.response.status, 200);
    assert.equal(
      galleryB.body.media.some((item: any) => item.userId === memberA.id),
      false,
      'Member B tidak boleh melihat evidence Member A melalui manipulasi query Site.',
    );
  }

  // CHIEF monitoring keeps customer scope and can see evidence without field-write permission.
  {
    const chiefGallery = await jsonRequest('/gallery?limit=48', cookieChief);
    assert.equal(chiefGallery.response.status, 200);
    assert.equal(chiefGallery.body.media.some((item: any) => item.userId === memberA.id), true);
  }

  // Close Shift requires completed patrol and live Turun Jaga evidence.
  const close = await jsonRequest(`/patrol/session/${sessionId}/close`, cookieA, {
    method: 'POST',
    body: JSON.stringify({
      endPhotoUrl: LIVE_JPEG,
      hasSpecialHandover: false,
    }),
  });
  assert.equal(close.response.status, 200);
  assert.equal(close.body.session.status, 'COMPLETED');
  assert.equal(close.body.session.endDocumentationCompleted, true);

  // Completed session disappears from active current session.
  {
    const current = await jsonRequest('/patrol/current', cookieA);
    assert.equal(current.response.status, 200);
    assert.equal(current.body.hasOpenSession, false);
    assert.equal(current.body.session, null);
  }

  // Completed session cannot accept another scan.
  {
    const afterClose = await jsonRequest('/patrol/scan', cookieA, {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        qrToken,
        latitude: checkpoint.latitude,
        longitude: checkpoint.longitude,
        gpsAccuracyM: 5,
        photoUrl: LIVE_JPEG,
        observationStatus: 'AMAN',
        idempotencyId: `M10-AFTER-CLOSE-${suffix}`,
      }),
    });
    assert.equal(afterClose.response.status, 200);
    assert.equal(afterClose.body.status, 'REJECTED');
    assert.equal(afterClose.body.rejectionReason, 'SESSION_NOT_OPEN');
  }

  console.log('PASS MEMBER-10 HTTP lifecycle: login -> session -> naik jaga -> patrol -> close');
  console.log('PASS MEMBER-10 Handover create + assigned recipient ACK');
  console.log('PASS MEMBER-10 Incident create with 3 live evidence photos');
  console.log('PASS MEMBER-10 Gallery member scope + enriched patrol/handover/incident context');
  console.log('PASS MEMBER-10 CHIEF monitoring allowed while field writes remain forbidden');
  console.log('PASS MEMBER-10 completed session cannot continue patrol operations');
} finally {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
