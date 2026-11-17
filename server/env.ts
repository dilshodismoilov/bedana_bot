// All configuration comes from environment variables (see .env.example).

const dev = process.env.DEV === '1';

export const env = {
  dev,
  // Not PORT: many tools inject PORT for their own use, which would hijack the API port in dev.
  port: Number(process.env.API_PORT ?? 3000),
  dataDir: process.env.DATA_DIR ?? 'data',
  botToken: process.env.BOT_TOKEN ?? '',
  groupId: process.env.GROUP_ID ?? '',
  appLink: process.env.APP_LINK ?? '',
};

if (!dev) {
  const missing = (['BOT_TOKEN', 'GROUP_ID', 'APP_LINK'] as const).filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')} (or set DEV=1 for local development)`);
}
