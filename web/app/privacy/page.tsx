import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · StepPool" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="num text-xl font-bold pt-4">{children}</h2>;

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="4 October 2026">
      <p>StepPool (&ldquo;we&rdquo;) runs walking challenges. This policy explains what we collect, why, and your choices. Questions: <a className="underline" href="mailto:leslieajayi27@gmail.com">leslieajayi27@gmail.com</a>.</p>

      <H>What we collect</H>
      <ul className="list-disc pl-5 space-y-2">
        <li><b>Account details:</b> your email address and the name you choose. If you sign in with Apple or Google, we receive an identifier from them and, if you allow it, your email and name.</li>
        <li><b>Step data:</b> with your permission, step counts from Apple Health or Health Connect, including time ranges and which app or device recorded them. We read steps only. StepPool never writes to Apple Health or Health Connect.</li>
        <li><b>Activity in StepPool:</b> challenges you create or join, credits earned and spent, and notification preferences.</li>
        <li><b>Prize claims:</b> if you claim a sponsored prize, the mobile money number and network you give us so the prize can be sent.</li>
        <li><b>Device push token:</b> if you allow notifications, so we can send them.</li>
      </ul>

      <H>How we use it</H>
      <ul className="list-disc pl-5 space-y-2">
        <li>To run challenges: verify steps, show leaderboards, work out who hit their goal, and pay out credits or prizes.</li>
        <li>To keep challenges fair: we check step data for patterns that suggest faking, such as manual entries or shaker devices.</li>
        <li>To send the notifications you&apos;ve allowed, and sign-in codes by email.</li>
      </ul>
      <p>We do not sell your data, use health data for advertising, or share step data with sponsors in a way that identifies you. Sponsors see only totals, such as how many people joined and finished.</p>

      <H>Who can see what</H>
      <p>Other people in a challenge you join can see your display name, step total and rank in that challenge. Nobody else sees your step data.</p>

      <H>Service providers</H>
      <p>We use hosting and infrastructure providers to run StepPool, including Render (servers), MongoDB Atlas (database), Resend (email) and Expo (push notifications). They process data only on our behalf.</p>

      <H>Retention and deletion</H>
      <p>We keep your data while your account is active. Notifications are deleted after 60 days. To delete your account and data, email us from the address you signed up with and we&apos;ll delete it within 30 days. You can stop step sharing at any time in Apple Health or Health Connect settings.</p>

      <H>Children</H>
      <p>StepPool is not intended for children under 13.</p>

      <H>Changes</H>
      <p>If we change this policy we&apos;ll update the date above and, for significant changes, tell you in the app.</p>
    </LegalPage>
  );
}
