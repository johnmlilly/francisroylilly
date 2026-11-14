// Vitest stand-in for the `cloudflare:workers` virtual module, which only
// exists inside workerd. Under Vitest `db/client.ts` uses libSQL `:memory:` and
// never reads `env`; this stub only satisfies the import.
export const env: Record<string, unknown> = {};
