"use client";

import {
  Activity, ArrowDownToLine, ArrowUpRight, BarChart3, Bell, Check,
  CircleDollarSign, ClipboardList, Copy, CreditCard, ExternalLink, Filter,
  LayoutDashboard, Link2, LoaderCircle, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, ShoppingBag, Users, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { Commission, CommissionModel, Creator, Lead, LeadStatus, Payment, Product } from "@/lib/types";

type View = "Overview" | "Creators" | "Referral Links" | "Leads" | "Conversions" | "Commissions" | "Payments" | "Analytics" | "Reports" | "Settings";
type DbResult = { error?: { message: string } | null };
type DbOperation = () => PromiseLike<DbResult>;
type CreatorDraft = {
  name: string; email: string; phone: string; platform: string; profile_url: string;
  commission_model: CommissionModel; commission_value: string;
};
type MonthlyPerformance = { month: string; leads: number; conversions: number; revenue: number };
type GoogleIntegration = { form_url: string | null; sheet_url: string | null; referral_entry_id: string | null; campaign_entry_id: string | null; is_active: boolean };

const navigation: { name: View; icon: typeof LayoutDashboard }[] = [
  { name: "Overview", icon: LayoutDashboard }, { name: "Creators", icon: Users },
  { name: "Referral Links", icon: Link2 }, { name: "Leads", icon: ClipboardList },
  { name: "Conversions", icon: Activity }, { name: "Commissions", icon: CircleDollarSign },
  { name: "Payments", icon: CreditCard }, { name: "Analytics", icon: BarChart3 },
  { name: "Reports", icon: ArrowDownToLine }, { name: "Settings", icon: Settings },
];
const statuses: LeadStatus[] = ["New", "Contacted", "Qualified", "Converted", "Rejected"];
const blue = "#2563eb";
const formatMoney = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);
const emptyCreator: CreatorDraft = { name: "", email: "", phone: "", platform: "", profile_url: "", commission_model: "qualified_lead", commission_value: "0" };

function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    const safeText = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function classNames(...values: (string | false | undefined)[]) { return values.filter(Boolean).join(" "); }
function makeGooglePrefillUrl(formUrl: string | null | undefined, referralEntryId: string | null | undefined, campaignEntryId: string | null | undefined, code: string, campaign: string) {
  if (!formUrl || !referralEntryId) return "";
  try {
    const url = new URL(formUrl);
    url.searchParams.set("usp", "pp_url");
    url.searchParams.set(`entry.${referralEntryId}`, code);
    if (campaignEntryId) url.searchParams.set(`entry.${campaignEntryId}`, campaign);
    return url.toString();
  } catch {
    return "";
  }
}

