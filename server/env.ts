// All configuration comes from environment variables (see .env.example).

const dev = process.env.DEV === '1';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'off'] as const;
const logLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel | 'off';

export const env = {
  dev,
  // Not PORT: many tools inject PORT for their own use, which would hijack the API port in dev.
  port: Number(process.env.API_PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? 'data',
  botToken: process.env.BOT_TOKEN ?? '',
  groupId: process.env.GROUP_ID ?? '',
  appLink: process.env.APP_LINK ?? '',
  // Log group: entries at logLevel and above are sent there (see log.ts). Empty: console only.
  logGroupId: process.env.LOG_GROUP_ID ?? '',
  logLevel: LOG_LEVELS.includes(logLevel) ? logLevel : 'info',
  slowMs: Number(process.env.SLOW_MS) || 1500, // API requests slower than this are logged as warnings
};

if (!LOG_LEVELS.includes(logLevel)) console.warn(`LOG_LEVEL=${process.env.LOG_LEVEL} is not one of ${LOG_LEVELS.join(', ')}; using info.`);

if (!dev) {
  const missing = (['BOT_TOKEN', 'APP_LINK'] as const).filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')} (or set DEV=1 for local development)`);
}

// Not fatal, so a fresh server can start and answer /here in the group to reveal its id.
if (!dev && !env.groupId) console.warn('GROUP_ID is not set: orders are not posted and nobody is admin. Send /here in the orders group to get it.');
