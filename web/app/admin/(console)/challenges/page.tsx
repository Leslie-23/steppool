"use client";

import { useEffect, useState } from "react";

import { api, fmt, ghs } from "@/lib/api";

type Row = { id: string; name: string; kind: string; status: string; visibility: string; inviteCode: string; players: number; finishers: number | null; entryCredits: number; entryPesewas: number; pool: number; paidOnline: boolean; sponsor: string | null; startsAt: string; endsAt: string };

const STATUS: Record<string, string> = { live: "var(--volt)", upcoming: "var(--muted)", settling: "var(--gold)", settled: "var(--faint)" };

export default function Challenges() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    api<Row[]>("/admin/challenges").then(setRows).catch(() => setRows([]));
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <div className="label">Challenges</div>
        <h1 className="num text-4xl font-bold mt-1">{rows ? fmt(rows.length) : "…"} recent</h1>
      </header>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {["Challenge", "Status", "Players", "Finished", "Entry", "Pool", "Ends"].map((h) => (
                <th key={h} className="label px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows?.map((c) => (
              <tr key={c.id} className="border-t border-hairline">
                <td className="px-4 py-3">
                  <div>{c.name}</div>
                  <div className="text-xs text-muted">{c.sponsor ? `Sponsored by ${c.sponsor}${c.paidOnline ? " · paid online" : ""}` : c.kind === "cash" ? `Cash · ${c.visibility}` : c.visibility} · code <span className="num tracking-widest">{c.inviteCode}</span></div>
                </td>
                <td className="px-4 py-3"><span style={{ color: STATUS[c.status] }}>●</span> {c.status}</td>
                <td className="px-4 py-3 num">{fmt(c.players)}</td>
                <td className="px-4 py-3 num">{c.finishers === null ? "—" : fmt(c.finishers)}</td>
                <td className="px-4 py-3 num">{c.kind === "cash" ? ghs(c.entryPesewas) : c.entryCredits ? fmt(c.entryCredits) : "Free"}</td>
                <td className="px-4 py-3 num text-gold">{c.kind === "cash" ? ghs(c.pool) : fmt(c.pool)}</td>
                <td className="px-4 py-3 text-muted">{new Date(c.endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