export default function Dashboard() {
  const supabase = getSupabase();
  const [view, setView] = useState<View>("Overview");
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [monthAnchor, setMonthAnchor] = useState<number | null>(null);
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creators, setCreators] = useState<Creator[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [links, setLinks] = useState<Record<string, unknown>[]>([]);
  const [integration, setIntegration] = useState<GoogleIntegration | null>(null);
  const [search, setSearch] = useState("");
  const [leadStatus, setLeadStatus] = useState("All statuses");
  const [leadSource, setLeadSource] = useState("All sources");
  const [leadSort, setLeadSort] = useState<"newest" | "oldest">("newest");
  const [creatorModal, setCreatorModal] = useState(false);
  const [editing, setEditing] = useState<Creator | null>(null);
  const [creatorDraft, setCreatorDraft] = useState<CreatorDraft>(emptyCreator);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [businessName, setBusinessName] = useState("Your business");
  const [logoUrl, setLogoUrl] = useState("");
  const [defaultCommissionModel, setDefaultCommissionModel] = useState<CommissionModel>("qualified_lead");
  const [defaultCommissionValue, setDefaultCommissionValue] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Bank transfer");
  const [paymentReference, setPaymentReference] = useState("");

  const loadData = useCallback(async () => {
    if (!supabase || !user) return;
    setLoading(true); setError("");
    const results = await Promise.all([
      supabase.from("creators").select("*").order("created_at", { ascending: false }),
      supabase.from("leads").select("*, products(name)").order("created_at", { ascending: false }),
      supabase.from("products").select("*").order("name"),
      supabase.from("commissions").select("*, creators(name, referral_code)").order("created_at", { ascending: false }),
      supabase.from("payments").select("*, creators(name, referral_code)").order("created_at", { ascending: false }),
      supabase.from("referral_links").select("*, creators(name, referral_code)").order("created_at", { ascending: false }),
      supabase.from("business_settings").select("business_name,logo_url,default_commission_model,default_commission_value").maybeSingle(),
      supabase.from("integrations").select("form_url,sheet_url,referral_entry_id,campaign_entry_id,is_active").eq("provider", "google_forms").maybeSingle(),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) setError(`Could not load workspace data: ${failed.error.message}`);
    else {
      setCreators((results[0].data ?? []) as Creator[]);
      setLeads(((results[1].data ?? []) as (Lead & { products: { name: string } | null })[]).map((lead) => ({ ...lead, product_name: lead.products?.name ?? null })));
      setProducts((results[2].data ?? []) as Product[]);
      setCommissions((results[3].data ?? []) as Commission[]);
      setPayments((results[4].data ?? []) as Payment[]);
      setLinks((results[5].data ?? []) as Record<string, unknown>[]);
      const settings = results[6].data as { business_name?: string; logo_url?: string | null; default_commission_model?: CommissionModel; default_commission_value?: number } | null;
      if (settings?.business_name) setBusinessName(settings.business_name);
      if (settings) {
        setLogoUrl(settings.logo_url ?? "");
        setDefaultCommissionModel(settings.default_commission_model ?? "qualified_lead");
        setDefaultCommissionValue(String(settings.default_commission_value ?? 0));
      }
      setIntegration((results[7].data as GoogleIntegration | null) ?? null);
    }
    setLoading(false);
  }, [supabase, user]);

  useEffect(() => {
    if (!supabase) return;
    supabase.from("products").select("id").limit(1).then(({ error: schemaError }) => {
      if (schemaError?.code === "PGRST205" || schemaError?.code === "42P01") setMigrationRequired(true);
      else if (!schemaError) setMigrationRequired(false);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ? { email: data.session.user.email } : null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setUser(session?.user ? { email: session.user.email } : null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const timer = window.setTimeout(() => setMonthAnchor(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const action = async (operation: DbOperation, success: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await operation();
      if (result.error) throw new Error(result.error.message);
      setNotice(success); await loadData();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong."); }
    finally { setBusy(false); }
  };

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    const result = signup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setError(result.error.message);
    else if (signup && !result.data.session) setNotice("Check your email to confirm your account, then sign in.");
    setBusy(false);
  };

  const openCreator = (creator?: Creator) => {
    setEditing(creator ?? null);
    setCreatorDraft(creator ? {
      name: creator.name, email: creator.email, phone: creator.phone ?? "", platform: creator.platform ?? "",
      profile_url: creator.profile_url ?? "", commission_model: creator.commission_model, commission_value: String(creator.commission_value),
    } : { ...emptyCreator, commission_model: defaultCommissionModel, commission_value: defaultCommissionValue });
    setCreatorModal(true);
  };

  const saveCreator = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!supabase) return;
    const payload = {
      name: creatorDraft.name.trim(), email: creatorDraft.email.trim(), phone: creatorDraft.phone.trim() || null,
      platform: creatorDraft.platform || null, profile_url: creatorDraft.profile_url.trim() || null,
      commission_model: creatorDraft.commission_model, commission_value: Number(creatorDraft.commission_value),
    };
    const result = editing
      ? await supabase.from("creators").update(payload).eq("id", editing.id)
      : await supabase.from("creators").insert(payload);
    if (result.error) setError(result.error.message);
    else { setCreatorModal(false); setNotice(editing ? "Creator updated." : "Creator added and referral link generated."); await loadData(); }
  };

  const filteredLeads = useMemo(() => leads.filter((lead) => {
    const creator = creators.find((item) => item.id === lead.creator_id);
    const phrase = `${lead.customer_name} ${lead.email} ${lead.phone} ${lead.referral_code} ${creator?.name ?? ""}`.toLowerCase();
    return (!search || phrase.includes(search.toLowerCase())) && (leadStatus === "All statuses" || lead.status === leadStatus) && (leadSource === "All sources" || lead.source === leadSource);
  }).sort((a, b) => leadSort === "newest" ? Date.parse(b.created_at) - Date.parse(a.created_at) : Date.parse(a.created_at) - Date.parse(b.created_at)), [leads, creators, search, leadStatus, leadSource, leadSort]);

  const totals = useMemo(() => ({
    creators: creators.filter((creator) => creator.is_active).length,
    leads: leads.length,
    qualified: leads.filter((lead) => lead.status === "Qualified").length,
    converted: leads.filter((lead) => lead.status === "Converted").length,
    revenue: leads.filter((lead) => lead.status === "Converted").reduce((sum, lead) => sum + Number(lead.revenue_amount || 0), 0),
    commission: commissions.reduce((sum, commission) => sum + Number(commission.amount), 0),
    pending: commissions.filter((commission) => commission.status !== "paid").reduce((sum, commission) => sum + Number(commission.amount), 0),
  }), [creators, leads, commissions]);

  const creatorPerformance = creators.map((creator) => ({
  id: creator.id, name: creator.name, leads: leads.filter((lead) => lead.creator_id === creator.id).length,
    conversions: leads.filter((lead) => lead.creator_id === creator.id && lead.status === "Converted").length,
    revenue: leads.filter((lead) => lead.creator_id === creator.id).reduce((sum, lead) => sum + Number(lead.revenue_amount || 0), 0),
  }));
  const monthlyData = monthAnchor === null ? [] : Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monthAnchor); date.setDate(1); date.setMonth(date.getMonth() - (5 - index));
    const month = date.toLocaleString("en", { month: "short" });
    const monthLeads = leads.filter((lead) => { const item = new Date(lead.created_at); return item.getMonth() === date.getMonth() && item.getFullYear() === date.getFullYear(); });
    return {
      month,
      leads: monthLeads.length,
      conversions: monthLeads.filter((lead) => lead.status === "Converted").length,
      revenue: monthLeads.filter((lead) => lead.status === "Converted").reduce((sum, lead) => sum + Number(lead.revenue_amount || 0), 0),
    };
  });
  const pieData = [{ name: "Converted", value: totals.converted }, { name: "Other", value: Math.max(totals.leads - totals.converted, 0) }];

  const referralUrl = (code: string) => `${typeof window === "undefined" ? "" : window.location.origin}/lead-form?ref=${encodeURIComponent(code)}`;
  const copyLink = async (code: string) => {
    try { await navigator.clipboard.writeText(referralUrl(code)); setNotice("Referral link copied."); }
    catch { setError("Clipboard access was denied. Copy the referral URL manually."); }
  };
  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNotice("Referral link copied."); }
    catch { setError("Clipboard access was denied. Copy the referral URL manually."); }
  };
  const exportLeads = () => downloadCsv("creatortrack-leads.csv", [
    ["Customer", "Email", "Phone", "Creator", "Referral code", "Source", "Product", "Status", "Revenue", "Submitted"],
    ...filteredLeads.map((lead) => [lead.customer_name, lead.email, lead.phone, creators.find((item) => item.id === lead.creator_id)?.name, lead.referral_code, lead.source, lead.product_name, lead.status, lead.revenue_amount, lead.created_at]),
  ]);
  const exportCreators = () => downloadCsv("creatortrack-report.csv", [
    ["Creator", "Referral code", "Leads", "Conversions", "Conversion rate", "Revenue", "Commission"],
    ...creators.map((creator) => {
      const count = leads.filter((lead) => lead.creator_id === creator.id).length;
      const conversions = leads.filter((lead) => lead.creator_id === creator.id && lead.status === "Converted").length;
      return [creator.name, creator.referral_code, count, conversions, count ? `${((conversions / count) * 100).toFixed(1)}%` : "0%", creatorPerformance.find((item) => item.id === creator.id)?.revenue ?? 0, commissions.filter((commission) => commission.creator_id === creator.id).reduce((sum, commission) => sum + Number(commission.amount), 0)];
    }),
  ]);

  if (!supabase) return <SetupScreen />;
  if (authLoading) return <div className="grid min-h-screen place-items-center text-slate-500"><LoaderCircle className="animate-spin" /></div>;
  if (!user) return <AuthScreen email={email} setEmail={setEmail} password={password} setPassword={setPassword} signup={signup} setSignup={setSignup} signIn={signIn} busy={busy} error={error} notice={notice} migrationRequired={migrationRequired} />;

  return (
    <div className="min-h-screen md:flex">
      {mobileNav && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/40 md:hidden" onClick={() => setMobileNav(false)} />}
      <aside className={classNames("fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#101c33] px-4 py-5 text-white transition-transform md:translate-x-0", mobileNav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-3 px-3 pb-8">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600" style={logoUrl ? { backgroundImage: `url("${logoUrl}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>{!logoUrl && <Activity size={21} />}</div>
          <div><div className="text-[17px] font-bold tracking-tight">CreatorTrack</div><div className="text-[11px] text-slate-400">{businessName}</div></div>
        </div>
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[.15em] text-slate-500">Workspace</div>
        <nav className="space-y-1">
          {navigation.map(({ name, icon: Icon }) => <button key={name} onClick={() => { setView(name); setMobileNav(false); }} className={classNames("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition", view === name ? "bg-blue-600 font-semibold text-white" : "text-slate-300 hover:bg-white/10 hover:text-white")}>
            <Icon size={17} strokeWidth={1.8} />{name}
          </button>)}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-medium"><ShieldCheck size={15} className="text-emerald-400" /> Your workspace</div>
          <p className="text-[11px] leading-5 text-slate-400">Your creator data is protected by Supabase row-level security.</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 md:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
            <div><div className="text-sm font-semibold text-slate-800">{view}</div><div className="hidden text-[11px] text-slate-400 sm:block">Track partnerships. Grow with clarity.</div></div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-xs text-slate-500 sm:block">{user.email}</span>
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Notifications"><Bell size={18} /></button>
            <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700" onClick={async () => { await supabase.auth.signOut(); }}><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{user.email?.[0]?.toUpperCase() ?? "A"}</span><LogOut size={14} className="hidden sm:block" /></button>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
          {error && <div role="alert" className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
          {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
          {loading && <div className="mb-4 flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" />Syncing workspace data…</div>}
          {view === "Overview" && <Overview totals={totals} creators={creators} leads={leads} creatorPerformance={creatorPerformance} monthlyData={monthlyData} pieData={pieData} setView={setView} />}
          {view === "Creators" && <CreatorsView creators={creators} leads={leads} commissions={commissions} openCreator={openCreator} action={action} supabase={supabase} copyLink={copyLink} referralUrl={referralUrl} />}
          {view === "Referral Links" && <LinksView creators={creators} links={links} integration={integration} referralUrl={referralUrl} copyUrl={copyUrl} supabase={supabase} action={action} />}
          {view === "Leads" && <LeadsView leads={filteredLeads} allLeads={leads} creators={creators} search={search} setSearch={setSearch} leadStatus={leadStatus} setLeadStatus={setLeadStatus} leadSource={leadSource} setLeadSource={setLeadSource} leadSort={leadSort} setLeadSort={setLeadSort} exportLeads={exportLeads} action={action} supabase={supabase} />}
          {view === "Conversions" && <ConversionsView leads={leads.filter((lead) => lead.status === "Converted")} creators={creators} action={action} supabase={supabase} />}
          {view === "Commissions" && <CommissionsView commissions={commissions} creators={creators} action={action} supabase={supabase} />}
          {view === "Payments" && <PaymentsView commissions={commissions} payments={payments} creators={creators} paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod} paymentReference={paymentReference} setPaymentReference={setPaymentReference} action={action} supabase={supabase} />}
          {view === "Analytics" && <AnalyticsView creators={creators} commissions={commissions} creatorPerformance={creatorPerformance} monthlyData={monthlyData} totals={totals} clicks={links.reduce((sum, link) => sum + Number(link.click_count ?? 0), 0)} />}
          {view === "Reports" && <ReportsView creators={creators} leads={leads} commissions={commissions} creatorPerformance={creatorPerformance} exportCreators={exportCreators} exportLeads={exportLeads} />}
          {view === "Settings" && <SettingsView accountEmail={user.email ?? ""} businessName={businessName} setBusinessName={setBusinessName} logoUrl={logoUrl} setLogoUrl={setLogoUrl} defaultCommissionModel={defaultCommissionModel} setDefaultCommissionModel={setDefaultCommissionModel} defaultCommissionValue={defaultCommissionValue} setDefaultCommissionValue={setDefaultCommissionValue} integration={integration} products={products} productName={productName} setProductName={setProductName} productPrice={productPrice} setProductPrice={setProductPrice} action={action} supabase={supabase} />}
        </main>
      </div>

      {creatorModal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreatorModal(false); }}>
        <form onSubmit={saveCreator} className="max-h-[95vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold">{editing ? "Edit creator" : "Add a creator"}</h2><p className="mt-1 text-xs text-slate-500">A unique referral code and link are generated automatically.</p></div><button type="button" onClick={() => setCreatorModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Creator name"><input required value={creatorDraft.name} onChange={(e) => setCreatorDraft({ ...creatorDraft, name: e.target.value })} className="input" /></Field>
            <Field label="Email"><input required type="email" value={creatorDraft.email} onChange={(e) => setCreatorDraft({ ...creatorDraft, email: e.target.value })} className="input" /></Field>
            <Field label="Phone"><input value={creatorDraft.phone} onChange={(e) => setCreatorDraft({ ...creatorDraft, phone: e.target.value })} className="input" /></Field>
            <Field label="Social platform"><select value={creatorDraft.platform} onChange={(e) => setCreatorDraft({ ...creatorDraft, platform: e.target.value })} className="input"><option value="">Select platform</option>{["Instagram", "YouTube", "TikTok", "Facebook", "X", "LinkedIn", "Other"].map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Profile URL"><input type="url" value={creatorDraft.profile_url} onChange={(e) => setCreatorDraft({ ...creatorDraft, profile_url: e.target.value })} placeholder="https://" className="input" /></Field>
            <Field label="Commission model"><select value={creatorDraft.commission_model} onChange={(e) => setCreatorDraft({ ...creatorDraft, commission_model: e.target.value as CommissionModel })} className="input"><option value="qualified_lead">Per qualified lead</option><option value="sale_fixed">Per successful sale</option><option value="sale_percent">% of successful sale</option></select></Field>
            <Field label={creatorDraft.commission_model === "sale_percent" ? "Commission percentage" : "Commission amount (INR)"}><input type="number" min="0" step="0.01" required value={creatorDraft.commission_value} onChange={(e) => setCreatorDraft({ ...creatorDraft, commission_value: e.target.value })} className="input" /></Field>
          </div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setCreatorModal(false)} className="btn-secondary">Cancel</button><button disabled={busy} className="btn-primary">{busy ? "Saving…" : editing ? "Save changes" : "Add creator"}</button></div>
        </form>
      </div>}
    </div>
  );
}

function SetupScreen() {
  return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Activity /></div><h1 className="text-xl font-bold">Connect CreatorTrack to Supabase</h1><p className="mt-2 text-sm leading-6 text-slate-600">Add your project URL and public anon key to <code>.env.local</code>, then run the SQL migration in your Supabase project.</p><pre className="mt-5 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-200">NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key</pre><p className="mt-4 text-xs text-slate-500">Do not put the Supabase service-role key in any <code>NEXT_PUBLIC_</code> variable.</p></div></main>;
}

function AuthScreen({ email, setEmail, password, setPassword, signup, setSignup, signIn, busy, error, notice, migrationRequired }: {
  email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void;
  signup: boolean; setSignup: (value: boolean) => void; signIn: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean; error: string; notice: string; migrationRequired: boolean;
}) {
  return <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-5"><div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <div className="mb-7 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 text-white"><Activity /></div><div><h1 className="text-xl font-bold">CreatorTrack</h1><p className="text-xs text-slate-500">Creator referral management</p></div></div>
    <h2 className="text-lg font-semibold">{signup ? "Create your admin account" : "Welcome back"}</h2><p className="mt-1 text-sm text-slate-500">{signup ? "The first account created becomes the workspace admin." : "Sign in to manage your creator program."}</p>
    {migrationRequired && <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Supabase is reachable, but the CreatorTrack database schema is missing. Apply <code>supabase/migrations/202611110001_creatortrack.sql</code> in the Supabase SQL Editor, then reload before creating the admin account.</div>}
    <form onSubmit={signIn} className="mt-6 space-y-4"><Field label="Email"><input className="input" required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field><Field label="Password"><input className="input" required minLength={8} type="password" autoComplete={signup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>{error && <p role="alert" className="text-sm text-rose-600">{error}</p>}{notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}<button disabled={busy || (signup && migrationRequired)} className="btn-primary w-full">{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button></form>
    <button className="mt-4 w-full text-center text-sm font-medium text-blue-700 hover:underline" onClick={() => setSignup(!signup)}>{signup ? "Already have an account? Sign in" : "New to CreatorTrack? Create the admin account"}</button>
  </div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-slate-600">{label}<div className="mt-1.5">{children}</div></label>; }
function PageTitle({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) { return <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-[22px] font-bold tracking-tight text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>; }
function MetricCard({ title, value, detail, icon: Icon, tone = "blue" }: { title: string; value: string | number; detail: string; icon: typeof Users; tone?: string }) {
  const tones: Record<string, string> = { blue: "bg-blue-50 text-blue-600", green: "bg-emerald-50 text-emerald-600", purple: "bg-violet-50 text-violet-600", amber: "bg-amber-50 text-amber-600" };
  return <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-500">{title}</span><span className={classNames("grid h-9 w-9 place-items-center rounded-lg", tones[tone] ?? tones.blue)}><Icon size={17} /></span></div><div className="mt-3 text-[26px] font-bold tracking-tight text-slate-900">{value}</div><div className="mt-1 text-[11px] text-slate-400">{detail}</div></div>;
}
function Panel({ title, action, children, className = "" }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={classNames("rounded-xl border border-slate-200 bg-white p-4 sm:p-5", className)}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-800">{title}</h2>{action}</div>{children}</section>;
}
function Empty({ title, description }: { title: string; description: string }) { return <div className="grid min-h-40 place-items-center text-center"><div><div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-400"><ClipboardList size={18} /></div><p className="text-sm font-medium text-slate-700">{title}</p><p className="mt-1 text-xs text-slate-400">{description}</p></div></div>; }
function Overview({ totals, creators, leads, creatorPerformance, monthlyData, pieData, setView }: {
  totals: { creators: number; leads: number; qualified: number; converted: number; revenue: number; commission: number; pending: number };
  creators: Creator[]; leads: Lead[]; creatorPerformance: { id: string; name: string; leads: number; conversions: number; revenue: number }[];
  monthlyData: MonthlyPerformance[]; pieData: { name: string; value: number }[]; setView: (view: View) => void;
}) {
  return <>
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-medium uppercase tracking-wide text-blue-600">Performance overview</p><h1 className="mt-1 text-[25px] font-bold tracking-tight text-slate-900">Good to see you</h1><p className="mt-1 text-sm text-slate-500">Here’s how your creator program is performing.</p></div><button onClick={() => setView("Creators")} className="btn-primary"><Plus size={16} /> Add creator</button></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><MetricCard title="Total creators" value={totals.creators} detail="Active partners" icon={Users} /><MetricCard title="Total leads" value={totals.leads} detail="All-time referrals" icon={ClipboardList} tone="purple" /><MetricCard title="Qualified leads" value={totals.qualified} detail="Ready for follow-up" icon={Check} tone="green" /><MetricCard title="Converted customers" value={totals.converted} detail="Successful sales" icon={ArrowUpRight} tone="amber" /><MetricCard title="Total revenue" value={formatMoney(totals.revenue)} detail="From converted customers" icon={ShoppingBag} tone="green" /><MetricCard title="Total commission" value={formatMoney(totals.commission)} detail="Earned by creators" icon={CircleDollarSign} tone="purple" /><MetricCard title="Pending payments" value={formatMoney(totals.pending)} detail="Awaiting payment" icon={CreditCard} tone="amber" /><MetricCard title="Conversion rate" value={`${totals.leads ? ((totals.converted / totals.leads) * 100).toFixed(1) : "0.0"}%`} detail="Lead to customer" icon={BarChart3} /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.65fr_1fr]">
      <Panel title="Creator performance" action={<button onClick={() => setView("Analytics")} className="text-xs font-medium text-blue-600">View analytics <ArrowUpRight size={13} className="inline" /></button>}>{creatorPerformance.length ? <div className="h-[270px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={creatorPerformance} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="leads" fill={blue} radius={[5, 5, 0, 0]} /><Bar dataKey="conversions" fill="#34d399" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty title="No creator activity yet" description="Add creators and share their referral links to see performance." />}</Panel>
      <Panel title="Lead conversion"><div className="relative h-[225px]">{totals.leads ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pieData} dataKey="value" nameKey="name" innerRadius={66} outerRadius={88} paddingAngle={4}><Cell fill="#2563eb" /><Cell fill="#e2e8f0" /></Pie><Tooltip /></PieChart></ResponsiveContainer> : <Empty title="No leads yet" description="Leads will appear here after form submissions." />}{Boolean(totals.leads) && <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><div className="text-xl font-bold">{((totals.converted / totals.leads) * 100).toFixed(0)}%</div><div className="text-[10px] text-slate-400">converted</div></div></div>}</div><div className="flex justify-center gap-5 text-xs"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-600" />Converted ({totals.converted})</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-slate-200" />Other ({totals.leads - totals.converted})</span></div></Panel>
      <Panel title="Leads and conversions over time" className="xl:col-span-2"><div className="h-[250px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="leads" stroke={blue} strokeWidth={2.5} dot={{ fill: blue, r: 4 }} activeDot={{ r: 6 }} /><Line type="monotone" dataKey="conversions" stroke="#34d399" strokeWidth={2.5} dot={{ fill: "#34d399", r: 4 }} /></LineChart></ResponsiveContainer></div></Panel>
      <Panel title="Recent leads" action={<button onClick={() => setView("Leads")} className="text-xs font-medium text-blue-600">View all <ArrowUpRight size={13} className="inline" /></button>} className="xl:col-span-2"><RecentLeads leads={leads.slice(0, 5)} creators={creators} /></Panel>
    </div>
  </>;
}
function RecentLeads({ leads, creators }: { leads: Lead[]; creators: Creator[] }) {
  if (!leads.length) return <Empty title="Your leads will show up here" description="Share a creator link or connect a Google Form to start tracking." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr><th className="pb-3 font-medium">Customer</th><th className="pb-3 font-medium">Creator</th><th className="pb-3 font-medium">Product</th><th className="pb-3 font-medium">Status</th><th className="pb-3 font-medium">Date</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-slate-100"><td className="py-3"><div className="font-medium text-slate-800">{lead.customer_name}</div><div className="mt-1 text-slate-400">{lead.email}</div></td><td className="py-3 text-slate-600">{creators.find((item) => item.id === lead.creator_id)?.name ?? "Unknown"}</td><td className="py-3 text-slate-600">{lead.product_name ?? "—"}</td><td className="py-3"><StatusBadge status={lead.status} /></td><td className="py-3 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>;
}
function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = { New: "bg-blue-50 text-blue-700", Contacted: "bg-violet-50 text-violet-700", Qualified: "bg-amber-50 text-amber-700", Converted: "bg-emerald-50 text-emerald-700", Rejected: "bg-rose-50 text-rose-700", pending: "bg-amber-50 text-amber-700", approved: "bg-blue-50 text-blue-700", paid: "bg-emerald-50 text-emerald-700" };
  return <span className={classNames("inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold", style[status] ?? "bg-slate-100 text-slate-600")}>{status}</span>;
}
function CreatorsView({ creators, leads, commissions, openCreator, action, supabase, copyLink, referralUrl }: {
  creators: Creator[]; leads: Lead[]; commissions: Commission[]; openCreator: (creator?: Creator) => void;
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>; copyLink: (code: string) => void; referralUrl: (code: string) => string;
}) {
  return <><PageTitle title="Creators" description="Manage creators, their referral details, and commission rules." action={<button onClick={() => openCreator()} className="btn-primary"><Plus size={16} /> Add creator</button>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MiniStat title="Total creators" value={creators.length} /><MiniStat title="Active creators" value={creators.filter((item) => item.is_active).length} /><MiniStat title="Earned commission" value={formatMoney(commissions.reduce((sum, item) => sum + Number(item.amount), 0))} /></div>
    <Panel title="Creator directory">{creators.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Creator", "Referral code", "Leads", "Commission rule", "Status", "Actions"].map((item) => <th key={item} className="pb-3 font-medium">{item}</th>)}</tr></thead><tbody>{creators.map((creator) => <tr key={creator.id} className="border-t border-slate-100"><td className="py-3"><div className="font-semibold text-slate-800">{creator.name}</div><div className="mt-1 text-slate-400">{creator.email}{creator.platform ? ` · ${creator.platform}` : ""}</div></td><td className="py-3 font-mono text-blue-700">{creator.referral_code}</td><td className="py-3 font-medium">{leads.filter((lead) => lead.creator_id === creator.id).length}</td><td className="py-3 text-slate-600">{creator.commission_model === "qualified_lead" ? `${formatMoney(creator.commission_value)} / qualified lead` : creator.commission_model === "sale_fixed" ? `${formatMoney(creator.commission_value)} / sale` : `${creator.commission_value}% / sale`}</td><td className="py-3"><StatusBadge status={creator.is_active ? "Active" : "Inactive"} /></td><td className="py-3"><div className="flex gap-1"><button title="Copy referral link" className="icon-btn" onClick={() => copyLink(creator.referral_code)}><Copy size={15} /></button><a title="Open referral form" className="icon-btn" href={referralUrl(creator.referral_code)} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a><button title="Edit creator" className="icon-btn" onClick={() => openCreator(creator)}><Settings size={15} /></button><button title={creator.is_active ? "Deactivate creator" : "Activate creator"} className="icon-btn" onClick={() => void action(() => supabase.from("creators").update({ is_active: !creator.is_active }).eq("id", creator.id), `Creator ${creator.is_active ? "deactivated" : "activated"}.`)}>{creator.is_active ? <X size={15} /> : <Check size={15} />}</button></div></td></tr>)}</tbody></table></div> : <Empty title="No creators yet" description="Add your first creator to generate a unique referral code and link." />}</Panel>
  </>;
}
function MiniStat({ title, value }: { title: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{title}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></div>; }

function LinksView({ creators, links, integration, referralUrl, copyUrl, supabase, action }: {
  creators: Creator[]; links: Record<string, unknown>[]; integration: GoogleIntegration | null; referralUrl: (code: string) => string; copyUrl: (url: string) => void;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
  action: (operation: DbOperation, success: string) => Promise<void>;
}) {
  const [creatorId, setCreatorId] = useState(""); const [campaign, setCampaign] = useState("");
  const addCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!creatorId) return;
    await action(() => supabase.from("referral_links").insert({ creator_id: creatorId, campaign_name: campaign.trim() || "General" }), "Campaign link created.");
    setCampaign("");
  };
  return <><PageTitle title="Referral links" description="Every active creator gets a unique link. Create campaign-specific links and track clicks." />
    <Panel title="Create campaign link"><form onSubmit={addCampaign} className="flex flex-col gap-3 sm:flex-row"><select required value={creatorId} onChange={(e) => setCreatorId(e.target.value)} className="input sm:max-w-xs"><option value="">Select creator</option>{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name} · {creator.referral_code}</option>)}</select><input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Campaign name (e.g. Summer launch)" className="input flex-1" /><button className="btn-primary"><Plus size={15} /> Create link</button></form></Panel>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{links.map((link, index) => {
      const creator = link.creators as { name?: string; referral_code?: string } | null;
      const code = creator?.referral_code ?? "";
      const active = Boolean(link.is_active);
      const campaignName = String(link.campaign_name ?? "General");
      const linkUrl = `${referralUrl(code)}${campaignName === "General" ? "" : `&campaign=${encodeURIComponent(campaignName)}`}`;
      const googleUrl = makeGooglePrefillUrl(integration?.form_url, integration?.referral_entry_id, integration?.campaign_entry_id, code, campaignName);
      return <div key={String(link.id ?? index)} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex items-start justify-between"><div><div className="text-sm font-semibold text-slate-800">{creator?.name ?? "Creator"} <span className="font-mono text-xs font-normal text-blue-700">{code}</span></div><div className="mt-1 text-xs text-slate-500">{String(link.campaign_name ?? "General campaign")}</div></div><StatusBadge status={active ? "Active" : "Inactive"} /></div>                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3"><span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{linkUrl}</span><div className="flex gap-1"><button className="icon-btn" title="Copy custom lead link" onClick={() => copyUrl(linkUrl)}><Copy size={15} /></button><a className="icon-btn" title="Open custom lead form" href={linkUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a><button className="icon-btn" title={active ? "Deactivate link" : "Activate link"} onClick={() => void action(() => supabase.from("referral_links").update({ is_active: !active }).eq("id", String(link.id)), `Link ${active ? "deactivated" : "activated"}.`)}>{active ? <X size={15} /> : <Check size={15} />}</button></div></div>{googleUrl && <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"><div className="min-w-0"><p className="text-[11px] font-semibold text-slate-700">Google Form prefilled link</p><p className="mt-1 truncate font-mono text-[10px] text-slate-500">{googleUrl}</p></div><div className="flex shrink-0 gap-1"><button className="icon-btn" title="Copy prefilled Google Form link" onClick={() => copyUrl(googleUrl)}><Copy size={15} /></button><a className="icon-btn" title="Open prefilled Google Form" href={googleUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a></div></div>}<div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Activity size={14} className="text-blue-600" />{Number(link.click_count ?? 0)} tracked clicks</div></div>;
    })}</div>
    {!links.length && <div className="mt-5"><Panel title="Referral links"><Empty title="No referral links yet" description="Add an active creator and their general referral link will be generated automatically." /></Panel></div>}
  </>;
}

function LeadsView({ leads, allLeads, creators, search, setSearch, leadStatus, setLeadStatus, leadSource, setLeadSource, leadSort, setLeadSort, exportLeads, action, supabase }: {
  leads: Lead[]; allLeads: Lead[]; creators: Creator[];
  search: string; setSearch: (value: string) => void; leadStatus: string; setLeadStatus: (value: string) => void;
  leadSource: string; setLeadSource: (value: string) => void; leadSort: "newest" | "oldest"; setLeadSort: (value: "newest" | "oldest") => void; exportLeads: () => void;
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  return <><PageTitle title="Leads" description="Search, qualify, and follow up on every customer referral." action={<button onClick={exportLeads} className="btn-secondary"><ArrowDownToLine size={15} /> Export CSV</button>} />
    <Panel title="Lead directory" action={<span className="text-xs text-slate-400">{leads.length} of {allLeads.length} leads</span>}>
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_150px_150px_145px]"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, email, creator or code" className="input pl-9" /></div><select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)} className="input"><option>All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select><select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className="input"><option>All sources</option>{Array.from(new Set(allLeads.map((lead) => lead.source))).map((source) => <option key={source}>{source}</option>)}</select><select value={leadSort} onChange={(e) => setLeadSort(e.target.value as "newest" | "oldest")} className="input"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></div>
      {leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Customer", "Creator / code", "Source", "Product", "Status", "Revenue", "Notes", "Submitted"].map((item) => <th key={item} className="pb-3 font-medium">{item}</th>)}</tr></thead><tbody>{leads.map((lead) => {
        const duplicateCount = allLeads.filter((item) => item.id !== lead.id && (item.email.toLowerCase() === lead.email.toLowerCase() || item.phone.replace(/\D/g, "") === lead.phone.replace(/\D/g, ""))).length;
        return <tr key={lead.id} className="border-t border-slate-100 align-top"><td className="py-3"><div className="font-semibold text-slate-800">{lead.customer_name}{duplicateCount > 0 && <span title="Possible duplicate email or phone" className="ml-1 rounded bg-amber-100 px-1 text-[9px] text-amber-800">DUPLICATE</span>}</div><div className="mt-1 text-slate-400">{lead.email} · {lead.phone}</div>{lead.message && <div className="mt-1 max-w-[220px] truncate text-slate-400" title={lead.message}>{lead.message}</div>}</td><td className="py-3"><div className="text-slate-700">{creators.find((item) => item.id === lead.creator_id)?.name ?? "Unknown"}</div><div className="mt-1 font-mono text-[10px] text-blue-600">{lead.referral_code}</div></td><td className="py-3 text-slate-600">{lead.source}</td><td className="py-3 text-slate-600">{lead.product_name ?? "—"}</td><td className="py-3"><select aria-label={`Status for ${lead.customer_name}`} value={lead.status} onChange={(e) => void action(() => supabase.from("leads").update({ status: e.target.value as LeadStatus }).eq("id", lead.id), "Lead status updated.")} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"><option>{lead.status}</option>{statuses.filter((status) => status !== lead.status).map((status) => <option key={status}>{status}</option>)}</select></td><td className="py-3 text-slate-600">{lead.status === "Converted" ? formatMoney(lead.revenue_amount) : "—"}</td><td className="py-3"><NotesEditor lead={lead} action={action} supabase={supabase} /></td><td className="py-3 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td></tr>;
      })}</tbody></table></div> : <Empty title={allLeads.length ? "No leads match these filters" : "No leads yet"} description={allLeads.length ? "Try a different search or filter." : "Share referral links or connect a Google Form to collect leads."} />}
    </Panel>
    <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800"><Filter size={15} className="mt-0.5 shrink-0" />Duplicate leads are flagged when an email or phone matches another submission. The database also rejects duplicate submissions during form intake.</div>
  </>;
}

function ConversionsView({ leads, creators, action, supabase }: {
  leads: Lead[]; creators: Creator[];
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  return <><PageTitle title="Conversions" description="Record sale revenue to calculate creator commissions accurately." />
    <Panel title="Converted customers">{leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{["Customer", "Creator", "Referral", "Revenue (INR)", "Converted"].map((name) => <th key={name} className="pb-3 font-medium">{name}</th>)}</tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-slate-100"><td className="py-3"><div className="font-semibold">{lead.customer_name}</div><div className="mt-1 text-slate-400">{lead.email}</div></td><td className="py-3">{creators.find((creator) => creator.id === lead.creator_id)?.name ?? "Unknown"}</td><td className="py-3 font-mono text-blue-700">{lead.referral_code}</td><td className="py-3"><RevenueEditor lead={lead} action={action} supabase={supabase} /></td><td className="py-3 text-slate-500">{new Date(lead.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <Empty title="No conversions yet" description="Update a qualified lead to Converted when a sale is successful." />}</Panel>
  </>;
}
function RevenueEditor({ lead, action, supabase }: { lead: Lead; action: (operation: DbOperation, success: string) => Promise<void>; supabase: NonNullable<ReturnType<typeof getSupabase>> }) {
  const [value, setValue] = useState(String(lead.revenue_amount ?? 0));
  return <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); void action(() => supabase.from("leads").update({ revenue_amount: Number(value) }).eq("id", lead.id), "Sale revenue saved. Commission updated."); }}><span className="text-slate-400">₹</span><input aria-label="Sale revenue" type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className="w-28 rounded-md border border-slate-200 px-2 py-1.5" /><button className="text-xs font-medium text-blue-600 hover:underline">Save</button></form>;
}
function NotesEditor({ lead, action, supabase }: { lead: Lead; action: (operation: DbOperation, success: string) => Promise<void>; supabase: NonNullable<ReturnType<typeof getSupabase>> }) {
  const [value, setValue] = useState(lead.notes ?? "");
  return <form className="flex min-w-48 items-center gap-2" onSubmit={(event) => { event.preventDefault(); void action(() => supabase.from("leads").update({ notes: value.trim() || null }).eq("id", lead.id), "Lead notes saved."); }}><input aria-label={`Notes for ${lead.customer_name}`} maxLength={2000} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Add note…" className="w-36 rounded-md border border-slate-200 px-2 py-1.5" /><button className="text-xs font-medium text-blue-600 hover:underline">Save</button></form>;
}

function CommissionsView({ commissions, creators, action, supabase }: {
  commissions: Commission[]; creators: Creator[];
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  const pending = commissions.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.amount), 0);
  const approved = commissions.filter((item) => item.status === "approved").reduce((sum, item) => sum + Number(item.amount), 0);
  const paid = commissions.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.amount), 0);
  return <><PageTitle title="Commissions" description="Commission entries are generated once when a lead qualifies or converts." />
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><MiniStat title="Pending approval" value={formatMoney(pending)} /><MiniStat title="Approved" value={formatMoney(approved)} /><MiniStat title="Paid" value={formatMoney(paid)} /></div>
    <Panel title="Commission ledger">{commissions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{["Creator", "Lead", "Commission type", "Amount", "Status", "Action"].map((name) => <th key={name} className="pb-3 font-medium">{name}</th>)}</tr></thead><tbody>{commissions.map((commission) => {
      const creator = creators.find((item) => item.id === commission.creator_id);
      return <tr key={commission.id} className="border-t border-slate-100"><td className="py-3"><div className="font-semibold">{creator?.name ?? commission.creators?.name ?? "Creator"}</div><div className="mt-1 font-mono text-blue-600">{creator?.referral_code ?? commission.creators?.referral_code}</div></td><td className="py-3 font-mono text-slate-500">{commission.lead_id.slice(0, 8)}</td><td className="py-3 text-slate-600">{commission.commission_type.replaceAll("_", " ")}</td><td className="py-3 font-semibold">{formatMoney(Number(commission.amount))}</td><td className="py-3"><StatusBadge status={commission.status} /></td><td className="py-3">{commission.status === "pending" ? <button className="text-xs font-semibold text-blue-600 hover:underline" onClick={() => void action(() => supabase.from("commissions").update({ status: "approved" }).eq("id", commission.id), "Commission approved.")}>Approve</button> : commission.status === "approved" ? <span className="text-slate-400">Ready for payment</span> : <span className="text-emerald-700">Paid</span>}</td></tr>;
    })}</tbody></table></div> : <Empty title="No commissions earned yet" description="Commission entries appear automatically when leads qualify or convert." />}</Panel>
    <p className="mt-3 text-xs text-slate-400">Commission creation is idempotent: the database enforces one entry per lead and commission type.</p>
  </>;
}

function PaymentsView({ commissions, payments, creators, paymentMethod, setPaymentMethod, paymentReference, setPaymentReference, action, supabase }: {
  commissions: Commission[]; payments: Payment[]; creators: Creator[];
  paymentMethod: string; setPaymentMethod: (method: string) => void; paymentReference: string; setPaymentReference: (reference: string) => void;
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  const byCreator = creators.map((creator) => ({ creator, items: commissions.filter((item) => item.creator_id === creator.id && item.status === "approved"), amount: commissions.filter((item) => item.creator_id === creator.id && item.status === "approved").reduce((sum, item) => sum + Number(item.amount), 0) })).filter((item) => item.amount > 0);
  const settle = async (creatorId: string) => {
    const result = await supabase.rpc("record_creator_payment", { p_creator_id: creatorId, p_method: paymentMethod, p_reference: paymentReference || null });
    if (result.error) { await action(async () => ({ error: result.error }), ""); return; }
    await action(async () => ({ error: null }), `Payment recorded: ${formatMoney(Number(result.data))}.`);
    setPaymentReference("");
  };
  return <><PageTitle title="Payments" description="Review approved commissions, record manual payouts, and keep an auditable payment history." />
    <Panel title="Record a payment" ><div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Payments are recorded only after you send them outside CreatorTrack. This app never automatically transfers money.</div>
      {byCreator.length ? <div className="space-y-3">{byCreator.map(({ creator, items, amount }) => <div key={creator.id} className="flex flex-col justify-between gap-4 rounded-lg border border-slate-200 p-4 md:flex-row md:items-center"><div><div className="font-semibold text-slate-800">{creator.name}</div><div className="mt-1 text-xs text-slate-500">{items.length} approved commission{items.length === 1 ? "" : "s"} · {formatMoney(amount)}</div></div><div className="flex flex-col gap-2 sm:flex-row"><select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input sm:w-40"><option>Bank transfer</option><option>UPI</option><option>Cash</option><option>Other</option></select><input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Transaction reference (optional)" className="input sm:w-56" /><button onClick={() => void settle(creator.id)} className="btn-primary"><Check size={14} /> Mark paid</button></div></div>)}</div> : <Empty title="Nothing awaiting payment" description="Approve a commission first; approved balances will appear here." />}
    </Panel>
    <div className="mt-5"><Panel title="Payment history">{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{["Creator", "Amount", "Method", "Transaction reference", "Payment date"].map((name) => <th key={name} className="pb-3 font-medium">{name}</th>)}</tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="py-3 font-semibold">{payment.creators?.name ?? creators.find((item) => item.id === payment.creator_id)?.name ?? "Creator"}</td><td className="py-3 font-semibold">{formatMoney(Number(payment.amount))}</td><td className="py-3">{payment.method}</td><td className="py-3 text-slate-500">{payment.transaction_reference ?? "—"}</td><td className="py-3">{new Date(payment.payment_date).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <Empty title="No payments recorded" description="Completed payouts will be listed here." />}</Panel></div>
  </>;
}

function AnalyticsView({ creators, commissions, creatorPerformance, monthlyData, totals, clicks }: {
  creators: Creator[]; commissions: Commission[]; creatorPerformance: { id: string; name: string; leads: number; conversions: number; revenue: number }[]; monthlyData: MonthlyPerformance[]; totals: { leads: number; converted: number; revenue: number }; clicks: number;
}) {
  return <><PageTitle title="Analytics" description="Understand creator impact, funnel health, and monthly results." />
    <div className="grid gap-3 sm:grid-cols-3"><MetricCard title="Click-to-lead rate" value={clicks ? `${((totals.leads / clicks) * 100).toFixed(1)}%` : "—"} detail={`${clicks} tracked referral clicks`} icon={Link2} /><MetricCard title="Lead-to-sale rate" value={`${totals.leads ? ((totals.converted / totals.leads) * 100).toFixed(1) : "0.0"}%`} detail={`${totals.converted} of ${totals.leads} leads converted`} icon={ArrowUpRight} tone="green" /><MetricCard title="Revenue generated" value={formatMoney(totals.revenue)} detail="Across converted referrals" icon={CircleDollarSign} tone="purple" /></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><Panel title="Monthly leads and conversions"><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyData}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Line dataKey="leads" stroke={blue} strokeWidth={2.5} /><Line dataKey="conversions" stroke="#34d399" strokeWidth={2.5} /></LineChart></ResponsiveContainer></div></Panel>
      <Panel title="Monthly revenue"><div className="h-[280px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid stroke="#eef1f6" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tickFormatter={(value) => `₹${value}`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="revenue" fill={blue} radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div></Panel>
      <Panel title="Creator revenue"><div className="h-[280px]">{creatorPerformance.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={creatorPerformance} layout="vertical" margin={{ left: 10, right: 12 }}><CartesianGrid stroke="#eef1f6" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="revenue" fill={blue} radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer> : <Empty title="No revenue data" description="Converted leads with revenue show up here." />}</div></Panel>
      <Panel title="Creator conversion rates" className="xl:col-span-2">{creators.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase text-slate-400"><tr>{["Creator", "Leads", "Conversions", "Conversion rate", "Revenue", "Commission earned"].map((name) => <th key={name} className="pb-3 font-medium">{name}</th>)}</tr></thead><tbody>{creators.map((creator) => { const stats = creatorPerformance.find((item) => item.id === creator.id); const commissionsSum = commissions.filter((item) => item.creator_id === creator.id).reduce((sum, item) => sum + Number(item.amount), 0); return <tr key={creator.id} className="border-t border-slate-100"><td className="py-3 font-semibold">{creator.name}</td><td className="py-3">{stats?.leads ?? 0}</td><td className="py-3">{stats?.conversions ?? 0}</td><td className="py-3">{stats?.leads ? `${((stats.conversions / stats.leads) * 100).toFixed(1)}%` : "0%"}</td><td className="py-3">{formatMoney(stats?.revenue ?? 0)}</td><td className="py-3">{formatMoney(commissionsSum)}</td></tr>; })}</tbody></table></div> : <Empty title="No creator data yet" description="Creator metrics appear once referral activity is recorded." />}</Panel>
    </div>
  </>;
}

function ReportsView({ creators, leads, commissions, creatorPerformance, exportCreators, exportLeads }: {
  creators: Creator[]; leads: Lead[]; commissions: Commission[]; creatorPerformance: { id: string; name: string; leads: number; conversions: number; revenue: number }[]; exportCreators: () => void; exportLeads: () => void;
}) {
  const sorted = [...creatorPerformance].sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions);
  return <><PageTitle title="Reports" description="Export creator and lead performance for spreadsheets or accounting." />
    <div className="grid gap-4 md:grid-cols-2"><Panel title="Creator performance report" action={<button onClick={exportCreators} className="btn-secondary"><ArrowDownToLine size={14} /> Export CSV</button>}><p className="text-xs leading-5 text-slate-500">Creator totals, lead-to-sale conversion rate, revenue, and earned commission. CSV files open in Excel and Google Sheets.</p><div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{creators.length} creators · {leads.length} leads · {formatMoney(commissions.reduce((sum, item) => sum + Number(item.amount), 0))} commission</div></Panel><Panel title="Lead detail report" action={<button onClick={exportLeads} className="btn-secondary"><ArrowDownToLine size={14} /> Export CSV</button>}><p className="text-xs leading-5 text-slate-500">Detailed customer records with creator attribution, product, source, status, revenue, and submission date.</p><div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Includes {leads.length} matching lead records.</div></Panel></div>
    <div className="mt-5"><Panel title="Best performing creators">{sorted.length ? <div className="space-y-3">{sorted.slice(0, 5).map((creator, index) => <div key={`${creator.name}-${index}`} className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span><div className="flex-1"><div className="text-sm font-medium">{creator.name}</div><div className="mt-1 text-[11px] text-slate-400">{creator.leads} leads · {creator.conversions} conversions</div></div><div className="text-sm font-semibold">{formatMoney(creator.revenue)}</div></div>)}</div> : <Empty title="No report data" description="Performance rankings appear after leads are attributed." />}</Panel></div>
  </>;
}

function ProductRow({ product, action, supabase }: {
  product: Product; action: (operation: DbOperation, success: string) => Promise<void>; supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await action(() => supabase.from("products").update({ name: name.trim(), price: Number(price) }).eq("id", product.id), "Product updated.");
  };
  return <form onSubmit={save} className="flex flex-col gap-2 border-t border-slate-100 py-2.5 sm:flex-row sm:items-center">
    <input required maxLength={120} aria-label="Product name" value={name} onChange={(e) => setName(e.target.value)} className="input flex-1 py-2 text-xs" />
    <input required min="0" step="0.01" type="number" aria-label="Product price in INR" value={price} onChange={(e) => setPrice(e.target.value)} className="input sm:w-36 py-2 text-xs" />
    <div className="flex items-center gap-2"><button className="text-xs font-medium text-blue-600 hover:underline">Save</button><button type="button" className="text-xs font-medium text-slate-500 hover:text-blue-600" onClick={() => void action(() => supabase.from("products").update({ is_active: !product.is_active }).eq("id", product.id), `Product ${product.is_active ? "deactivated" : "activated"}.`)}>{product.is_active ? "Deactivate" : "Activate"}</button></div>
  </form>;
}

function SettingsView({ accountEmail, businessName, setBusinessName, logoUrl, setLogoUrl, defaultCommissionModel, setDefaultCommissionModel, defaultCommissionValue, setDefaultCommissionValue, integration, products, productName, setProductName, productPrice, setProductPrice, action, supabase }: {
  accountEmail: string;
  businessName: string; setBusinessName: (name: string) => void; logoUrl: string; setLogoUrl: (url: string) => void;
  defaultCommissionModel: CommissionModel; setDefaultCommissionModel: (model: CommissionModel) => void;
  defaultCommissionValue: string; setDefaultCommissionValue: (value: string) => void;
  integration: GoogleIntegration | null;
  products: Product[]; productName: string; setProductName: (name: string) => void; productPrice: string; setProductPrice: (price: string) => void;
  action: (operation: DbOperation, success: string) => Promise<void>;
  supabase: NonNullable<ReturnType<typeof getSupabase>>;
}) {
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [referralEntryId, setReferralEntryId] = useState<string | null>(null);
  const [campaignEntryId, setCampaignEntryId] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState(accountEmail);
  const [newPassword, setNewPassword] = useState("");
  const saveBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await action(() => supabase.from("business_settings").upsert({
      id: 1, business_name: businessName.trim(), logo_url: logoUrl.trim() || null, currency: "INR",
      default_commission_model: defaultCommissionModel, default_commission_value: Number(defaultCommissionValue),
    }), "Business settings saved.");
  };
  const addProduct = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); await action(() => supabase.from("products").insert({ name: productName.trim(), price: Number(productPrice), is_active: true }), "Product added."); setProductName(""); setProductPrice(""); };
  const saveGoogleIntegration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form_url = (formUrl ?? integration?.form_url ?? "").trim() || null;
    const sheet_url = (sheetUrl ?? integration?.sheet_url ?? "").trim() || null;
    const referral_entry_id = (referralEntryId ?? integration?.referral_entry_id ?? "").trim() || null;
    const campaign_entry_id = (campaignEntryId ?? integration?.campaign_entry_id ?? "").trim() || null;
    await action(() => supabase.from("integrations").upsert({ provider: "google_forms", form_url, sheet_url, referral_entry_id, campaign_entry_id, is_active: Boolean(form_url && referral_entry_id) }, { onConflict: "provider" }), "Google integration settings saved.");
  };
  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const updates: { email?: string; password?: string } = {};
    if (newEmail.trim() && newEmail.trim() !== accountEmail) updates.email = newEmail.trim();
    if (newPassword) updates.password = newPassword;
    if (!Object.keys(updates).length) return;
    await action(async () => {
      const { error } = await supabase.auth.updateUser(updates);
      return { error };
    }, updates.email ? "Email update requested. Confirm the change using the verification email." : "Password updated.");
  };
  return <><PageTitle title="Settings" description="Configure your business profile, products, default locale, and form integrations." />
    <div className="grid gap-5 xl:grid-cols-2"><Panel title="Business profile"><form onSubmit={saveBusiness} className="space-y-4"><Field label="Business name"><input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" /></Field><Field label="Logo URL (optional)"><input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://" className="input" /></Field><Field label="Currency"><select disabled className="input"><option>INR — Indian Rupee</option></select></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Default commission model"><select value={defaultCommissionModel} onChange={(e) => setDefaultCommissionModel(e.target.value as CommissionModel)} className="input"><option value="qualified_lead">Per qualified lead</option><option value="sale_fixed">Per successful sale</option><option value="sale_percent">% of successful sale</option></select></Field><Field label={defaultCommissionModel === "sale_percent" ? "Default percentage" : "Default amount (INR)"}><input type="number" min="0" step="0.01" value={defaultCommissionValue} onChange={(e) => setDefaultCommissionValue(e.target.value)} className="input" /></Field></div><button className="btn-primary">Save business settings</button></form></Panel>
      <Panel title="Products and prices"><form onSubmit={addProduct} className="mb-4 flex flex-col gap-2 sm:flex-row"><input required value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Product name" className="input flex-1" /><input required min="0" step="0.01" type="number" value={productPrice} onChange={(e) => setProductPrice(e.target.value)} placeholder="Price (INR)" className="input sm:w-36" /><button className="btn-primary"><Plus size={14} /> Add</button></form>{products.length ? <div>{products.map((product) => <ProductRow key={product.id} product={product} action={action} supabase={supabase} />)}</div> : <p className="py-5 text-center text-xs text-slate-400">No products configured.</p>}</Panel>
      <Panel title="Google Forms and Sheets" className="xl:col-span-2"><form onSubmit={saveGoogleIntegration} className="space-y-4"><div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900"><div className="font-semibold">Secure Apps Script integration</div><p className="mt-1 text-xs">Google Forms cannot preserve arbitrary URL parameters. Add a required referral code field to the form, prefill it using each creator’s referral link, and point an Apps Script trigger to the secure webhook. See <code>README.md</code> for the full script and setup steps.</p><p className="mt-2 text-xs">Set <code>GOOGLE_FORMS_WEBHOOK_SECRET</code> on the server and store the same value in Script Properties. The webhook endpoint accepts authenticated POST requests only.</p></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Google Form URL"><input type="url" value={formUrl ?? integration?.form_url ?? ""} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://docs.google.com/forms/..." className="input" /></Field><Field label="Linked Google Sheet URL"><input type="url" value={sheetUrl ?? integration?.sheet_url ?? ""} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/..." className="input" /></Field><Field label="Referral Code entry ID"><input required={Boolean(formUrl ?? integration?.form_url)} pattern="[0-9]+" value={referralEntryId ?? integration?.referral_entry_id ?? ""} onChange={(e) => setReferralEntryId(e.target.value)} placeholder="123456789" className="input" /></Field><Field label="Campaign entry ID (optional)"><input pattern="[0-9]+" value={campaignEntryId ?? integration?.campaign_entry_id ?? ""} onChange={(e) => setCampaignEntryId(e.target.value)} placeholder="987654321" className="input" /></Field></div><p className="text-[11px] text-slate-500">Find each entry ID in the Google Form prefilled URL: it is the numeric part after <code>entry.</code>. Once saved, every campaign link gets a creator-specific Google Form URL in Referral Links.</p><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-xs text-slate-500">Webhook: <code>POST /api/integrations/google-form</code></p><button className="btn-primary">Save Google integration</button></div></form></Panel>
      <Panel title="Admin account"><form onSubmit={saveAccount} className="space-y-4"><p className="text-xs text-slate-500">Signed in as <span className="font-medium text-slate-700">{accountEmail}</span>. Email changes require confirmation from Supabase Auth.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="New email (optional)"><input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="input" /></Field><Field label="New password (optional)"><input type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" /></Field></div><button className="btn-primary">Update account</button></form></Panel>
    </div>
  </>;
}
