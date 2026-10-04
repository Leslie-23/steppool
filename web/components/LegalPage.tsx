import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for the plain-text pages (privacy, support, contest rules). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-screen px-4">
      <div className="max-w-2xl mx-auto py-8">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <Image src="/steppool-icon.svg" alt="" width={28} height={28} unoptimized className="rounded-lg" />
          <span className="num font-bold tracking-[0.25em]" style={{ color: "var(--volt)" }}>STEPPOOL</span>
        </Link>
        <h1 className="num text-4xl font-bold mt-12">{title}</h1>
        <p className="text-muted text-sm mt-2">Last updated {updated}</p>
        <article className="legal mt-10 space-y-5 text-[15px] leading-7 text-ink/90">{children}</article>
        <footer className="mt-16 pt-6 border-t border-hairline text-sm text-muted flex gap-5">
          <Link href="/privacy">Privacy</Link>
          <Link href="/rules">Challenge rules</Link>
          <Link href="/support">Support</Link>
        </footer>
      </div>
    </main>
  );
}
