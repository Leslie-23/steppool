"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { api, fmt } from "@/lib/api";

type Row = { id: string; email: string; name: string; credits: number; role: string; baselineDaily: number; providers: string[]; createdAt: string };

export default function Users() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ total: number; users: Row[] } | null>(null);
  const [gift, setGift] = useState({ amount: 100, reason: "" });
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ total: number; users: Row[] }>(`/admin/users?q=${encodeURIComponent(q)}`).then(setData).catch(() => {});
    }, 250); // debounce typing
    return () => clearTimeout(t);
  }, [q]);

  const giftAll = async () => {
    if (!confirm(`Give ${gift.amount} credits to every user (${data?.total ?? "all"})?`)) return;
    setBusy(true);
    try {
      const r = await api<{ users: number; total: number }>("/admin/credits/all", { method: "POST", body: gift });
      setGiftMsg(`Sent ${fmt(gift.amount)} credits to ${fmt(r.users)} users (${fmt(r.total)} total).`);
      setGift((g) => ({ ...g, reason: "" }));
    } catch (e) {
      setGiftMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="label">Users & credits</div>
        <h1 className="num text-4xl font-bold mt-1">{data ? fmt(data.total) : "…"} people</h1>
      </header>

      <section className="card p-5 space-y-3">
        <div className="label">Gift credits to everyone</div>
        <div className="grid sm:grid-cols-[140px_1fr_auto] gap-2">
          <input className="input" type="number" min={1} max={10000} value={gift.amount} onChange={(e) => setGift({ ...gift, amount: Number(e.target.value) })} aria-label="Credits each" />
          <input className="input" placeholder="Reason (shows in their wallet), e.g. Launch week gift" value={gift.reason} onChange={(e) => setGift({ ...gift, reason: e.target.value })} />
          <button className="btn btn-gold" disabled={busy || gift.reason.trim().length < 3 || gift.amount < 1} onClick={giftAll}>Gift to all</button>
        </div>
        {giftMsg ? <p className="text-sm text-muted">{giftMsg}</p> : null}
      </section>

      <section className="space-y-3">
        <input className="input h-12" placeholder="Search by name, email or user id…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {["Person", "Credits", "Usual day", "Sign-in", "Joined"].map((h) => (
                  <th key={h} className="label px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.users.map((u) => (
                <tr key={u.id} className="border-t border-hairline hover:bg-raised/60">
                  <td className="px-4 py-3">
                    <Link href={`/admin/user?id=${u.id}`} className="block">
                      <div className="text-ink">{u.name || "—"} {u.role === "admin" ? <span className="text-xs text-volt ml-1">admin</span> : null}</div>
                      <div className="text-muted text-xs">{u.email}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 num text-gold">{fmt(u.credits)}</td>
                  <td className="px-4 py-3 num">{fmt(u.baselineDaily)}</td>
                  <td className="px-4 py-3 text-muted">{u.providers.join(", ")}</td>
                  <td className="px-4 py-3 text-muted">{new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.users.length ? <p className="p-4 text-muted text-sm">No one matches.</p> : null}
        </div>
      </section>
    </div>
  );
}
