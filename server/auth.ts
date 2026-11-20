import { createHmac, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { env } from './env.ts';
import { log, stack, who } from './log.ts';
import { botApi, TelegramError } from './telegram.ts';

export type TgUser = { id: number; first_name: string; last_name?: string; username?: string };
// authProblem: why a request was refused (401), for the log; see checkInitData.
export type AuthEnv = { Variables: { user: TgUser; authProblem?: string } };

const MAX_AGE_SEC = 24 * 60 * 60;
const DEV_USER: TgUser = { id: 1, first_name: 'Dev' };

/**
 * Verifies Telegram Mini App initData: the user, or why it can't be trusted (Telegram HTML, for the log).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function checkInitData(initData: string, botToken: string, now = Date.now()): { user: TgUser } | { problem: string } {
  if (!initData) return { problem: 'no Telegram data: opened outside Telegram, e.g. the site in a browser' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !botToken) return { problem: 'no signature in the Telegram data' };
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) {
    return { problem: 'bad signature: the Telegram data is not from this bot' };
  }

  let user: TgUser | null = null;
  try {
    const parsed = JSON.parse(params.get('user') ?? 'null');
    if (typeof parsed?.id === 'number') user = parsed;
  } catch {}
  if (!user) return { problem: 'no user in the Telegram data' };

  // Telegram signs the data when the app opens; an app left open (or minimized) for a day has to be reopened.
  const age = now / 1000 - Number(params.get('auth_date'));
  if (!(age <= MAX_AGE_SEC)) return { problem: `${who(user)}: app opened ${Math.round(age / 3600)} h ago, Telegram data expired` };
  return { user };
}

export function verifyInitData(initData: string, botToken: string, now = Date.now()): TgUser | null {
  const r = checkInitData(initData, botToken, now);
  return 'user' in r ? r.user : null;
}

/**
 * Requires `Authorization: tma <initData>`.
 * DEV mode only: without valid initData the request acts as the user in `X-Dev-User` (default DEV_USER, always admin).
 */
export const auth = createMiddleware<AuthEnv>(async (c, next) => {
  const initData = c.req.header('authorization')?.replace(/^tma /, '') ?? '';
  const checked = checkInitData(initData, env.botToken);
  const user = 'user' in checked ? checked.user : env.dev ? devUser(c.req.header('x-dev-user')) : null;
  if (!user) {
    c.set('authProblem', 'problem' in checked ? checked.problem : undefined);
    return c.json({ error: 'Ilovani Telegram orqali qayta oching' }, 401);
  }
  c.set('user', user);
  await next();
});

export const adminOnly = createMiddleware<AuthEnv>(async (c, next) => {
  if (!(await isAdmin(c.get('user').id))) return c.json({ error: "Ruxsat yo'q" }, 403);
  await next();
});

// Admins are the members of the orders group. Cached briefly to avoid an API call per request.
const adminCache = new Map<number, { admin: boolean; at: number }>();
const ADMIN_CACHE_MS = 60_000;

export async function isAdmin(userId: number): Promise<boolean> {
  if (env.dev && userId === DEV_USER.id) return true;
  if (!env.botToken || !env.groupId) return false;
  const hit = adminCache.get(userId);
  if (hit && Date.now() - hit.at < ADMIN_CACHE_MS) return hit.admin;
  let admin = false;
  try {
    const m = await botApi<{ status: string; is_member?: boolean }>('getChatMember', { chat_id: env.groupId, user_id: userId });
    admin = ['creator', 'administrator', 'member'].includes(m.status) || (m.status === 'restricted' && !!m.is_member);
  } catch (e) {
    // Telegram answered (e.g. "user not found"): a definite no, cache it. Network failure: retry next request.
    if (!(e instanceof TelegramError)) {
      log.error('Admin check (getChatMember) failed', stack(e));
      return false;
    }
  }
  adminCache.set(userId, { admin, at: Date.now() });
  return admin;
}

function devUser(header: string | undefined): TgUser {
  const id = Number(header);
  return Number.isInteger(id) && id > 0 ? { id, first_name: `Dev ${id}` } : DEV_USER;
}
