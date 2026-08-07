# docs/

All project documentation for Rasik Studio.

## Sections

| Folder | Audience | Contents |
|---|---|---|
| `adr/` | Engineers | Architecture Decision Records — why decisions were made |
| `api/` | Engineers | Human-readable API endpoint reference |
| `plugin-authoring/` | Plugin developers | Plugin SDK guide, manifest reference, examples |
| `reference/` | Engineers | Analysis of reference open-source projects |
| `reports/` | Engineers | Point-in-time audit/analysis reports (distinct from ADRs, which are living decisions) |
| `roadmap/` | Engineers | Phase-by-phase implementation plan (one file per phase) — the execution detail behind `PROGRESS.md` |
| `user-guide/` | End users | Installation, features, keyboard shortcuts |

## Rules

- Documentation is written in Markdown.
- Architecture documents (the `.md` files in the project root) are the source of truth for design decisions. This `docs/` folder holds supplementary, audience-specific documentation.
- ADRs are numbered sequentially (`0001-`, `0002-`, ...) and never deleted — superseded ADRs are marked with status "Superseded by ADR-XXXX".
- Do not duplicate content between root-level architecture docs and this folder — link instead.
