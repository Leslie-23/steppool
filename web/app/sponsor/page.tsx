"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ghs, publicApi } from "@/lib/api";

const DURATIONS = [
  { label: "48 hours", value: 48 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
] as const;

/** Self-serve sponsorship: a brand describes its prize, pays with Paystack, and the challenge goes live. */
export default function Sponsor() {
  const [f, setF] = useState({ company: "", email: "", phone: "", logoUrl: "", challengeName: "", prizeDescription: "", prizeValueGhs: 1000, maxWinners: "", durationHours: 168 as 48 | 168 | 720, startsAt: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fee is set on the server; show whatever it currently is.
  const [feePct, setFeePct] = useState(15);
  useEffect(() => {
    publicApi<{ feePct: number }>("/sponsor/quote?prize=0").then((q) => setFeePct(q.feePct)).catch(() => {});
  }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const prize = Math.round((Number(f.prizeValueGhs) || 0) * 100);
  const fee = Math.round((prize * feePct) / 100);
  const winners = Number(f.maxWinners) || 0;
  const valid = f.company.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && f.challengeName.trim().length >= 3 && f.prizeDescription.trim().length >= 3 && prize >= 5000;

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await publicApi<{ checkoutUrl: string }>("/sponsor/checkout", {
        method: "POST",
        body: {
          company: f.company.trim(),
          email: f.email.trim(),
          phone: f.phone.trim() || undefined,
          logoUrl: f.logoUrl.trim() || undefined,
          challengeName: f.challengeName.trim(),
          prizeDescription: f.prizeDescription.trim(),
          prizeValueGhs: Math.round(Number(f.prizeValueGhs)),
          maxWinners: winners || undefined,
          durationHours: f.durationHours,
          startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : undefined,
        },
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen px-4 pb-24" style={{ background: "radial-gradient(70% 40% at 50% 0%, #e8c36a22, transparent 70%)" }}>
      <div className="max-w-5xl mx-auto py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/steppool-icon.svg" alt="" width={32} height={32} unoptimized className="rounded-lg" />
          <span className="num text-lg font-bold tracking-[0.25em]" style={{ color: "var(--volt)" }}>STEPPOOL</span>
        </Link>
      </div>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_360px] gap-8 pt-8">
        <form onSubmit={pay} className="space-y-6 min-w-0">
          <header>
            <div className="label" style={{ color: "var(--gold)" }}>For brands</div>
            <h1 className="num text-4xl sm:text-5xl font-bold mt-2 leading-tight">Sponsor a challenge</h1>
            <p className="text-muted mt-3 max-w-xl">Your brand on a public walking challenge. Everyone who hits their personal step goal shares your prize. Free for walkers to enter.</p>
          </header>

          <fieldset className="card p-5 space-y-3 min-w-0">
            <legend className="label px-1">Your brand</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className="input" placeholder="Company name" value={f.company} onChange={set("company")} required />
              <input className="input" type="email" placeholder="Billing email" value={f.email} onChange={set("email")} required />
              <input className="input" placeholder="Phone (optional)" value={f.phone} onChange={set("phone")} />
              <input className="input" placeholder="Logo URL (optional)" value={f.logoUrl} onChange={set("logoUrl")} />
            </div>
          </fieldset>

          <fieldset className="card p-5 space-y-3 min-w-0">
            <legend className="label px-1">The challenge</legend>
            <input className="input" placeholder="Challenge name, e.g. Kasapreko Walk Week" maxLength={48} value={f.challengeName} onChange={set("challengeName")} required />
            <input className="input" placeholder="Prize, as walkers will see it, e.g. GH₵1,000 shared + Kasa merch" maxLength={120} value={f.prizeDescription} onChange={set("prizeDescription")} required />
            <div className="grid sm:grid-cols-3 gap-3">
              <label className="space-y-1">
                <span className="label">Prize money (GH₵)</span>
                <input className="input" type="number" min={50} max={100000} step={1} value={f.prizeValueGhs} onChange={set("prizeValueGhs")} />
              </label>
              <label className="space-y-1">
                <span className="label">Max winners</span>
                <input className="input" type="number" min={1} placeholder="No limit" value={f.maxWinners} onChange={set("maxWinners")} />
              </label>
              <label className="space-y-1">
                <span className="label">Starts</span>
                <input className="input" type="datetime-local" value={f.startsAt} onChange={set("startsAt")} />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              {DURATIONS.map((d) => (
                <button type="button" key={d.value} className={`btn ${f.durationHours === d.value ? "btn-volt" : "btn-ghost"}`} onClick={() => setF({ ...f, durationHours: d.value })}>
                  {d.label}
                </button>
              ))}
            </div>
          </fieldset>
          {error ? <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
        </form>

        <aside className="lg:sticky lg:top-8 h-fit space-y-3">
          <div className="card p-6 space-y-4">
            <div className="label">Summary</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted">Prize pool</span><span className="num">{ghs(prize)}</span></div>
              <div className="flex justify-between"><span className="text-muted">StepPool fee ({feePct}%)</span><span className="num">{ghs(fee)}</span></div>
              <div className="flex justify-between border-t border-hairline pt-2 text-base"><span>Total</span><span className="num font-bold text-gold">{ghs(prize + fee)}</span></div>
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {winners ? `Up to ${winners} winners get ${ghs(Math.floor(prize / winners))} or more each.` : "Split evenly between everyone who hits their goal."} We send the prize to winners by mobile money. Pay by MoMo or card through Paystack.
            </p>
            <button className="btn btn-gold w-full h-12" disabled={!valid || busy} onClick={pay}>
              {busy ? "Opening Paystack…" : `Pay ${ghs(prize + fee)}`}
            </button>
          </div>
          <p className="text-xs text-muted px-1">The challenge goes live as soon as payment clears. Questions: <a className="underline" href="mailto:leslieajayi27@gmail.com">leslieajayi27@gmail.com</a></p>
        </aside>
      </div>
    </main>
  );
}
