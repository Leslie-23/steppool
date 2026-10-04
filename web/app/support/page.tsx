import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Support · StepPool" };

const FAQ: [string, string][] = [
  ["My steps aren't showing", "Make sure StepPool has permission to read steps in Apple Health (Settings → Health → Data Access) or Health Connect. Open StepPool to sync; new steps can take a few minutes to appear."],
  ["Why didn't some of my steps count?", "Manual entries and steps from unrecognised apps or devices don't count, and very unusual patterns are held for review. This keeps every challenge fair."],
  ["How are goals set?", "Your goal comes from your own usual daily steps, scaled by the challenge's difficulty, so every fitness level has a real chance."],
  ["What are credits?", "Free in-app points you earn by walking. They can't be bought or cashed out. You use them to enter credit challenges."],
  ["How do I claim a sponsored prize?", "When a sponsored challenge ends and you've hit your goal, open the result or your Wallet and tap Claim. Prizes go out within 5 working days."],
  ["How do I delete my account?", "Email us from the address you signed up with and we'll delete your account and data within 30 days."],
];

export default function Support() {
  return (
    <LegalPage title="Support" updated="4 October 2026">
      <p>Need help? Email <a className="underline" href="mailto:leslieajayi27@gmail.com">leslieajayi27@gmail.com</a> and we&apos;ll reply within 2 working days.</p>
      <div className="space-y-3 pt-2">
        {FAQ.map(([q, a]) => (
          <div key={q} className="card p-5">
            <div className="font-semibold">{q}</div>
            <p className="text-muted text-sm mt-1.5 leading-6">{a}</p>
          </div>
        ))}
      </div>
    </LegalPage>
  );
}
