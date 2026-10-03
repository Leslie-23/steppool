"use client";

import { useEffect, useState } from "react";

import { BarChart } from "@/components/BarChart";
import { api, fmt } from "@/lib/api";

type Metrics = {
  users: number;
  newUsers7d: number;
  activeToday: number;
  active7d: number;
  liveChallenges: number;
  joins7d: number;
  completionRate: number | null;
  creditsInCirculation: number;
  payoutsToFulfil: number;
  stepsToday: number;
  signups: { day: string; n: number }[];
  dailyActive: { day: string; n: number }[];
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

export default function Overview() {
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => api<Metrics>("/admin/metrics").then(setM).catch((e) => setError(e.message));
    load();
    const id = setInterval(load, 30_000); // live-ish without a socket
    return () => clearInterval(id);
  }, []);

  if (error) return <p style={{ color: "var(--danger)" }}>{error}</p>;
  if (!m) return <p className="text-muted text-sm">Loading metrics…</p>;

  return (
    <div className="space-y-8">
      <header>
        <div className="label">Overview</div>
        <h1 className="num text-4xl font-bold mt-1">How StepPool is doing</h1>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile label="Users" value={fmt(m.users)} sub={`+${fmt(m.newUsers7d)} this week`} />
        <Tile label="Walking today" value={fmt(m.activeToday)} sub={`${fmt(m.active7d)} this week`} accent="var(--volt)" />
        <Tile label="Steps today" value={fmt(m.stepsToday)} sub="verified, all users" />
        <Tile label="Goal completion" value={m.completionRate === null ? "—" : `${Math.round(m.completionRate * 100)}%`} sub="finished ÷ settled players" />
        <Tile label="Live challenges" value={fmt(m.liveChallenges)} sub={`${fmt(m.joins7d)} joins this week`} />
        <Tile label="Credits out there" value={fmt(m.creditsInCirculation)} sub="sum of all balances" accent="var(--gold)" />
        <Tile label="Prizes to pay" value={fmt(m.payoutsToFulfil)} sub="claimed, awaiting MoMo" accent={m.payoutsToFulfil ? "var(--gold)" : undefined} />
        <Tile label="Retention signal" value={m.users ? `${Math.round((m.active7d / m.users) * 100)}%` : "—"} sub="active this week ÷ all users" />
      </section>

      <section className="grid lg:grid-cols-2 gap-3">
        <div className="card p-6">
          <div className="label mb-2">People walking per day</div>
          <BarChart data={m.dailyActive} unit="people walking" />
        </div>
        <div className="card p-6">
          <div className="label mb-2">New sign-ups per day</div>
          <BarChart data={m.signups} unit="sign-ups" color="var(--gold)" />
        </div>
      </section>
    </div>
  );
}
