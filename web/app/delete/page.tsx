import type { Metadata } from "next";

import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Delete your account · StepPool" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="num text-xl font-bold pt-4">{children}</h2>;

export default function DeleteAccount() {
  return (
    <LegalPage title="Delete your account" updated="14 November 2026">
      <p>You can delete your StepPool account and the data linked to it at any time. StepPool is published by Leslie Paul Ajayi.</p>

      <H>Delete it in the app</H>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Open StepPool and go to <b>Profile</b>.</li>
        <li>Tap <b>Delete account</b>.</li>
        <li>Hold the red button to confirm.</li>
      </ol>
      <p>Your account is deleted straight away. If you have a cash balance, withdraw it first; the app will tell you if that applies.</p>

      <H>Can&apos;t open the app?</H>
      <p>Email <a className="underline" href="mailto:leslieajayi27@gmail.com?subject=Delete%20my%20StepPool%20account">leslieajayi27@gmail.com</a> from the address you signed up with and ask us to delete your account. We&apos;ll do it within 30 days and confirm by email.</p>

      <H>What is deleted</H>
      <ul className="list-disc pl-5 space-y-2">
        <li>Your profile: name, email address and sign-in identifiers.</li>
        <li>Your step data and activity history.</li>
        <li>Your notifications and device push token.</li>
        <li>Your places in challenges, your credits and any unclaimed prizes.</li>
        <li>The mobile money number on any prize claim that has not been paid.</li>
      </ul>

      <H>What is kept</H>
      <ul className="list-disc pl-5 space-y-2">
        <li>Records of payments already made, such as prizes paid out, kept for as long as accounting and tax rules require.</li>
        <li>Anonymous bookkeeping behind challenge pools, which no longer identifies you.</li>
      </ul>

      <H>Step sharing</H>
      <p>Deleting your account does not change what is stored in Apple Health or Health Connect. You can remove StepPool&apos;s access there at any time in their settings.</p>

      <p>More detail is in our <a className="underline" href="/privacy">Privacy Policy</a>.</p>
    </LegalPage>
  );
}
