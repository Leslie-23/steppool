"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ago, api, fmt } from "@/lib/api";

type Detail = {
  user: { id: string; name: string; email: string; credits: number; baselineDaily: number; dailyTarget: number; dailyTargetCustom: boolean; role: string; providers: string[]; referralCode: string; createdAt: string };
  ledger: { id: string; amount: number; kind: string; note?: string; at: string }[];
  challenges: { id: string; name: string; status: string; steps: number; goal: number; heldSteps: number }[];
};

const KIND: Record<string, string> = {
  signup_grant: "Welcome credits",
  entry: "Challenge entry",
  payout: "Pool payout",
  refund: "Refund",
  walk_reward: "Daily target",
  streak_bonus: "Streak bonus",
  weekly_topup: "Weekly top-up",
  referral: "Referral",
  admin_grant: "Admin grant",
};

export default function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [grant, setGrant] = useState({ amount: 100, reason: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<{ ok: boolean; step: string; detail: string } | "sending" | null>(null);

  const load = useCallback(() => api<Detail>(`/admin/users/${id}`).then(setD).catch((e) => setMsg(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api(`/admin/users/${id}/credits`, { method: "POST", body: grant });
      setMsg(`Gave ${fmt(grant.amount)} credits.`);
      setGrant({ amount: 100, reason: "" });
      await load();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testPush = async () => {
    setPush("sending");
    try {
      setPush(await api<{ ok: boolean; step: string; detail: string }>(`/admin/users/${id}/test-push`, { method: "POST" }));
    } catch (err) {
      setPush({ ok: false, step: "request", detail: (err as Error).message });
    }
  };

  if (!d) return <p className="text-muted text-sm">{msg ?? "Loading…"}</p>;
  const u = d.user;

  return (
    <div className="space-y-8">
      <Link href="/admin/users" className="text-sm text-muted">← All users</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">{u.role === "admin" ? "Admin" : "Walker"} · joined {ago(u.createdAt)}</div>
          <h1 className="num text-4xl font-bold mt-1">{u.name || "Unnamed"}</h1>
          <div className="text-muted text-sm mt-1">{u.email} · signs in with {u.providers.join(", ")} · referral {u.referralCode || "—"}</div>
        </div>
        <div className="text-right">
          <div className="label">Balance</div>
          <div className="num text-4xl font-bold text-gold">{fmt(u.credits)}</div>
        </div>
      </header>

      <section className="grid sm:grid-cols-3 gap-3">
        <div className="card p-5"><div className="label">Usual day</div><div className="num text-2xl font-bold mt-1">{fmt(u.baselineDaily)}</div></div>
        <div className="card p-5"><div className="label">Daily target</div><div className="num text-2xl font-bold mt-1">{fmt(u.dailyTarget)}</div><div className="text-xs text-muted">{u.dailyTargetCustom ? "set by them" : "recommended"}</div></div>
        <div className="card p-5"><div className="label">Challenges</div><div className="num text-2xl font-bold mt-1">{d.challenges.length}</div></div>
      </section>

      <form onSubmit={give} className="card p-5 space-y-3">
        <div className="label">Give credits</div>
        <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2">
          <input className="input" type="number" min={1} max={100000} value={grant.amount} onChange={(e) => setGrant({ ...grant, amount: Number(e.target.value) })} aria-label="Credits" />
          <input className="input" placeholder="Reason (they'll see it), e.g. Pilot thank-you" value={grant.reason} onChange={(e) => setGrant({ ...grant, reason: e.target.value })} />
          <button className="btn btn-gold" disabled={busy || grant.reason.trim().length < 3 || grant.amount < 1}>Give</button>
        </div>
        {msg ? <p className="text-sm text-muted">{msg}</p> : null}
      </form>

      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Push notifications</div>
          <p className="text-sm mt-1" style={{ color: push === "sending" || !push ? "var(--muted)" : push.ok ? "var(--volt)" : "var(--danger)" }}>
            {push === "sending" ? "Sending and waiting for Apple/Google…" : push ? `${push.ok ? "✓" : "✕"} ${push.step}: ${push.detail}` : "Send a test push to this user's phone."}
          </p>
        </div>
        <button className="btn" onClick={testPush} disabled={push === "sending"}>Send test push</button>
      </div>

      <section className="grid lg:grid-cols-2 gap-3">
        <div className="card p-5">
          <div className="label mb-3">Ledger</div>
          <table className="w-full text-sm">
            <tbody>
              {d.ledger.map((l) => (
                <tr key={l.id} className="border-t border-hairline">
                  <td className="py-2">
                    <div>{KIND[l.kind] ?? l.kind}</div>
                    {l.note ? <div className="text-xs text-muted">{l.note}</div> : null}
                  </td>
                  <td className="py-2 text-muted text-xs">{ago(l.at)}</td>
                  <td className={`py-2 text-right num ${l.amount > 0 ? "text-gold" : "text-muted"}`}>{l.amount > 0 ? "+" : ""}{fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-5">
          <div className="label mb-3">Challenges</div>
          <table className="w-full text-sm">
            <tbody>
              {d.challenges.map((c) => (
                <tr key={c.id} className="border-t border-hairline">
                  <td className="py-2">{c.name}<div className="text-xs text-muted">{c.status}</div></td>
                  <td className="py-2 text-right num">{fmt(c.steps)} / {fmt(c.goal)}</td>
                  <td className="py-2 text-right text-xs" style={{ color: c.heldSteps ? "var(--danger)" : "var(--faint)" }}>{c.heldSteps ? `${fmt(c.heldSteps)} held` : "clean"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
