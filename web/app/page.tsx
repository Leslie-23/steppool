import Link from "next/link";

const POINTS = [
  { k: "Your goal, not theirs", v: "Every walker gets a target from their own usual week, so a desk job and a market stall both have a real shot." },
  { k: "Everyone who makes it wins", v: "Hit your goal and you share the pool. No single winner, no luck, just walking." },
  { k: "Fair by design", v: "Steps are verified on our side. Shakers, fake apps and manual entries don't count." },
];

/** Placeholder landing until the full marketing site; keeps the brand, not the framework template. */
export default function Home() {
  return (
    <main className="min-h-screen px-4" style={{ background: "radial-gradient(70% 45% at 50% 0%, #d7ff3a22, transparent 70%)" }}>
      <div className="max-w-5xl mx-auto py-8 flex items-center justify-between">
        <span className="num text-lg font-bold tracking-[0.25em]" style={{ color: "var(--volt)" }}>STEPPOOL</span>
        <Link href="/admin" className="text-sm text-muted hover:text-ink">Admin</Link>
      </div>
      <section className="max-w-5xl mx-auto pt-16 pb-24">
        <h1 className="num font-bold text-5xl sm:text-7xl leading-[0.95] tracking-tight">
          Walk.
          <br />
          Hit your goal.
          <br />
          <span style={{ color: "var(--volt)" }}>Share the pool.</span>
        </h1>
        <p className="text-muted text-lg mt-6 max-w-xl">Step challenges with your class, your office or the whole country. Free to play. No deposits, no betting.</p>
        <div className="flex flex-wrap gap-3 mt-10">
          <span className="btn btn-volt h-12 px-6">iPhone · coming soon</span>
          <span className="btn btn-ghost h-12 px-6">Android · coming soon</span>
        </div>
        <div className="grid md:grid-cols-3 gap-3 mt-20">
          {POINTS.map((p) => (
            <div key={p.k} className="card p-6">
              <div className="num text-xl font-bold">{p.k}</div>
              <p className="text-muted text-sm mt-2 leading-relaxed">{p.v}</p>
            </div>
          ))}
        </div>
        <div className="card p-6 mt-3 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label" style={{ color: "var(--gold)" }}>For brands</div>
            <div className="num text-2xl font-bold mt-1">Sponsor a challenge</div>
            <p className="text-muted text-sm mt-1">Put your name in front of thousands of people walking every day.</p>
          </div>
          <a className="btn btn-gold h-12 px-6" href="mailto:leslieajayi27@gmail.com?subject=Sponsoring%20a%20StepPool%20challenge">Talk to us</a>
        </div>
      </section>
    </main>
  );
}
