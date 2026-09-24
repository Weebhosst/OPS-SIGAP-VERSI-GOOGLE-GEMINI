import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-sigap-security-'));
const temporaryDatabase = path.join(temporaryDirectory, 'ops-sigap.json');
fs.copyFileSync(path.resolve('data/ops-sigap.json'), temporaryDatabase);

process.env.DATABASE_PROVIDER = 'json';
process.env.NODE_ENV = 'test';
process.env.OPS_SIGAP_DATA_FILE = temporaryDatabase;
process.env.SESSION_TTL_HOURS = '1';

let server: ReturnType<express.Express['listen']> | undefined;

try {
  const { repositories } = await import('./repositories');
  const sitePage = await repositories.sites.list({ limit: 1, offset: 0 });
  const site = sitePage.items[0];
  assert.ok(site, 'Security test fixture requires one site.');

  const now = new Date().toISOString();
  const npk = `SEC${Date.now().toString().slice(-6)}`;
  const temporaryPassword = 'TempPass123';
  const user = await repositories.users.create({
    id: `USR-SEC-${Date.now()}`,
    name: 'Security Integration User',
    npk,
    email: `${npk}@security.test`,
    role: 'ANGGOTA',
    customerId: site.customerId,
    siteId: site.id,
    position: 'ANGGOTA SECURITY',
    assignmentHistory: [{
      customerId: site.customerId,
      siteId: site.id,
      effectiveAt: now,
      changedBy: null,
    }],
    status: 'ACTIVE',
    passwordHash: bcrypt.hashSync(temporaryPassword, 4),
    createdAt: now,
    updatedAt: now,
  });

  const { apiRouter } = await import('./routes');
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api', apiRouter);

  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', () => resolve()));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}/api`;

  const loginResponse = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ npk, password: temporaryPassword }),
  });
  assert.equal(loginResponse.status, 200);
  const loginBody = await loginResponse.json() as any;
  assert.equal(loginBody.success, true);
  assert.equal(loginBody.user.id, user.id);
  assert.equal(loginBody.user.mustChangePassword, true, 'Legacy/unrotated password must require rotation.');
  assert.equal('token' in loginBody, false, 'Login response must not expose session bearer token.');

  const setCookie = loginResponse.headers.get('set-cookie') || '';
  assert.match(setCookie, /sigap_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';')[0];

  const meResponse = await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(meResponse.status, 200);

  const blockedResponse = await fetch(`${base}/patrol/current`, { headers: { Cookie: cookie } });
  assert.equal(blockedResponse.status, 403);
  const blockedBody = await blockedResponse.json() as any;
  assert.equal(blockedBody.code, 'PASSWORD_CHANGE_REQUIRED');

  const changeResponse = await fetch(`${base}/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: 'SecurePass456' }),
  });
  assert.equal(changeResponse.status, 200);
  const changeBody = await changeResponse.json() as any;
  assert.equal(changeBody.user.mustChangePassword, false);

  const currentResponse = await fetch(`${base}/patrol/current`, { headers: { Cookie: cookie } });
  assert.equal(currentResponse.status, 200, 'Workspace API should unlock after password rotation.');

  const logoutResponse = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logoutResponse.status, 200);

  const revokedResponse = await fetch(`${base}/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(revokedResponse.status, 401, 'Logout must revoke the server-side session.');

  console.log('PASS login uses HttpOnly SameSite=Strict cookie without browser bearer token');
  console.log('PASS unrotated accounts are forced through password change');
  console.log('PASS workspace remains blocked until password rotation completes');
  console.log('PASS logout revokes the server-side session');
} finally {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
