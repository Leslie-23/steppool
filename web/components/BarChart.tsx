"use client";

import { useState } from "react";

/**
 * Single-series daily bar chart. One series, so no legend: the card title names it.
 * Marks: 4px rounded data-ends anchored to the baseline, 2px gaps, recessive axis,
 * a hover/focus tooltip per bar, and a table view for screen readers and exact values.
 */
export function BarChart({ data, color = "var(--volt)", height = 160, unit }: { data: { day: string; n: number }[]; color?: string; height?: number; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.n));
  const fmtDay = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const h = hover === null ? null : data[hover];

  return (
    <div>
      <div className="h-6 text-sm">
        {h ? (
          <span>
            <span className="num font-bold">{h.n.toLocaleString("en-GB")}</span> <span className="text-muted">{unit} · {fmtDay(h.day)}</span>
          </span>
        ) : (
          <span className="text-muted">Hover a bar for the exact value</span>
        )}
      </div>
      <div className="relative mt-2 flex items-end gap-[2px]" style={{ height }} role="img" aria-label={`${unit} per day, last ${data.length} days`} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <button
            key={d.day}
            className="flex-1 h-full flex items-end focus:outline-none"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            aria-label={`${fmtDay(d.day)}: ${d.n} ${unit}`}
          >
            <span
              className="w-full block transition-opacity"
              style={{
                height: `${Math.max(d.n ? 3 : 1, (d.n / max) * 100)}%`,
                background: d.n ? color : "var(--raised)",
                borderRadius: "4px 4px 0 0",
                opacity: hover === null || hover === i ? 1 : 0.35,
              }}
            />
          </button>
        ))}
      </div>
      <div className="border-t border-hairline" />
      <div className="flex justify-between text-xs text-faint mt-2">
        <span>{fmtDay(data[0]?.day ?? "")}</span>
        <span>{fmtDay(data[Math.floor(data.length / 2)]?.day ?? "")}</span>
        <span>Today</span>
      </div>
      <button className="text-xs text-muted underline mt-3" onClick={() => setTable((t) => !t)}>
        {table ? "Hide table" : "View as table"}
      </button>
      {table ? (
        <table className="w-full text-sm mt-2">
          <tbody>
            {[...data].reverse().map((d) => (
              <tr key={d.day} className="border-t border-hairline">
                <td className="py-1.5 text-muted">{fmtDay(d.day)}</td>
                <td className="py-1.5 text-right num">{d.n.toLocaleString("en-GB")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
