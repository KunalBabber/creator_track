import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreatorTrack — Referral management",
  description: "Track creator referrals, leads, commissions, and payments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
