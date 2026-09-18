// Vitest stand-in for the `cloudflare:workers` virtual module, which only
// exists inside workerd. Tests never touch D1: anything that reaches
// `db/d1-client.ts` must `vi.mock` it instead of relying on this stub.
export const env: Record<string, unknown> = {};
