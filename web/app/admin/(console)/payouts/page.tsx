"use client";

import { useCallback, useEffect, useState } from "react";

import { ago, api, fmt } from "@/lib/api";

type Payout = {
  id: string;
  prizeDescription: string;
  amount?: number;
  status: string;
  user: { name: string; email: string };
  challengeName: string;
  claim?: { momoNumber: string; network: string; at: string };
};

/** Sponsor prizes people have claimed: pay them on MoMo, then mark them sent. */
export default function Payouts() {
  const [tab, setTab] = useState<"claimed" | "pending" | "fulfilled">("claimed");
  const [rows, setRows] = useState<Payout[] | null>(null);
  const load = useCallback(() => api<Payout[]>(`/admin/payouts?status=${tab}`).then(setRows).catch(() => setRows([])), [tab]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const fulfil = async (p: Payout) => {
    if (!confirm(`Mark GH₵${p.amount} to ${p.claim?.momoNumber} (${p.claim?.network.toUpperCase()}) as sent?`)) return;
    await api(`/admin/payouts/${p.id}/fulfill`, { method: "POST" });
    load();
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="label">Prize payouts</div>
        <h1 className="num text-4xl font-bold mt-1">Sponsor prizes</h1>
      </header>
      <div className="flex gap-2">
        {(["claimed", "pending", "fulfilled"] as const).map((t) => (
          <button key={t} className={`btn ${tab === t ? "btn-volt" : "btn-ghost"}`} onClick={() => setTab(t)}>
            {t === "claimed" ? "To pay" : t === "pending" ? "Not claimed yet" : "Sent"}
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <tbody>
            {rows?.map((p) => (
              <tr key={p.id} className="border-t border-hairline first:border-t-0">
                <td className="px-4 py-3">
                  <div>{p.user.name || p.user.email}</div>
                  <div className="text-xs text-muted">{p.challengeName}</div>
                </td>
                <td className="px-4 py-3 num text-gold">GH₵{fmt(p.amount ?? 0)}</td>
                <td className="px-4 py-3 text-muted">{p.claim ? `${p.claim.network.toUpperCase()} ${p.claim.momoNumber} · ${ago(p.claim.at)}` : "—"}</td>
                <td className="px-4 py-3 text-right">{tab === "claimed" ? <button className="btn btn-gold" onClick={() => fulfil(p)}>Mark sent</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows && !rows.length ? <p className="p-4 text-muted text-sm">Nothing here.</p> : null}
      </div>
    </div>
  );
}
