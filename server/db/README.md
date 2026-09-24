# OPS SIGAP PostgreSQL foundation

## Provider selection

The default remains `DATABASE_PROVIDER=json`. Set `DATABASE_PROVIDER=postgres`
and a private `DATABASE_URL` for a PostgreSQL environment. Never commit the
real URL. Configuration is loaded from `server/config.ts`.

## Migrations

Run:

```text
npm run db:migrate
```

The runner takes an advisory lock, verifies SHA-256 checksums, records applied
files in `app_migrations`, and applies each missing migration in a transaction.
Applied migration files must not be edited; add the next numbered migration.

## JSON import

Validate the source without database writes:

```text
npm run db:import-json -- --dry-run
```

Import after migrations:

```text
npm run db:import-json
```

The importer reads `data/ops-sigap.json` (or `OPS_SIGAP_IMPORT_FILE`), keeps
stable IDs, imports in foreign-key order, hashes checkpoint tokens, and uses
`ON CONFLICT (id) DO NOTHING`. Existing rows are skipped, never overwritten.
The complete import is transactional. The source JSON is never written.

Legacy JSON media binary data is intentionally not copied into PostgreSQL. PostgreSQL receives only
metadata and a `legacy_json` reference during historical JSON import. New operational photos in
Round 4B are written to private S3-compatible object storage and PostgreSQL stores only their
metadata/object keys.

## Cutover checklist

1. Back up the target database and retain the JSON source.
2. Set a development `DATABASE_URL` and run migrations.
3. Run the dry-run and resolve all reported validation conflicts.
4. Run the import once, then rerun it to verify all existing IDs are skipped.
5. Test health, login, shift, patrol, alert, gallery, and audit flows.
6. Switch production only after the same gates pass against its staging clone.

The repository tests do not substitute for a live PostgreSQL integration test.


## Round 4A.2 provider cutover

Application routes and operational services now use `RepositoryBundle` instead of importing the
legacy JSON store directly. The JSON store is initialized only when `DATABASE_PROVIDER=json`.

Provider-neutral coverage now includes:

- authentication lookup and password reset
- Start Shift, Naik Jaga, patrol current/progress, scan, normal Close Shift, Force Close
- Handover / Serah Terima
- Incident reporting and status workflow
- Validation Alert workflow and validation override
- Customer, Site, Personnel, Checkpoint master CRUD
- Active Session monitoring and Command Center
- Admin filter state
- Radius calibration
- Gallery/media metadata queries
- Audit log reads/writes
- Health counts

### Checkpoint token security

PostgreSQL stores:

- SHA-256 token hash for QR validation
- AES-256-GCM encrypted token payload for authorized QR re-view/print

Configure a stable secret before using PostgreSQL:

```text
CHECKPOINT_TOKEN_SECRET=<long-random-secret>
```

If `CHECKPOINT_TOKEN_SECRET` changes after tokens are created, existing encrypted QR tokens cannot be
recovered for printing and should be regenerated. Never commit the production secret.

### Round 4B private object storage

Camera capture may still arrive at the API as a base64 data URL, but when PostgreSQL is active the
server validates the image, uploads the decoded binary to private S3-compatible object storage, and
stores only metadata/object keys in PostgreSQL.

Supported evidence paths:

- Sertigas Naik Jaga
- Patrol QR evidence
- Sertigas Turun Jaga
- Serah Terima Barang
- TARUNA
- Incident / Kejadian

Required variables:

```text
MEDIA_PROVIDER=railway_s3
MEDIA_BUCKET=<Railway bucket name>
MEDIA_ACCESS_KEY_ID=<bucket access key>
MEDIA_SECRET_ACCESS_KEY=<bucket secret>
MEDIA_REGION=auto
MEDIA_ENDPOINT=https://<railway-storage-api-host>
MEDIA_URL_STYLE=virtual
```

Railway buckets are private. Browser clients do not receive bucket credentials or direct object keys.
Authenticated images are delivered through `/api/media/:id/content`, with site/user access checks for
member accounts and global monitoring access for ADMIN, SUPER_ADMIN, and CHIEF.

One image is limited to 8 MB and must be JPEG, PNG, or WEBP with a matching file signature. Batch
upload failures compensate already uploaded objects before database persistence begins.

Storage verification commands:

```text
npm run test:media-storage
npm run test:media-storage-live
```

The unit test uses a mocked S3 endpoint. The live test performs HEAD + PUT + GET + DELETE against the
configured Railway bucket and removes its probe object afterward.

Legacy JSON media import still stores a `legacy-json:<id>` reference and preserves incident/handover
media relations. The source JSON remains untouched.

## CI

The repository includes `.github/workflows/ci.yml` using Node.js 22 LTS. It runs:

```text
npm ci
npm run lint
npm test
npm run build
```

CI always uses an isolated JSON fixture for the JSON job and a temporary PostgreSQL 16 service for the
PostgreSQL integration job. Railway object-storage live verification is a separate deployment gate
because bucket credentials are intentionally not stored in GitHub.


## Round 5A production security

Production authentication no longer returns bearer tokens to the browser or stores them in
`localStorage`. Login creates a cryptographically random opaque session token, stores only its
SHA-256 hash server-side, and delivers the token through an `HttpOnly`, `Secure`,
`SameSite=Strict` cookie.

PostgreSQL auth sessions are persisted in migration `004_auth_sessions.sql`, which allows logout,
expiry, password-reset revocation, and deployment restarts without falling back to browser-managed
bearer tokens.

New accounts and accounts reset to NPK are marked `mustChangePassword=true`. Their workspace is
blocked until they choose a password of at least eight characters containing letters and numbers.
Embedded demo credentials were removed from the production login UI.

Production startup fails closed unless PostgreSQL, HTTPS APP_URL, strong session/checkpoint secrets,
and private Railway object storage are configured. The server also applies security headers,
cross-site mutation protection, strict cookies, login throttling, and a minimal public health
response. Detailed health diagnostics are available only to authenticated administrators.

Recommended production variables:

```text
NODE_ENV=production
APP_URL=https://<ops-sigap-host>
ALLOWED_ORIGINS=https://<ops-sigap-host>
SESSION_TTL_HOURS=12
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCK_MINUTES=15
DATABASE_PROVIDER=postgres
MEDIA_PROVIDER=railway_s3
```
