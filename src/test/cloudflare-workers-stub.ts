// Vitest stand-in for the `cloudflare:workers` virtual module, which only
// exists inside workerd. Under Vitest `db/client.ts` is aliased to
// src/test/db-client.ts and never reads `env`; this stub only satisfies imports.
export const env: Record<string, unknown> = {};
