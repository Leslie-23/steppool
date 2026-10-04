// Browser-side client for the StepPool API. The admin's tokens live in localStorage; every request
// carries the access token, and a 401 tries one refresh before sending the admin back to sign in.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4400";

type Tokens = { access: string; refresh: string };
const KEY = "steppool.admin.tokens";

export const tokens = {
  get: (): Tokens | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null");
    } catch {
      return null;
    }
  },
  set: (t: Tokens) => localStorage.setItem(KEY, JSON.stringify(t)),
  clear: () => localStorage.removeItem(KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function refresh(): Promise<boolean> {
  const t = tokens.get();
  if (!t) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh: t.refresh }) });
  if (!res.ok) return false;
  tokens.set(await res.json());
  return true;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}, retried = false): Promise<T> {
  const access = tokens.get()?.access;
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(access ? { authorization: `Bearer ${access}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (res.status === 401 && !retried && (await refresh())) return api<T>(path, init, true);
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    if (res.status === 401) tokens.clear();
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const fmt = (n: number) => n.toLocaleString("en-GB");
export const ago = (iso: string | Date) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/** Pesewas → "GH₵1,234.50". */
export const ghs = (pesewas: number) => `GH₵${(pesewas / 100).toLocaleString("en-GB", { minimumFractionDigits: pesewas % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** Unauthenticated calls (the public sponsor checkout). */
export async function publicApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error).catch(() => undefined);
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}
