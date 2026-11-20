import { serve } from '@hono/node-server';
import { app } from './app.ts';
import { botEnabled, pollCommands } from './bot.ts';
import { env } from './env.ts';
import { flushLogs, log, stack } from './log.ts';

serve({ fetch: app.fetch, port: env.port }, ({ port }) => {
  console.log(`Listening on http://localhost:${port}${env.dev ? ' (DEV mode: auth falls back to admin user 1)' : ''}`);
});

if (botEnabled()) pollCommands();

// A crash reaches the log group before the process exits (systemd restarts it).
process.on('uncaughtException', async (e) => {
  log.error('💀 Crashed (restarting)', stack(e));
  await flushLogs();
  process.exit(1);
});
process.on('unhandledRejection', (e) => log.error('Unhandled promise rejection', stack(e)));
