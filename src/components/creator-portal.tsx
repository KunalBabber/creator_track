"use client";

import { Activity, Copy, ExternalLink, LoaderCircle, LogOut, Wallet } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Commission, Lead, Payment } from "@/lib/types";

interface CreatorRecord { id: string; name: string; referral_code: string; commission_model: string; commission_value: number }
interface LinkRecord { id: string; campaign_name: string; is_active: boolean; click_count: number }

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

export default function CreatorPortal() {
  const supabase = getSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState("");
  const [creator, setCreator] = useState<CreatorRecord | null>(null);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setUserId(data.session?.user.id ?? "");
      setBusy(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? ""));
    return () => { active = false; subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy(true); setError("");
        const { data: profile, error: profileError } = await supabase.from("profiles").select("creator_id,role").eq("id", userId).maybeSingle();
        if (profileError) { setError(profileError.message); setBusy(false); return; }
        if (profile?.role !== "creator") { setError("This portal is for linked creator accounts. Contact your business admin for access."); setBusy(false); return; }
        const query = supabase.from("creators").select("id,name,referral_code,commission_model,commission_value");
        const creatorResult = profile.creator_id
          ? await query.eq("id", profile.creator_id).maybeSingle()
          : await query.eq("auth_user_id", userId).maybeSingle();
        if (creatorResult.error) { setError(creatorResult.error.message); setBusy(false); return; }
        if (!creatorResult.data) { setError("Your account is not linked to a creator profile yet. Please contact the business admin."); setBusy(false); return; }
        const current = creatorResult.data as CreatorRecord;
        const [linkResult, leadResult, commissionResult, paymentResult] = await Promise.all([
          supabase.from("referral_links").select("id,campaign_name,is_active,click_count").eq("creator_id", current.id).order("created_at"),
          supabase.from("leads").select("*").eq("creator_id", current.id).order("created_at", { ascending: false }),
          supabase.from("commissions").select("*").eq("creator_id", current.id).order("created_at", { ascending: false }),
          supabase.from("payments").select("*").eq("creator_id", current.id).order("payment_date", { ascending: false }),
        ]);
        const failed = [linkResult, leadResult, commissionResult, paymentResult].find((result) => result.error);
        if (failed?.error) setError(failed.error.message);
        else {
          setCreator(current);
          setLinks((linkResult.data ?? []) as LinkRecord[]);
          setLeads((leadResult.data ?? []) as Lead[]);
          setCommissions((commissionResult.data ?? []) as Commission[]);
          setPayments((paymentResult.data ?? []) as Payment[]);
        }
        setBusy(false);
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [supabase, userId]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setBusy(false);
  };
  const copy = async (campaignName: string) => {
    if (!creator) return;
    const campaign = campaignName === "General" ? "" : `&campaign=${encodeURIComponent(campaignName)}`;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/lead-form?ref=${encodeURIComponent(creator.referral_code)}${campaign}`);
      setNotice("Referral link copied.");
    } catch {
      setError("Clipboard access was denied. Copy the referral URL from the Open link button.");
    }
  };

  if (!supabase) return <main className="grid min-h-screen place-items-center p-6"><p className="rounded-xl bg-white p-6 text-sm text-slate-600">Connect Supabase to enable CreatorTrack.</p></main>;
  if (!userId) return <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-5"><form onSubmit={signIn} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"><div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><Activity /></span><div><h1 className="font-bold">CreatorTrack</h1><p className="text-xs text-slate-500">Creator portal</p></div></div><h2 className="text-lg font-semibold">Creator sign in</h2><p className="mt-1 text-sm text-slate-500">Sign in with the account linked by your business admin.</p><label className="mt-5 block text-xs font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1.5" /></label><label className="mt-4 block text-xs font-medium">Password<input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1.5" /></label>{error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}<button disabled={busy} className="btn-primary mt-5 w-full">{busy ? "Signing in…" : "Sign in"}</button></form></main>;

  const totalClicks = links.reduce((sum, link) => sum + Number(link.click_count), 0);
  const pending = commissions.filter((item) => item.status !== "paid").reduce((sum, item) => sum + Number(item.amount), 0);
  const earned = commissions.reduce((sum, item) => sum + Number(item.amount), 0);
  return <main className="min-h-screen bg-[#f7f8fb]"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-8"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Activity size={18} /></span><div><h1 className="font-bold">CreatorTrack</h1><p className="text-[11px] text-slate-500">Creator portal</p></div></div><button onClick={async () => { await supabase.auth.signOut(); setCreator(null); }} className="btn-secondary"><LogOut size={14} /> Sign out</button></header>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8"><div className="mb-6"><h2 className="text-2xl font-bold">{creator ? `Welcome, ${creator.name}` : "Creator dashboard"}</h2><p className="mt-1 text-sm text-slate-500">Your referral performance and payment history.</p></div>
      {busy && <div className="mb-4 flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={16} className="animate-spin" />Loading your data…</div>}
      {error && <div role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}
      {creator && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><CreatorMetric title="Total clicks" value={totalClicks} /><CreatorMetric title="Total leads" value={leads.length} /><CreatorMetric title="Converted customers" value={leads.filter((lead) => lead.status === "Converted").length} /><CreatorMetric title="Earned commission" value={money(earned)} /><CreatorMetric title="Pending payment" value={money(pending)} /><CreatorMetric title="Paid to date" value={money(earned - pending)} /></div>
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Your referral links</h3><div className="mt-4 space-y-3">{links.map((link) => <div key={link.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-100 p-3 sm:flex-row sm:items-center"><div><p className="text-sm font-medium">{link.campaign_name} <span className="ml-1 font-mono text-xs text-blue-700">{creator.referral_code}</span></p><p className="mt-1 text-xs text-slate-500">{link.click_count} clicks · {link.is_active ? "Active" : "Inactive"}</p></div><div className="flex gap-2"><button onClick={() => void copy(link.campaign_name)} className="btn-secondary"><Copy size={14} /> Copy link</button><a className="btn-secondary" target="_blank" rel="noreferrer" href={`/lead-form?ref=${encodeURIComponent(creator.referral_code)}${link.campaign_name === "General" ? "" : `&campaign=${encodeURIComponent(link.campaign_name)}`}`}><ExternalLink size={14} /> Open</a></div></div>)}{links.length === 0 && <p className="py-5 text-center text-xs text-slate-400">No active links are assigned to your creator profile.</p>}</div></section>
        <div className="mt-5 grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-semibold">Your leads</h3>{leads.length ? <div className="mt-4 divide-y divide-slate-100">{leads.slice(0, 10).map((lead) => <div key={lead.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{lead.customer_name}</p><p className="mt-1 text-xs text-slate-400">{lead.product_id ? "Product interest captured" : "Referral lead"} · {new Date(lead.created_at).toLocaleDateString()}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold">{lead.status}</span></div>)}</div> : <CreatorEmpty text="No leads have been attributed yet." />}</section>
          <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="flex items-center gap-2 text-sm font-semibold"><Wallet size={16} /> Payment history</h3>{payments.length ? <div className="mt-4 divide-y divide-slate-100">{payments.map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{money(Number(payment.amount))}</p><p className="mt-1 text-xs text-slate-400">{payment.method} · {payment.transaction_reference ?? "No reference"}</p></div><span className="text-xs text-slate-500">{new Date(payment.payment_date).toLocaleDateString()}</span></div>)}</div> : <CreatorEmpty text="No payments have been recorded yet." />}</section></div>
      </>}
    </div>
  </main>;
}

function CreatorMetric({ title, value }: { title: string; value: string | number }) { return <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{title}</p><p className="mt-2 text-xl font-bold text-slate-900">{value}</p></div>; }
function CreatorEmpty({ text }: { text: string }) { return <p className="py-8 text-center text-xs text-slate-400">{text}</p>; }
