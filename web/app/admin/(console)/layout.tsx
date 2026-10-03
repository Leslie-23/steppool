"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api, tokens } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users & credits" },
  { href: "/admin/broadcast", label: "Broadcast" },
  { href: "/admin/challenges", label: "Challenges" },
  { href: "/admin/payouts", label: "Prize payouts" },
];

/** Every console page sits behind an admin session; anything else bounces to sign-in. */
export default function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  const router = useRouter();
  const path = usePathname();
  const [me, setMe] = useState<{ name: string; email: string } | null>(null);

  useEffect(() => {
    if (!tokens.get()) {
      router.replace("/admin/login");
      return;
    }
    api<{ name: string; email: string; role: string }>("/me")
      .then((m) => (m.role === "admin" ? setMe(m) : router.replace("/admin/login")))
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  if (!me) return <div className="min-h-screen grid place-items-center text-muted text-sm">Loading…</div>;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-hairline p-4 md:p-6 md:min-h-screen">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/steppool-icon.svg" alt="" width={36} height={36} unoptimized className="rounded-lg" />
          <div>
            <div className="label" style={{ color: "var(--volt)" }}>StepPool</div>
            <div className="num text-lg font-bold leading-tight">Admin</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition-colors ${active ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden md:block mt-10 text-xs text-muted">
          <div className="text-ink">{me.name || "Admin"}</div>
          <div className="truncate">{me.email}</div>
          <button
            className="mt-3 underline"
            onClick={() => {
              tokens.clear();
              router.replace("/admin/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="p-4 md:p-10 max-w-6xl w-full">{children}</main>
    </div>
  );
}
