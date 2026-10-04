"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ghs, publicApi } from "@/lib/api";

type Order = { status: "pending" | "paid" | "failed"; company: string; challengeName: string; prizeDescription: string; total: number; challenge: { inviteCode: string; link: string; startsAt: string; endsAt: string } | null };

function Thanks() {
  const params = useSearchParams();
  const reference = params.get("reference") ?? params.get("trxref") ?? "";
  const [o, setO] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Paystack redirects here as soon as the customer pays; the webhook may land a moment later, so poll briefly.
  useEffect(() => {
    if (!reference) return;
    let stop = false;
    let tries = 0;
    const load = () =>
      publicApi<Order>(`/sponsor/orders/${encodeURIComponent(reference)}`)
        .then((r) => {
          if (stop) return;
          setO(r);
          if (r.status === "pending" && tries++ < 20) setTimeout(load, 3000);
        })
        .catch((e) => !stop && setError(e.message));
    load();
    return () => {
      stop = true;
    };
  }, [reference]);

  if (!reference) return <p className="text-muted">No order reference.</p>;
  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!o) return <p className="text-muted">Checking your payment…</p>;
  if (o.status === "failed") return <div className="space-y-4"><h1 className="num text-4xl font-bold">Payment didn&apos;t go through</h1><Link className="btn btn-gold" href="/sponsor">Try again</Link></div>;
  if (o.status === "pending" || !o.challenge) return <p className="text-muted">Waiting for Paystack to confirm your payment…</p>;

  return (
    <div className="space-y-6">
      <div className="label" style={{ color: "var(--gold)" }}>Paid · {ghs(o.total)}</div>
      <h1 className="num text-5xl font-bold leading-tight">{o.challengeName} is on.</h1>
      <p className="text-muted">Thank you, {o.company}. Walkers can join now. Share the code or link with your audience.</p>
      <div className="card p-6 space-y-3">
        <div className="label">Invite code</div>
        <div className="num text-5xl font-bold tracking-[0.3em]">{o.challenge.inviteCode}</div>
        <a className="text-sm underline break-all" href={o.challenge.link}>{o.challenge.link}</a>
        <div className="text-xs text-muted">
          Runs {new Date(o.challenge.startsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} → {new Date(o.challenge.endsAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>
      <p className="text-xs text-muted">A receipt from Paystack is on its way to your email.</p>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen px-4 grid place-items-center" style={{ background: "radial-gradient(70% 45% at 50% 0%, #e8c36a22, transparent 70%)" }}>
      <div className="max-w-xl w-full py-16">
        <Suspense fallback={<p className="text-muted">Loading…</p>}>
          <Thanks />
        </Suspense>
      </div>
    </main>
  );
}
