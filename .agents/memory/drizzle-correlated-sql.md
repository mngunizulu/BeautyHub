---
name: Correlated SQL in Drizzle
description: A subtle column-qualification behavior that can silently corrupt nested aggregate counts.
---
Do not assume a Drizzle column interpolated into a raw correlated subquery keeps its table qualifier when the outer select uses a single table.

**Why:** The ORM can render an intended outer ID reference as plain `"id"`, which PostgreSQL binds to the inner table instead. Queries return valid but incorrect counts rather than throwing. The public list can remain correct because joins force qualification while a summary silently differs.

**How to apply:** Prefer explicit joins for aggregate counts. If correlation is necessary, inspect generated SQL and assert aggregates against independently written database queries in integration tests.
