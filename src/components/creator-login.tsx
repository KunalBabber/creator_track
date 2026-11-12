"use client";

import { Activity, LoaderCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";

export default function CreatorLogin() {
  return <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500"><LoaderCircle className="animate-spin" /></div>}><CreatorLoginForm /></Suspense>;
}

function CreatorLoginForm() {
  const supabase = getSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") === "/creator/dashboard" ? "/creator/dashboard" : "/creator/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (/type=(invite|recovery)/i.test(window.location.hash)) { setSetupMode(true); return; }
      void supabase.auth.getSession().then(({ data }) => { if (active && data.session) router.replace(nextPath); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [supabase, router, nextPath]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError("");
    if (setupMode) {
      if (password.length < 8) { setError("Use a password with at least 8 characters."); setBusy(false); return; }
      if (password !== confirmPassword) { setError("The passwords do not match."); setBusy(false); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); setBusy(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) { setError("Password was updated but the secure session is missing. Sign in with your new password."); setBusy(false); return; }
      const validation = await fetch("/api/creator/dashboard", { headers: { Authorization: "Bearer " + session.access_token }, cache: "no-store" });
      if (!validation.ok) {
        const result = await validation.json().catch(() => ({}));
        setError(result.error ?? "This login is not linked to an active creator account.");
        setBusy(false);
        return;
      }
      router.replace(nextPath);
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setBusy(false);
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError("Sign in succeeded but no session was created. Try again.");
      setBusy(false);
      return;
    }
    const response = await fetch("/api/creator/dashboard", { headers: { Authorization: "Bearer " + session.access_token }, cache: "no-store" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      await supabase.auth.signOut();
      setError(result.error ?? "This login is not linked to an active creator account.");
      setBusy(false);
      return;
    }
    router.replace(nextPath);
  };

  return <main className="grid min-h-screen place-items-center bg-[#f7f8fb] p-5"><form onSubmit={signIn} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
    <div className="mb-6 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 text-white"><Activity /></span><div><h1 className="font-bold">CreatorTrack</h1><p className="text-xs text-slate-500">Creator portal</p></div></div>
    <h2 className="text-lg font-semibold">{setupMode ? "Set your creator password" : "Creator sign in"}</h2><p className="mt-1 text-sm text-slate-500">{setupMode ? "Choose a secure password to finish setting up your account." : "Use the login link sent by your business admin."}</p>
    {!setupMode && <label className="mt-5 block text-xs font-medium text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1.5" /></label>}
    <label className="mt-4 block text-xs font-medium text-slate-700">{setupMode ? "New password" : "Password"}<input required minLength={setupMode ? 8 : undefined} type="password" autoComplete={setupMode ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="input mt-1.5" /></label>
    {setupMode && <label className="mt-4 block text-xs font-medium text-slate-700">Confirm password<input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input mt-1.5" /></label>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    <button disabled={busy || !supabase} className="btn-primary mt-5 w-full">{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? setupMode ? "Saving…" : "Signing in…" : setupMode ? "Set password and continue" : "Sign in"}</button>
    <p className="mt-4 text-center text-xs text-slate-400">Need help? Contact your business admin for an invitation or password reset.</p>
  </form></main>;
}
