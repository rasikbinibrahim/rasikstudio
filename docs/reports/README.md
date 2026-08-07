# docs/reports/

Point-in-time audit and analysis reports — distinct from `docs/adr/` (living decision records that are never deleted) and from the root architecture docs (continuously-maintained specs). A report here reflects the state of the repository on the date in its filename; it is not updated as the repo evolves.

## Convention

- Filename: `YYYY-MM-DD-short-slug.md`.
- Each report states what prompted it and what, if anything, was decided as a result — if a report leads to a lasting architectural decision, that decision gets its own ADR in `docs/adr/`, and the report is linked from it for full context.

## Reports

| File | Date | Summary |
|---|---|---|
| `2026-08-03-repository-structure-audit.md` | 2026-08-03 | Full read of every project document + live repo inspection; folder/doc organization findings and a proposed migration to a `docs/architecture/` layout |
