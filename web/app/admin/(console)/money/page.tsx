"use client";

import { useEffect, useState } from "react";

import { BarChart } from "@/components/BarChart";
import { ago, api, fmt, ghs } from "@/lib/api";

type Money = {
  enabled: { paidEntry: boolean; testers: number; paystack: boolean; sponsorFeePct: number };
  earnings: { rake: number; sponsorFees: number; rounding: number; total: number };
  held: { wallets: number; walletsUsers: number; pools: number; prizes: number; total: number };
  expectedAtPaystack: number;
  paystackBalance: number | null;
  deposits: { total: number; n: number };
  withdrawals: { sent: number; sentN: number; pending: number; failedN: number; pendingList: { id: string; name: string; amount: number; network: string; momoNumber: string; at: string }[] };
  sponsorPrizesOwed: number;
  sponsorOrders: { id: string; company: string; email: string; challengeName: string; prize: number; fee: number; status: string; at: string }[];
  earningsDaily: { day: string; n: number }[];
};

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card p-5">
      <div className="label">{label}</div>
      <div className="num text-3xl font-bold mt-2" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub ? <div className="text-xs text-muted mt-1">{sub}</div> : null}
    </div>
  );
}

const STATUS: Record<string, string> = { paid: "var(--volt)", pending: "var(--muted)", failed: "var(--danger)" };

/** Real money: what StepPool has earned, what it is holding for others, and whether Paystack agrees. */
export default function MoneyPage() {
  const [m, setM] = useState<Money | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Money>("/admin/money").then(setM).catch((e) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!m) return <p className="text-muted text-sm">Loading…</p>;

  // StepPool's own earnings stay at Paystack until you move them out, so Paystack should hold at least what's owed to others.
  const gap = m.paystackBalance === null ? null : m.paystackBalance - m.expectedAtPaystack;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Money</div>
          <h1 className="num text-4xl font-bold mt-1">{ghs(m.earnings.total)} earned</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="card px-3 py-1.5">Cash challenges: {m.enabled.paidEntry ? "on for everyone" : `off · ${m.enabled.testers} tester${m.enabled.testers === 1 ? "" : "s"}`}</span>
          <span className="card px-3 py-1.5">Paystack: {m.enabled.paystack ? "connected" : "no key"}</span>
          <span className="card px-3 py-1.5">Sponsor fee {m.enabled.sponsorFeePct}%</span>
        </div>
      </header>

      <section>
        <div className="label mb-3">StepPool&apos;s earnings</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Total" value={ghs(m.earnings.total)} accent="var(--gold)" />
          <Tile label="Challenge fees" value={ghs(m.earnings.rake)} sub="10% of cash pools" />
          <Tile label="Sponsor fees" value={ghs(m.earnings.sponsorFees)} sub={`${m.enabled.sponsorFeePct}% on top of prizes`} />
          <Tile label="Rounding" value={ghs(m.earnings.rounding)} sub="pesewas that don't split evenly" />
        </div>
      </section>

      <section>
        <div className="label mb-3">Held for others</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Total held" value={ghs(m.held.total)} accent="var(--volt)" sub="not StepPool's money" />
          <Tile label="Player wallets" value={ghs(m.held.wallets)} sub={`${fmt(m.held.walletsUsers)} players with a balance`} />
          <Tile label="Live cash pools" value={ghs(m.held.pools)} sub="paid out when challenges settle" />
          <Tile label="Sponsor prizes" value={ghs(m.held.prizes)} sub={`${ghs(m.sponsorPrizesOwed)} won and not yet sent`} />
        </div>
      </section>

      <section className="grid lg:grid-cols-[1fr_1fr] gap-3">
        <div className="card p-6 space-y-3">
          <div className="label">Paystack check</div>
          <div className="flex justify-between text-sm"><span className="text-muted">Should be at Paystack</span><span className="num">{ghs(m.expectedAtPaystack)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted">Paystack balance</span><span className="num">{m.paystackBalance === null ? "—" : ghs(m.paystackBalance)}</span></div>
          {gap !== null ? (
            <p className="text-sm" style={{ color: gap >= -m.earnings.total ? "var(--volt)" : "var(--danger)" }}>
              {gap >= 0
                ? "✓ Paystack holds everything it should."
                : gap >= -m.earnings.total
                  ? `✓ Covers everything owed to others. ${ghs(-gap)} of earnings has been settled to your bank or is still clearing.`
                  : `✕ ${ghs(-gap - m.earnings.total)} short of what's owed to players and sponsors. Check Paystack settlements.`}
            </p>
          ) : (
            <p className="text-xs text-muted">Add PAYSTACK_SECRET_KEY on Render to compare with Paystack&apos;s live balance.</p>
          )}
          <div className="border-t border-hairline pt-3 grid grid-cols-3 gap-2 text-sm">
            <div><div className="label">Paid in</div><div className="num">{ghs(m.deposits.total)}</div><div className="text-xs text-muted">{fmt(m.deposits.n)} payments</div></div>
            <div><div className="label">Withdrawn</div><div className="num">{ghs(m.withdrawals.sent)}</div><div className="text-xs text-muted">{fmt(m.withdrawals.sentN)} sent</div></div>
            <div><div className="label">In flight</div><div className="num">{ghs(m.withdrawals.pending)}</div><div className="text-xs text-muted">{fmt(m.withdrawals.failedN)} failed so far</div></div>
          </div>
        </div>
        <div className="card p-6">
          <div className="label mb-2">Earnings per day (GH₵)</div>
          <BarChart data={m.earningsDaily.map((d) => ({ day: d.day, n: d.n / 100 }))} unit="GH₵ earned" color="var(--gold)" />
        </div>
      </section>

      {m.withdrawals.pendingList.length ? (
        <section className="card overflow-x-auto">
          <div className="label px-4 pt-4">Withdrawals waiting on Paystack</div>
          <table className="w-full text-sm mt-2">
            <tbody>
              {m.withdrawals.pendingList.map((w) => (
                <tr key={w.id} className="border-t border-hairline">
                  <td className="px-4 py-3">{w.name}</td>
                  <td className="px-4 py-3 num">{ghs(w.amount)}</td>
                  <td className="px-4 py-3 text-muted">{w.network} {w.momoNumber}</td>
                  <td className="px-4 py-3 text-muted text-right">{ago(w.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="card overflow-x-auto">
        <div className="label px-4 pt-4">Sponsor orders</div>
        <table className="w-full text-sm mt-2">
          <tbody>
            {m.sponsorOrders.map((o) => (
              <tr key={o.id} className="border-t border-hairline">
                <td className="px-4 py-3">
                  <div>{o.company}</div>
                  <div className="text-xs text-muted">{o.challengeName} · {o.email}</div>
                </td>
                <td className="px-4 py-3 num">{ghs(o.prize)}<div className="text-xs text-muted">+ {ghs(o.fee)} fee</div></td>
                <td className="px-4 py-3"><span style={{ color: STATUS[o.status] }}>●</span> {o.status}</td>
                <td className="px-4 py-3 text-muted text-right">{ago(o.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!m.sponsorOrders.length ? <p className="p-4 text-muted text-sm">No sponsor orders yet. Brands sign up at /sponsor.</p> : null}
      </section>
    </div>
  );
}
