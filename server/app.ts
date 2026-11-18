import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { api } from './api.ts';
import { env } from './env.ts';

const immutable = (_: string, c: any) => c.header('Cache-Control', 'public, max-age=31536000, immutable');
// Telegram's webview caches aggressively; index.html must always be revalidated so deploys show up.
const noCache = (_: string, c: any) => c.header('Cache-Control', 'no-cache');

export const app = new Hono();

app.route('/api', api);
app.use('/uploads/*', serveStatic({ root: env.dataDir, onFound: immutable })); // file names are random UUIDs
app.get('/uploads/*', (c) => c.notFound()); // a deleted photo is a 404, not the app's index.html

// The built web app. In dev Vite serves it instead, so a missing dist/ is expected there.
if (!env.dev || existsSync('dist')) {
  app.use('/assets/*', serveStatic({ root: 'dist', onFound: immutable })); // Vite hashes these
  app.use('*', serveStatic({ root: 'dist', onFound: noCache }));
  app.get('*', serveStatic({ path: 'dist/index.html', onFound: noCache })); // client-side routes
}
