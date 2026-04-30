# Database SQL Layout

## Canonical apply order
1. `01_schema.sql`
2. `02_admin.sql`

`01_schema.sql` is the single canonical schema bootstrap for fresh environments.

## Archive policy
- Historical migrations, one-off patches, test SQL, and deprecated SQL live under `db/archive/`.
- Files in `db/archive/` are kept for traceability and should not be part of fresh bootstrap flows.

## Archive folders
- `db/archive/migrations`: historical schema migrations
- `db/archive/patches`: data cleanup/backfill scripts
- `db/archive/test-data`: test fixture SQL
- `db/archive/deprecated`: superseded SQL files
- `db/archive/notes`: documentation-only SQL notes
- `db/archive/diagnostics`: diagnostic SQL scripts
