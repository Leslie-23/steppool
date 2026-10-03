"use client";

import { useState } from "react";

import { api, fmt } from "@/lib/api";

/** Send an announcement to every user: inbox for all, push for those who allow it. */
export default function Broadcast() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inbox: number; pushed: number; pushTargets: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = title.trim().length >= 2 && body.trim().length >= 2;

  const send = async () => {
    if (!confirm(`Send "${title}" to every StepPool user?`)) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api("/admin/broadcast", { method: "POST", body: { title: title.trim(), body: body.trim() } }));
      setTitle("");
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <div className="label">Broadcast</div>
        <h1 className="num text-4xl font-bold mt-1">Message everyone</h1>
        <p className="text-muted text-sm mt-2">Lands in every inbox. Pushed to phones that allow notifications and haven&apos;t turned off announcements.</p>
      </header>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="card p-5 space-y-3">
          <label className="block">
            <span className="label">Title</span>
            <input className="input mt-1" maxLength={80} placeholder="Launch week: double credits" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block">
            <span className="label">Message</span>
            <textarea className="input mt-1 min-h-28" maxLength={240} placeholder="Hit your target any day this week for +40 instead of +20." value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="text-xs text-faint">{body.length}/240</span>
          </label>
          <button className="btn btn-volt" disabled={!ready || busy} onClick={send}>{busy ? "Sending…" : "Send to everyone"}</button>
          {error ? <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}
          {result ? (
            <p className="text-sm text-muted">
              In {fmt(result.inbox)} inboxes. Pushed to {fmt(result.pushed)} of {fmt(result.pushTargets)} phones with notifications on.
            </p>
          ) : null}
        </div>

        {/* Lock-screen preview so you can see how it reads before sending. */}
        <div className="rounded-[36px] p-4 border border-hairline" style={{ background: "linear-gradient(160deg,#1b2210,#07080a 60%)" }}>
          <div className="text-center num text-5xl font-bold mt-6">9:41</div>
          <div className="text-center text-xs text-muted mb-8">Saturday 3 October</div>
          <div className="rounded-2xl p-3 backdrop-blur" style={{ background: "rgba(40,42,46,0.75)" }}>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="w-5 h-5 rounded-md grid place-items-center text-[10px] font-bold" style={{ background: "var(--volt)", color: "var(--bg)" }}>S</span>
              STEPPOOL <span className="ml-auto">now</span>
            </div>
            <div className="text-sm font-semibold mt-1.5">{title || "Your title"}</div>
            <div className="text-sm text-ink/80">{body || "Your message shows here."}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
