import { Suspense } from "react";
import LeadForm from "@/components/lead-form";

export default function LeadFormPage({ searchParams }: { searchParams: Promise<{ ref?: string; campaign?: string }> }) {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading form…</div>}><ReferralForm searchParams={searchParams} /></Suspense>;
}

async function ReferralForm({ searchParams }: { searchParams: Promise<{ ref?: string; campaign?: string }> }) {
  const params = await searchParams;
  return <LeadForm referralCode={params.ref ?? ""} campaign={params.campaign ?? ""} />;
}
