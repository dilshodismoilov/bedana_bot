import { useCallback, useEffect, useState } from 'preact/hooks';
import { tg } from './tg.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Init = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; json?: unknown; form?: FormData };

// Local dev only (server with DEV=1): open http://localhost:5173/?as=<telegram user id> to act as that user in this tab.
const devUser = import.meta.env.DEV ? (new URLSearchParams(location.search).get('as') ?? sessionStorage.getItem('as')) : null;
if (devUser) sessionStorage.setItem('as', devUser);

export async function api<T>(path: string, { method = 'GET', json, form }: Init = {}): Promise<T> {
  const headers: Record<string, string> = { Authorization: `tma ${tg.initData}` };
  if (devUser) headers['x-dev-user'] = devUser;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, { method, headers, body: form ?? (json !== undefined ? JSON.stringify(json) : undefined) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? 'Tarmoq xatosi', res.status);
  return body as T;
}

// Last response per path. Pages render it instantly on revisit while fresh data loads (stale-while-revalidate).
const cache = new Map<string, unknown>();

/** Seed the cache with data we already have (e.g. a POST response) so the next page renders without a spinner. */
export const prime = (path: string, data: unknown) => cache.set(path, data);

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | undefined>(() => cache.get(path) as T | undefined);
  const [error, setError] = useState<string>();

  const reload = useCallback(() => {
    api<T>(path).then(
      (d) => {
        cache.set(path, d);
        setData(d);
        setError(undefined);
      },
      (e: Error) => setError(e.message),
    );
  }, [path]);

  useEffect(reload, [reload]);

  const mutate = useCallback(
    (d: T) => {
      cache.set(path, d);
      setData(d);
    },
    [path],
  );

  return { data, error, reload, mutate };
}
