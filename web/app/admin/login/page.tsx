"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, tokens } from "@/lib/api";

type VerifyRes = { tokens: { access: string; refresh: string }; me: { role: string; name: string } };

/** Admin sign-in: the same email code as the app; only accounts with the admin role get past it. */
export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/otp", { method: "POST", body: { email } });
      setStep("code");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<VerifyRes>("/auth/verify", { method: "POST", body: { email, code } });
      if (res.me.role !== "admin") {
        setError("That account isn't an admin.");
        return;
      }
      tokens.set(res.tokens);
      router.replace("/admin");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center px-4" style={{ background: "radial-gradient(60% 40% at 50% 0%, #d7ff3a1f, transparent 70%)" }}>
      <div className="w-full max-w-sm">
        <Image src="/steppool-icon.svg" alt="StepPool" width={48} height={48} unoptimized className="rounded-xl mb-5" />
        <div className="label" style={{ color: "var(--volt)" }}>StepPool · Admin</div>
        <h1 className="num text-4xl font-bold mt-3 mb-8">{step === "email" ? "Sign in" : "Enter the code"}</h1>
        {step === "email" ? (
          <form onSubmit={send} className="space-y-3">
            <input className="input h-12" type="email" placeholder="you@steppool.app" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            <button className="btn btn-volt w-full h-12" disabled={busy || !email}>{busy ? "Sending…" : "Email me a code"}</button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-muted">Sent to {email}. Check spam if it isn&apos;t there in a minute.</p>
            <input className="input h-14 num text-2xl tracking-[0.5em] text-center" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required />
            <button className="btn btn-volt w-full h-12" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Sign in"}</button>
            <button type="button" className="text-sm text-muted w-full" onClick={() => setStep("email")}>Use a different email</button>
          </form>
        )}
        {error ? <p className="text-sm mt-4" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </div>
    </main>
  );
}
