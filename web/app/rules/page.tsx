import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Challenge Rules · StepPool" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="num text-xl font-bold pt-4">{children}</h2>;

export default function Rules() {
  return (
    <LegalPage title="Official Challenge Rules" updated="4 October 2026">
      <p className="card p-4 text-sm"><b>Apple and Google are not sponsors of, and are not involved in, any StepPool challenge or prize.</b> No purchase is necessary to enter or win.</p>

      <H>Credits</H>
      <p>Credits are an in-app points system. They are free, are earned by walking, referrals and weekly top-ups, cannot be bought, and have no cash value. They cannot be exchanged for money or transferred outside StepPool.</p>

      <H>Credit challenges</H>
      <ul className="list-disc pl-5 space-y-2">
        <li>Entry may cost credits, which go into the challenge pool.</li>
        <li>Each player gets a personal step goal based on their own usual pace, set when they join.</li>
        <li>When the challenge ends, the pool is split evenly between everyone who reached their goal. If nobody does, every entry is refunded.</li>
      </ul>

      <H>Sponsored challenges</H>
      <ul className="list-disc pl-5 space-y-2">
        <li>Sponsored challenges are free to enter. The prize is funded by the named sponsor and described on the challenge.</li>
        <li>Eligible winners are players who reach their personal goal before the challenge ends, up to any winner limit shown on the challenge.</li>
        <li>Prizes are sent by mobile money or airtime within 5 working days of a valid claim. The account name should match the player&apos;s StepPool name.</li>
        <li>Open to individuals aged 18 or over, unless a challenge says otherwise. One account per person.</li>
      </ul>

      <H>Fair play</H>
      <p>Steps must come from walking recorded by your phone or watch. Manual entries, step-faking apps or devices, and other manipulation are excluded, and accounts that try may be disqualified. StepPool&apos;s step verification decides the final totals.</p>

      <H>Contact</H>
      <p>Questions or disputes: <a className="underline" href="mailto:leslieajayi27@gmail.com">leslieajayi27@gmail.com</a>.</p>
    </LegalPage>
  );
}
