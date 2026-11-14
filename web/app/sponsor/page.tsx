"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { API_URL, ghs, publicApi } from "@/lib/api";

const DURATIONS = [
  { label: "48 hours", value: 48 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
] as const;

const LIMITS = { minPrize: 50, maxPrize: 100_000, maxWinners: 10_000 };
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Mirrors the server's prize line (shared/cash.ts sponsorPrizeText): built from the amount, never typed. */
function prizeText(prizeGhs: number, maxWinners: number, extra: string) {
  const amount = `GH₵${prizeGhs.toLocaleString("en-GH")}`;
  const split = maxWinners === 1 ? `${amount} for the first finisher` : maxWinners ? `${amount} shared by the first ${maxWinners.toLocaleString("en-GH")} finishers` : `${amount} shared`;
  return extra.trim() ? `${split} + ${extra.trim()}` : split;
}

/** Decodes the picked file (which proves it is a real image), fits it in 256px and re-encodes it small. */
async function prepareLogo(file: File): Promise<Blob> {
  if (!LOGO_TYPES.includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("That image is over 8 MB. Choose a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't a valid image."));
      el.src = url;
    });
    if (img.naturalWidth < 64 || img.naturalHeight < 64) throw new Error("That image is too small. Use one at least 64px wide and tall.");
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const encode = (type: string, q?: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    // PNG keeps transparency; a photo that stays large as PNG goes out as JPEG instead.
    let blob = await encode("image/png");
    if (!blob || blob.size > 250_000) blob = await encode("image/jpeg", 0.85);
    if (!blob || blob.size > 250_000) throw new Error("We couldn't shrink that image. Try a simpler logo.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Fields = "company" | "email" | "phone" | "logo" | "challengeName" | "prizeValueGhs" | "maxWinners" | "prizeExtra" | "startsAt";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block min-w-0">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="block text-xs" style={{ color: "var(--danger)" }}>{error}</span> : hint ? <span className="block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/** Self-serve sponsorship: a brand describes its prize, pays with Paystack, and the challenge goes live. */
export default function Sponsor() {
  const [f, setF] = useState({ company: "", email: "", phone: "", challengeName: "", prizeExtra: "", prizeValueGhs: "1000", maxWinners: "", durationHours: 168 as 48 | 168 | 720, startsAt: "" });
  const [logo, setLogo] = useState<{ url: string; name: string } | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState<Partial<Record<Fields, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The fee is set on the server; show whatever it currently is.
  const [feePct, setFeePct] = useState(15);
  useEffect(() => {
    publicApi<{ feePct: number }>("/sponsor/quote?prize=0").then((q) => setFeePct(q.feePct)).catch(() => {});
  }, []);
  const bind = (k: Exclude<Fields, "logo">) => ({
    value: f[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
  });

  const prizeGhs = Number(f.prizeValueGhs);
  const winners = f.maxWinners.trim() === "" ? 0 : Number(f.maxWinners);
  const phone = f.phone.replace(/[\s()-]/g, "");
  const errors: Partial<Record<Fields, string>> = {};
  if (f.company.trim().length < 2) errors.company = "Enter your company name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = "Enter a valid billing email.";
  if (phone && !/^\+?\d{7,15}$/.test(phone)) errors.phone = "Enter a valid phone number, e.g. 0241234567.";
  if (f.challengeName.trim().length < 3) errors.challengeName = "Give the challenge a name (at least 3 characters).";
  if (!Number.isInteger(prizeGhs) || prizeGhs < LIMITS.minPrize || prizeGhs > LIMITS.maxPrize) errors.prizeValueGhs = `Enter a whole amount from GH₵${LIMITS.minPrize} to GH₵${LIMITS.maxPrize.toLocaleString("en-GH")}.`;
  if (f.maxWinners.trim() !== "" && (!Number.isInteger(winners) || winners < 1 || winners > LIMITS.maxWinners)) errors.maxWinners = `Enter a whole number from 1 to ${LIMITS.maxWinners.toLocaleString("en-GH")}, or leave it empty.`;
  if (f.startsAt && !(new Date(f.startsAt).getTime() > Date.now())) errors.startsAt = "Pick a start time in the future, or leave it empty.";
  const show = (k: Fields) => (submitted || touched[k] ? errors[k] : undefined);
  const valid = Object.keys(errors).length === 0 && !logoBusy;

  const prizeOk = !errors.prizeValueGhs && !errors.maxWinners;
  const prize = prizeOk ? prizeGhs * 100 : 0;
  const fee = Math.round((prize * feePct) / 100);

  const pickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again should still fire
    if (!file) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const blob = await prepareLogo(file);
      const res = await fetch(`${API_URL}/sponsor/logo`, { method: "POST", headers: { "content-type": blob.type }, body: blob });
      const json = (await res.json().catch(() => ({}))) as { logoUrl?: string; error?: string };
      if (!res.ok || !json.logoUrl) throw new Error(json.error ?? "We couldn't upload that image. Try again.");
      setLogo({ url: json.logoUrl, name: file.name });
    } catch (err) {
      setLogoError((err as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    if (!valid) return;
    setBusy(true);
    try {
      const { checkoutUrl } = await publicApi<{ checkoutUrl: string }>("/sponsor/checkout", {
        method: "POST",
        body: {
          company: f.company.trim(),
          email: f.email.trim(),
          phone: phone || undefined,
          logoUrl: logo?.url,
          challengeName: f.challengeName.trim(),
          prizeExtra: f.prizeExtra.trim() || undefined,
          prizeValueGhs: prizeGhs,
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
        <form onSubmit={pay} noValidate className="space-y-6 min-w-0">
          <header>
            <div className="label" style={{ color: "var(--gold)" }}>For brands</div>
            <h1 className="num text-4xl sm:text-5xl font-bold mt-2 leading-tight">Sponsor a challenge</h1>
            <p className="text-muted mt-3 max-w-xl">Your brand on a public walking challenge. Everyone who hits their personal step goal shares your prize. Free for walkers to enter.</p>
          </header>

          <fieldset className="card p-5 space-y-4 min-w-0">
            <legend className="label px-1">Your brand</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Company name" error={show("company")}>
                <input className="input" autoComplete="organization" maxLength={60} placeholder="e.g. Kasapreko" {...bind("company")} />
              </Field>
              <Field label="Billing email" hint="Your receipt and challenge link go here." error={show("email")}>
                <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@company.com" {...bind("email")} />
              </Field>
              <Field label="Phone (optional)" error={show("phone")}>
                <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0241234567" {...bind("phone")} />
              </Field>
              <div className="space-y-1 min-w-0">
                <span className="label">Logo (optional)</span>
                <input ref={fileRef} type="file" accept={LOGO_TYPES.join(",")} className="hidden" onChange={pickLogo} />
                <div className="flex items-center gap-3">
                  {logo ? (
                    <img src={logo.url} alt="Your logo" className="h-11 w-11 rounded-lg object-contain shrink-0" style={{ background: "var(--raised)" }} />
                  ) : null}
                  <button type="button" className="btn btn-ghost" disabled={logoBusy} onClick={() => fileRef.current?.click()}>
                    {logoBusy ? "Uploading…" : logo ? "Change image" : "Choose image"}
                  </button>
                  {logo && !logoBusy ? (
                    <button type="button" className="text-xs text-muted underline" onClick={() => { setLogo(null); setLogoError(null); }}>
                      Remove
                    </button>
                  ) : null}
                </div>
                {logoError ? <span className="block text-xs" style={{ color: "var(--danger)" }}>{logoError}</span> : <span className="block text-xs text-muted truncate">{logo ? logo.name : "PNG, JPG or WebP. Shown on your challenge in the app."}</span>}
              </div>
            </div>
          </fieldset>

          <fieldset className="card p-5 space-y-4 min-w-0">
            <legend className="label px-1">The challenge</legend>
            <Field label="Challenge name" error={show("challengeName")}>
              <input className="input" placeholder="e.g. Kasapreko Walk Week" maxLength={48} {...bind("challengeName")} />
            </Field>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Prize money (GH₵)" error={show("prizeValueGhs")}>
                <input className="input" type="number" inputMode="numeric" min={LIMITS.minPrize} max={LIMITS.maxPrize} step={1} {...bind("prizeValueGhs")} />
              </Field>
              <Field label="Max winners (optional)" hint="Empty: everyone who hits their goal shares it." error={show("maxWinners")}>
                <input className="input" type="number" inputMode="numeric" min={1} max={LIMITS.maxWinners} step={1} placeholder="No limit" {...bind("maxWinners")} />
              </Field>
              <Field label="Starts (optional)" hint="Empty: starts at the next full hour." error={show("startsAt")}>
                <input className="input" type="datetime-local" {...bind("startsAt")} />
              </Field>
            </div>
            <Field label="Extra prize (optional)" hint="Anything on top of the money, e.g. branded merch." error={show("prizeExtra")}>
              <input className="input" maxLength={60} placeholder="e.g. branded merch" {...bind("prizeExtra")} />
            </Field>
            <div className="space-y-1">
              <span className="label">Duration</span>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button type="button" key={d.value} className={`btn ${f.durationHours === d.value ? "btn-volt" : "btn-ghost"}`} onClick={() => setF({ ...f, durationHours: d.value })}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--raised)" }}>
              <div className="label">Prize, as walkers will see it</div>
              <div className="num text-lg font-bold mt-1" style={{ color: "var(--gold)" }}>{prizeOk ? prizeText(prizeGhs, winners, f.prizeExtra) : "Enter the prize money above"}</div>
              <div className="text-xs text-muted mt-1">Written from the amount you pay, so it always matches.</div>
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
              {winners && prizeOk ? `Up to ${winners} winners get ${ghs(Math.floor(prize / winners))} or more each.` : "Split evenly between everyone who hits their goal."} We send the prize to winners by mobile money. Pay by MoMo or card through Paystack.
            </p>
            <button className="btn btn-gold w-full h-12" disabled={busy || logoBusy} onClick={pay}>
              {busy ? "Opening Paystack…" : `Pay ${ghs(prize + fee)}`}
            </button>
            {submitted && !valid ? <p className="text-xs" style={{ color: "var(--danger)" }}>Fix the highlighted fields to continue.</p> : null}
          </div>
          <p className="text-xs text-muted px-1">The challenge goes live as soon as payment clears. Questions: <a className="underline" href="mailto:leslieajayi27@gmail.com">leslieajayi27@gmail.com</a></p>
        </aside>
      </div>
    </main>
  );
}
