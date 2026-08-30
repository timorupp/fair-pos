# Migrations

This directory holds SQL migration files. The runner in `../migrate.ts`
applies any `.sql` file that has not yet been recorded in
`schema_migrations`, in alphabetical order.

## 2026-06-24 — initial-only consolidation

Before this date the schema lived in `0001_initial.sql` plus six incremental
deltas (`0002`–`0007`). Since the project was still pre-production the patch
history had no value, so all migrations were folded into a single
`0001_initial.sql`.

**If you already ran the old migrations against a local database**, drop
that database and re-create it before starting the app — the migration
runner will see the new `0001_initial.sql` as already applied (the filename
match) and skip it, leaving your schema in the old, partially-patched shape.

```bash
docker compose down -v   # wipes the postgres_data volume
docker compose up -d postgres
npm run db:migrate -w packages/backend
```

For fresh installations no action is needed.
