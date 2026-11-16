import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { env } from './env.ts';

serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
  console.log(`Listening on http://localhost:${port}${env.dev ? ' (DEV mode: auth falls back to admin user 1)' : ''}`);
});
