import { createHmac, timingSafeEqual } from 'node:crypto';
import { createMiddleware } from 'hono/factory';
import { env } from './env.ts';
import { botApi, TelegramError } from './telegram.ts';

export type TgUser = { id: number; first_name: string; last_name?: string; username?: string };
export type AuthEnv = { Variables: { user: TgUser } };

const MAX_AGE_SEC = 24 * 60 * 60;
const DEV_USER: TgUser = { id: 1, first_name: 'Dev' };

/**
 * Verifies Telegram Mini App initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function verifyInitData(initData: string, botToken: string, now = Date.now()): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !botToken) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (expected.length !== hash.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > MAX_AGE_SEC) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null');
    return typeof user?.id === 'number' ? user : null;
  } catch {
    return null;
  }
}

/**
 * Requires `Authorization: tma <initData>`.
 * DEV mode only: without valid initData the request acts as the user in `X-Dev-User` (default DEV_USER, always admin).
 */
export const auth = createMiddleware<AuthEnv>(async (c, next) => {
  const initData = c.req.header('authorization')?.replace(/^tma /, '') ?? '';
  const user = verifyInitData(initData, env.botToken) ?? (env.dev ? devUser(c.req.header('x-dev-user')) : null);
  if (!user) return c.json({ error: 'Ilovani Telegram orqali qayta oching' }, 401);
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
      console.error('[auth] getChatMember failed', e);
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
