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
