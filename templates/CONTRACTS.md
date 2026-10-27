# CONTRACTS.md — handoff between phases

Each agent writes what it delivers; the next agent reads it before building. Never guess a schema or an endpoint.

## Data (written by db-engineer)
| Model / table | Field | Type | Notes |
|---------------|-------|------|-------|
| <model> | <field> | <type> | <PK / FK / index / nullable> |

## API (written by backend-builder)
### `<METHOD> /<route>`
- **Request:** `{ ... }`
- **Response 200:** `{ ... }`
- **Errors:** `400 { "error": "..." }`, `404 ...`
