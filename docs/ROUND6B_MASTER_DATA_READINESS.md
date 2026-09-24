# Round 6B — Production Master Data Readiness

This phase audits and prepares production master data before controlled operational go-live.

## Safety rule

Round 6B starts in **READ-ONLY** mode.

No customer, site, user, checkpoint, session, media, incident, handover, alert, or audit data may be deleted or modified until the production audit is reviewed and an explicit cleanup plan is approved.

## Deployed JSON seed baseline

The currently deployed `data/ops-sigap.json` is only a seed/baseline. It is **not** treated as the current PostgreSQL source of truth.

Seed baseline observed:

- users: 6
- roles: 4 ANGGOTA, 2 SUPER_ADMIN
- sites: 1 (`BB92`)
- checkpoints: 5
- legacy JSON customers array: absent/empty
- one clearly labelled demo Super Admin record is present
- seed operational arrays for patrol sessions, patrol logs, handovers, incidents, and media are empty
- seed contains radius-calibration examples and initial audit-log examples

## Import normalization behavior

The PostgreSQL importer normalizes the legacy seed before import:

- if sites exist but customers are absent, it creates customer `CUST-AIS` / `AIS`
- legacy sites without a customer are attached to the default customer
- missing site `personnelCapacity` defaults to 1
- missing site `targetRoundsPerShift` defaults to 1
- missing user assignment metadata is normalized into current assignment history
- checkpoint QR tokens are encrypted before PostgreSQL persistence

Therefore seed omissions are **not automatically production defects**. PostgreSQL must be audited directly.

## Production audit command

Round 6B adds:

```bash
npm run audit:master-data
```

The command:

- opens a PostgreSQL `REPEATABLE READ READ ONLY` transaction
- performs only SELECT queries
- rolls the transaction back after collection
- never returns password hashes
- never returns auth-session token hashes
- never returns object-storage credentials or media content
- masks duplicate-email findings to counts + user IDs rather than exposing email values

Audit coverage:

- customer totals/status
- sites, customer mapping, capacity, target rounds, timezone
- user role/status distribution
- current assignment coverage
- missing assignments
- duplicate email candidate counts
- DEMO/TEST/UAT/SEED user-ID flags
- forced-password-change counts
- site capacity versus concurrent ACTIVE shift sessions
- checkpoint totals/status/QR status/radius
- QR checkpoint/token consistency
- operational table counts
- TEST/DEMO/UAT/SEED operational IDs
- assignment customer/site mismatch

## Known seed review item

A clearly labelled demo Super Admin account exists in the seed baseline.

This record must be checked against the current PostgreSQL database before any deletion or deactivation is proposed.

## Round 6B gates

1. Read-only audit command passes CI.
2. Read-only audit is executed against production PostgreSQL.
3. Findings are classified:
   - CRITICAL
   - REVIEW
   - CLEAN
4. Cleanup plan is produced without executing mutations.
5. User explicitly approves each production cleanup category.
6. Cleanup is applied with audit logging and post-cleanup verification.
7. Production master-data baseline is frozen.

## Production PostgreSQL audit findings

Validated with a temporary PostgreSQL 17 audit runner using `REPEATABLE READ READ ONLY` and explicit `ROLLBACK`.

### CLEAN

- customers: 1 total, 1 ACTIVE, 0 INACTIVE
- checkpoint geometry/radius: no invalid records
- checkpoint QR/token integrity: no ACTIVE QR without an ACTIVE token
- assignment customer/site consistency: no mismatch
- target-round bounds: no values below 1 or above 20
- concurrent site capacity:
  - AIS capacity 1, ACTIVE sessions 0
  - BB92 capacity 1, ACTIVE sessions 1

### REVIEW

- one ACTIVE demo account exists: `USR-SUPER-999` / `SUPER ADMIN (DEMO)`
- the demo account has no operational usage and no auth sessions; only one historical audit-log reference exists
- site `AIS` / `SG, MO SUBANG` is ACTIVE with one CHIEF assignment, target rounds 5, and zero checkpoints
- two SUPER_ADMIN users intentionally have no site assignment
- seven users currently have `must_change_password=false`
- existing operational/UAT records:
  - shift sessions: 2, including 1 ACTIVE and 1 FORCE_CLOSED
  - patrol logs: 1 REJECTED
  - handovers: 2
  - media: 2
  - validation alerts: 1 OPEN
  - radius calibrations: 3
  - auth sessions: 14 total

### Current assignments

- AIS: one CHIEF
- BB92: four ANGGOTA

### Cleanup blockers

Before production master data can be frozen:

1. decide whether the demo Super Admin should be removed from both seed and PostgreSQL
2. resolve the ACTIVE UAT shift session and OPEN validation alert
3. decide whether UAT operational history should be retained or purged before go-live
4. confirm site AIS with zero checkpoints is intentional

## Status

- deployed seed audit: COMPLETE
- read-only PostgreSQL audit tooling: COMPLETE
- production PostgreSQL audit: COMPLETE
- findings classification: COMPLETE
- cleanup plan: COMPLETE
- production cleanup: PENDING EXPLICIT APPROVAL
- production master-data freeze: PENDING
