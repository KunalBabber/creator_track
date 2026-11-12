"use client";

import {
  Activity, BarChart3, ClipboardList, CreditCard, ExternalLink,
  LayoutDashboard, Link2, LoaderCircle, LogOut, Menu, UserRound, Wallet,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type DashboardData = {
  creator: { name: string };
  total_clicks?: number;
  total_leads?: number;
  qualified_leads?: number;
  completed_clients?: number;
  pending_clients?: number;
  rejected_leads?: number;
  conversion_rate?: number;
  commission_earned?: number;
  pending_commission?: number;
  paid_commission?: number;
  referral_links?: { campaign: string; code: string }[];
  payment_history?: { amount: number; date: string; method: string }[];
  lead_performance?: { month: string; leads: number; completed: number }[];
  monthly_performance?: { month: string; leads: number; completed: number }[];
  recent_activity?: { status: string; date: string }[];
};
type Section = "Overview" | "My Referral Link" | "My Leads" | "My Performance" | "My Commissions" | "My Payments" | "My Profile";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function CreatorPortal() {
  const supabase = getSupabase();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [section, setSection] = useState<Section>("Overview");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!supabase) { setBusy(false); return; }
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) { setError(sessionError.message); setBusy(false); return; }
    if (!session) { router.replace("/creator/login"); return; }
    setEmail(session.user.email ?? "");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/creator/dashboard", {
        headers: { Authorization: "Bearer " + session.access_token },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) { await supabase.auth.signOut(); router.replace("/creator/login"); return; }
        throw new Error(result.error ?? "Could not load creator dashboard.");
      }
      setData(result as DashboardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load creator dashboard.");
    } finally {
      setBusy(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const nav = useMemo(() => {
    const items: { name: Section; icon: typeof LayoutDashboard }[] = [{ name: "Overview", icon: LayoutDashboard }];
    if (data?.referral_links) items.push({ name: "My Referral Link", icon: Link2 });
    if (data?.recent_activity) items.push({ name: "My Leads", icon: ClipboardList });
    if (data?.lead_performance || data?.monthly_performance) items.push({ name: "My Performance", icon: BarChart3 });
    if (data?.commission_earned !== undefined || data?.pending_commission !== undefined || data?.paid_commission !== undefined) items.push({ name: "My Commissions", icon: Wallet });
    if (data?.payment_history) items.push({ name: "My Payments", icon: CreditCard });
    items.push({ name: "My Profile", icon: UserRound });
    return items;
  }, [data]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      setNotice("Referral link copied.");
    } catch {
      setError("Clipboard access was denied. Use the Open link button instead.");
    }
  };
  const logout = async () => { await supabase?.auth.signOut(); router.replace("/creator/login"); };
  const links = (data?.referral_links ?? []).map(({ campaign, code }) => {
    const params = new URLSearchParams({ ref: code });
    if (campaign !== "General") params.set("campaign", campaign);
    return { campaign, url: `/lead-form?${params.toString()}` };
  });

  return <div className="min-h-screen bg-[#f7f8fb] md:flex">
    {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#101c33] px-4 py-5 text-white transition-transform md:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="mb-8 flex items-center gap-3 px-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600"><Activity size={20} /></span><div><div className="font-bold">CreatorTrack</div><div className="text-[11px] text-slate-400">CREATOR PORTAL</div></div></div>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-500">My workspace</p>
      <nav className="space-y-1">{nav.map(({ name, icon: Icon }) => <button key={name} onClick={() => { setSection(name); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition ${section === name ? "bg-blue-600 font-semibold text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon size={17} />{name}</button>)}</nav>
      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3"><p className="text-xs font-medium">{data?.creator.name ?? "Creator account"}</p><p className="mt-1 truncate text-[11px] text-slate-400">{email}</p></div>
    </aside>
    <div className="min-w-0 flex-1 md:ml-[248px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
        <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button><div><div className="text-sm font-semibold text-slate-800">{section}</div><div className="hidden text-[11px] text-slate-400 sm:block">Your creator performance at a glance.</div></div></div>
        <button onClick={() => void logout()} className="btn-secondary"><LogOut size={14} /> Sign out</button>
      </header>
      <main className="mx-auto max-w-[1300px] px-4 py-6 md:px-8 md:py-8">
        {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
        {busy && <div className="mb-4 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={15} className="animate-spin" />Loading your dashboard…</div>}
        {data && <>
          {section === "Overview" && <Overview data={data} links={links} onCopy={copy} />}
          {section === "My Referral Link" && <ReferralSection links={links} onCopy={copy} />}
          {section === "My Leads" && <ActivitySection items={data.recent_activity ?? []} />}
          {section === "My Performance" && <PerformanceSection chart={data.lead_performance} monthly={data.monthly_performance} />}
          {section === "My Commissions" && <CommissionsSection data={data} />}
          {section === "My Payments" && <PaymentsSection items={data.payment_history ?? []} />}
          {section === "My Profile" && <ProfileSection name={data.creator.name} email={email} />}
        </>}
      </main>
    </div>
  </div>;
}

function PageTitle({ title, description }: { title: string; description: string }) { return <div className="mb-6"><h1 className="text-[22px] font-bold tracking-tight text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>; }
function Metric({ title, value }: { title: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><p className="text-xs font-medium text-slate-500">{title}</p><p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p></div>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="mb-4 text-sm font-semibold text-slate-800">{title}</h2>{children}</section>; }
function Overview({ data, links, onCopy }: { data: DashboardData; links: { campaign: string; url: string }[]; onCopy: (url: string) => void }) {
  const metrics = [
    ["Total clicks", data.total_clicks], ["Total leads", data.total_leads], ["Qualified leads", data.qualified_leads],
    ["Completed clients", data.completed_clients], ["Pending clients", data.pending_clients], ["Rejected leads", data.rejected_leads],
    ["Conversion rate", data.conversion_rate === undefined ? undefined : `${data.conversion_rate}%`],
    ["Commission earned", data.commission_earned === undefined ? undefined : money(data.commission_earned)],
    ["Pending commission", data.pending_commission === undefined ? undefined : money(data.pending_commission)],
    ["Paid commission", data.paid_commission === undefined ? undefined : money(data.paid_commission)],
  ] as const;
  const visible = metrics.filter(([, value]) => value !== undefined);
  return <>
    <PageTitle title={`Welcome, ${data.creator.name}`} description="Here's your creator performance summary." />
    {visible.length > 0 && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{visible.map(([title, value]) => <Metric key={title} title={title} value={value!} />)}</div>}
    {data.referral_links && <div className="mt-5"><ReferralSection links={links} onCopy={onCopy} compact /></div>}
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      {data.lead_performance && <Panel title="Lead performance"><Chart data={data.lead_performance} /></Panel>}
      {data.monthly_performance && <Panel title="Monthly performance"><Chart data={data.monthly_performance} /></Panel>}
      {data.recent_activity && <Panel title="Recent lead activity"><ActivityTable items={data.recent_activity} /></Panel>}
      {data.payment_history && <Panel title="Recent payments"><PaymentsTable items={data.payment_history.slice(0, 5)} /></Panel>}
      {!visible.length && !data.referral_links && !data.lead_performance && !data.monthly_performance && !data.recent_activity && !data.payment_history && <Panel title="Dashboard"><p className="text-sm text-slate-500">Your admin has not enabled dashboard information yet.</p></Panel>}
    </div>
  </>;
}
function ReferralSection({ links, onCopy, compact = false }: { links: { campaign: string; url: string }[]; onCopy: (url: string) => void; compact?: boolean }) {
  return <Panel title={compact ? "Your referral link" : "My referral links"}>{links.length ? <div className="space-y-3">{links.map((link, index) => <div key={`${link.campaign}-${index}`} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center"><div className="min-w-0"><p className="text-sm font-medium">{link.campaign}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-500">{typeof window === "undefined" ? "" : window.location.origin}{link.url}</p></div><div className="flex shrink-0 gap-2"><button onClick={() => onCopy(link.url)} className="btn-secondary">Copy link</button><a href={link.url} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink size={14} /> Open</a></div></div>)}</div> : <p className="text-sm text-slate-500">No active referral links are available.</p>}</Panel>;
}
function Chart({ data }: { data: { month: string; leads: number; completed: number }[] }) {
  return <div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ left: -20, right: 8 }}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Line dataKey="leads" name="Leads" stroke="#2563eb" strokeWidth={2.5} /><Line dataKey="completed" name="Completed" stroke="#34d399" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div>;
}
function PerformanceSection({ chart, monthly }: { chart?: { month: string; leads: number; completed: number }[]; monthly?: { month: string; leads: number; completed: number }[] }) {
  return <><PageTitle title="My performance" description="Monthly lead and conversion performance enabled by your admin." /><div className="grid gap-5 xl:grid-cols-2">{chart && <Panel title="Lead performance"><Chart data={chart} /></Panel>}{monthly && <Panel title="Monthly performance"><div className="h-[260px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="leads" fill="#2563eb" radius={[4, 4, 0, 0]} /><Bar dataKey="completed" fill="#34d399" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>}</div></>;
}
function ActivitySection({ items }: { items: { status: string; date: string }[] }) {
  return <><PageTitle title="My leads" description="Recent activity is aggregated. Customer names and contact details are not shown." /><Panel title="Recent lead status updates"><ActivityTable items={items} /></Panel></>;
}
function ActivityTable({ items }: { items: { status: string; date: string }[] }) {
  return items.length ? <div className="divide-y divide-slate-100">{items.map((item, index) => <div key={`${item.date}-${index}`} className="flex items-center justify-between py-3"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{item.status}</span><span className="text-xs text-slate-500">{new Date(item.date).toLocaleDateString()}</span></div>)}</div> : <p className="py-6 text-center text-sm text-slate-400">No recent lead activity.</p>;
}
function CommissionsSection({ data }: { data: DashboardData }) {
  const rows = [["Earned commission", data.commission_earned], ["Pending commission", data.pending_commission], ["Paid commission", data.paid_commission]].filter((entry) => entry[1] !== undefined);
  return <><PageTitle title="My commissions" description="Commission totals visible under the permissions set by your admin." /><Panel title="Commission summary">{rows.length ? <div className="grid gap-3 sm:grid-cols-3">{rows.map(([title, value]) => <Metric key={String(title)} title={String(title)} value={money(Number(value))} />)}</div> : <p className="text-sm text-slate-500">Commission summaries are not enabled.</p>}</Panel></>;
}
function PaymentsSection({ items }: { items: { amount: number; date: string; method: string }[] }) {
  return <><PageTitle title="My payments" description="Payment records created by your business admin." /><Panel title="Payment history"><PaymentsTable items={items} /></Panel></>;
}
function PaymentsTable({ items }: { items: { amount: number; date: string; method: string }[] }) {
  return items.length ? <div className="overflow-x-auto"><table className="w-full min-w-[400px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr><th className="pb-3 font-medium">Amount</th><th className="pb-3 font-medium">Method</th><th className="pb-3 font-medium">Date</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.date}-${index}`} className="border-t border-slate-100"><td className="py-3 font-semibold">{money(Number(item.amount))}</td><td className="py-3">{item.method}</td><td className="py-3 text-slate-500">{new Date(item.date).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <p className="py-6 text-center text-sm text-slate-400">No payments recorded.</p>;
}
function ProfileSection({ name, email }: { name: string; email: string }) {
  return <><PageTitle title="My profile" description="Your account details." /><Panel title="Creator account"><div className="space-y-3 text-sm"><div><p className="text-xs text-slate-400">Name</p><p className="mt-1 font-medium">{name}</p></div><div><p className="text-xs text-slate-400">Login email</p><p className="mt-1 font-medium">{email}</p></div></div></Panel></>;
}
