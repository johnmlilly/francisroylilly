import type { APIRoute } from 'astro';

/**
 * Builds the minimal APIContext an API route needs: a URL carrying the given
 * search params. Cast because routes here only read `url`.
 */
export function apiContext(path: string, params: Record<string, string> = {}) {
  const url = new URL(path, 'http://localhost');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return { url } as Parameters<APIRoute>[0];
}
