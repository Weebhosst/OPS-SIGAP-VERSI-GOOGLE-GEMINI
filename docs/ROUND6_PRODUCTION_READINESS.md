# Round 6 Production Readiness

This document tracks the production-readiness gates for OPS SIGAP after the validated Round 4A–5A baseline was merged to `main`.

## Baseline

- Main baseline: `13a1955733d584b584707b4766edfba1b39f12ed`
- Final integration PR: #6
- Main CI: `validate` PASS, `postgres-live` PASS
- Railway RC browser validation: login PASS, refresh persistence PASS, session survives redeploy PASS, Force Close PASS, live media upload PASS
- Round 6A source switch validation: Railway source is now `main`, deployment PASS, post-switch browser session persistence PASS

## Round 6A — Production Environment Freeze

### Current Railway state

- Project: `ops-sigap-development`
- Environment label: `production`
- Application service: `ops-sigap-app`
- PostgreSQL service: active with persistent volume
- Object storage bucket: `ops-sigap-media`
- Public Railway domain: active
- Build command: `npm run build`
- Pre-deploy: `npm run db:migrate && npm run test:media-storage-live`
- Healthcheck: `/api/health`
- Runtime: V2
- Region: application/PostgreSQL in SFO, bucket in SJC

### Confirmed production controls

- `DATABASE_PROVIDER=postgres`
- production runtime config is fail-closed
- PostgreSQL TLS handling is scoped to the PostgreSQL client
- HttpOnly server-side authentication sessions are persisted in PostgreSQL
- Railway S3 object PUT/GET/readiness/DELETE has passed
- recurring JSON import has been removed from pre-deploy
- no demo/quick-account switching UI remains

### Items to close before Production Freeze PASS

1. Railway source branch is now `main`; source-of-truth switch PASS. Post-switch deployment and browser session persistence also PASS.
2. Railway source currently has `checkSuites=false`; decide whether deployment should be gated by GitHub checks before automatic deploy.
3. Railway start command is `npx tsx server.ts`; this currently works, but production runtime still relies on `tsx` being installed from devDependencies. Harden before final go-live or explicitly accept this runtime model.
4. Legacy `R2_*` variable names remain alongside the active `MEDIA_*` Railway S3 configuration. Confirm whether they are obsolete, then remove only after verification.
5. No custom domain is configured. Railway domain is acceptable for pilot go-live, but a custom domain can be added later if required.
6. Object storage is in SJC while app/PostgreSQL are in SFO. Functional validation is PASS; region alignment is an optimization, not a functional blocker.
7. An empty Railway staged environment patch is present. Verify it contains no changes before production freeze.

## Round 6B — Production Master Data

Pending.

## Round 6C — Full Operational UAT

Pending.

## Round 6D — Backup, Recovery & Monitoring

Pending.

## Round 6E — Controlled Go-Live

Pending.

## Release rule

No production source switch, destructive data operation, credential rotation, or final go-live deployment is performed without explicit approval.
