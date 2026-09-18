import type { APIRoute } from 'astro';

// Must reflect the live deployment, so never prerender or cache.
export const prerender = false;

/** Which commit this Worker was built from. Polled by the notify workflow. */
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ sha: __BUILD_SHA__ }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
