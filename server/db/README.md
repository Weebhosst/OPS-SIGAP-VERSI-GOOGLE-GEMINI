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

Media binary data is intentionally not imported. PostgreSQL receives only
metadata and a `legacy_json` reference; external media storage is Round 4B.

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

### Media gate before Round 4B

Camera capture currently produces base64 data URLs. Round 4A intentionally refuses base64 evidence
when PostgreSQL is active and returns `MEDIA_STORAGE_NOT_READY`. This prevents photo binary data from
being stored inside PostgreSQL and prevents operational actions from being counted without durable
evidence.

Round 4B will connect object storage. After that, media metadata remains in PostgreSQL while image
binary data lives in object storage.

Legacy JSON media import stores only a `legacy-json:<id>` metadata reference and preserves
incident/handover media relations. The source JSON remains untouched.

## CI

The repository includes `.github/workflows/ci.yml` using Node.js 22 LTS. It runs:

```text
npm ci
npm run lint
npm test
npm run build
```

CI always uses an isolated JSON fixture. Live PostgreSQL integration remains a separate gate and must
be reported as NOT TESTED until a development `DATABASE_URL` is available.
