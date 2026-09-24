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


## Round 4A.1 cutover safety

The selected provider is now respected by the patrol validation service and gallery/media query service.
Those services no longer import the legacy JSON store directly.

Some administrative and field-report routes are intentionally still JSON-backed while their repository
contracts are being migrated. When `DATABASE_PROVIDER=postgres`, those legacy routes return HTTP 503
with code `POSTGRES_ROUTE_NOT_MIGRATED` instead of touching the JSON file. This is deliberate
fail-closed behavior to prevent split-brain data.

Current PostgreSQL-safe flow includes:

- authentication lookup
- Start Shift transaction and site-capacity enforcement
- current patrol state / round progress reads
- patrol scan validation and validation-alert persistence
- patrol/session list reads
- gallery/media reads
- validation-alert workflow
- audit repository writes used by migrated flows
- health check

Still guarded until the next cutover patch:

- Naik Jaga / Turun Jaga workflow
- normal Close Shift / Force Close
- handover CRUD
- incident CRUD
- master-data CRUD
- radius calibration
- validation override

### Media gate before Round 4B

Camera capture currently produces base64 data URLs. Round 4A must not store those image binaries in
PostgreSQL. Therefore a valid PostgreSQL patrol scan containing a `data:` photo is returned as
`REVIEW / MEDIA_STORAGE_NOT_READY` and is not counted as a valid checkpoint. This prevents evidence
loss and keeps binary media out of PostgreSQL.

Round 4B must connect an object-storage provider, then remove this temporary gate.

Legacy JSON media import also stores only a `legacy-json:<id>` reference in PostgreSQL metadata.
The JSON source remains untouched for the later media migration.
