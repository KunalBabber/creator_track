"use client";

import { Activity, CheckCircle2, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

interface ProductOption { id: string; name: string }

export default function LeadForm({ referralCode, campaign }: { referralCode: string; campaign: string }) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [validating, setValidating] = useState(Boolean(referralCode));
  const [creatorName, setCreatorName] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!referralCode) return;
    Promise.all([
      fetch("/api/referral-click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: referralCode, campaign }) }),
      fetch("/api/public/products"),
    ]).then(async ([trackingResponse, productsResponse]) => {
      const tracking = await trackingResponse.json();
      if (!trackingResponse.ok) throw new Error(tracking.error ?? "This referral link is invalid.");
      setCreatorName(tracking.creatorName);
      if (productsResponse.ok) { const result = await productsResponse.json(); setProducts(result.products ?? []); }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not validate this link."))
      .finally(() => setValidating(false));
  }, [referralCode, campaign]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/leads", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: formData.get("customerName"), email: formData.get("email"), phone: formData.get("phone"),
          productId: formData.get("productId"), message: formData.get("message"), ref: referralCode, campaign,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) setError(result.error ?? "Could not submit the form.");
      else setSubmitted(true);
    } catch {
      setError("Connection failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="grid min-h-screen place-items-center bg-[#f7f8fb] px-4 py-10"><div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="bg-[#101c33] px-7 py-6 text-white"><div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-blue-600"><Activity size={20} /></div><h1 className="text-xl font-bold">Tell us a little about yourself</h1><p className="mt-1 text-sm text-slate-300">{creatorName ? `Referred by ${creatorName}` : "We’ll be in touch soon."}</p></div>
    <div className="p-6 sm:p-7">
      {validating ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin" />Checking referral link…</div>
        : (error || !referralCode) && !submitted ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error || "This referral link is missing its creator code."}</div>
          : submitted ? <div className="py-10 text-center"><CheckCircle2 size={42} className="mx-auto text-emerald-500" /><h2 className="mt-4 text-lg font-semibold">Thanks for reaching out!</h2><p className="mt-2 text-sm text-slate-500">Your information has been submitted successfully.</p></div>
            : <form onSubmit={submit} className="space-y-4">
              <FormField label="Your name"><input name="customerName" required minLength={2} maxLength={120} className="lead-input" autoComplete="name" /></FormField>
              <div className="grid gap-4 sm:grid-cols-2"><FormField label="Email"><input name="email" required type="email" maxLength={254} className="lead-input" autoComplete="email" /></FormField><FormField label="Phone number"><input name="phone" required minLength={7} maxLength={32} type="tel" className="lead-input" autoComplete="tel" /></FormField></div>
              <FormField label="Product interested in"><select name="productId" className="lead-input"><option value="">Select a product (optional)</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></FormField>
              <FormField label="Message (optional)"><textarea name="message" rows={4} maxLength={2000} className="lead-input resize-y" placeholder="How can we help?" /></FormField>
              {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
              <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}{busy ? "Submitting…" : "Submit inquiry"}</button>
              <p className="text-center text-[11px] text-slate-400">Your referral attribution is captured automatically.</p>
            </form>}
    </div>
  </div></main>;
}
function FormField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-medium text-slate-700">{label}<div className="mt-1.5">{children}</div></label>; }
