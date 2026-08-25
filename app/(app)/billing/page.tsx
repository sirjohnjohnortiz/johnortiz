"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import { StatusBadge } from "@/components/StatusBadge";
import type { Billing, Unit, Tenant } from "@/types";

export default function BillingPage() {
  const supabase = createClient();
  const [bills, setBills] = useState<Billing[]>([]);
  const [units, setUnits] = useState<(Unit & { tenants: Tenant[] })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [form, setForm] = useState({ unit_id: "", billing_period: "", amount_due: "", due_date: "" });

  async function loadData() {
    const { data: b } = await supabase
      .from("billing")
      .select("*, units(*), tenants(*)")
      .order("billing_period", { ascending: false });
    setBills((b as any) ?? []);

    const { data: u } = await supabase.from("units").select("*, tenants(*)").eq("status", "occupied");
    setUnits((u as any) ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const unit = units.find((u) => u.id === form.unit_id);
    const tenant = unit?.tenants?.find((t) => t.active);
    await supabase.from("billing").insert({
      unit_id: form.unit_id,
      tenant_id: tenant?.id ?? null,
      billing_period: form.billing_period + "-01",
      amount_due: parseFloat(form.amount_due) || 0,
      due_date: form.due_date,
      status: "pending",
    });
    setForm({ unit_id: "", billing_period: "", amount_due: "", due_date: "" });
    setShowForm(false);
    setSaving(false);
    loadData();
  }

  async function runFollowUps() {
    setGenerating(true);
    await supabase.rpc("generate_follow_up_billing");
    setGenerating(false);
    loadData();
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Billing</h1>
          <p className="text-sm text-inkmuted mt-1">Monthly rent per tenant, with proof of payment.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runFollowUps} disabled={generating} className="btn-secondary text-sm">
            {generating ? "Generating…" : "Generate follow-up billing"}
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
            {showForm ? "Cancel" : "+ New Bill"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Unit / tenant</label>
              <select
                required
                className="input-field"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Select a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_name} {u.tenants?.[0]?.full_name ? `— ${u.tenants[0].full_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Billing month</label>
              <input
                required
                type="month"
                className="input-field"
                value={form.billing_period}
                onChange={(e) => setForm({ ...form, billing_period: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Amount due (₱)</label>
              <input
                required
                type="number"
                step="0.01"
                className="input-field"
                value={form.amount_due}
                onChange={(e) => setForm({ ...form, amount_due: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Due date</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save bill"}
          </button>
        </form>
      )}

      <div className="card divide-y divide-border">
        {bills.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No billing records yet.</p>
        ) : (
          bills.map((b) => <BillingRow key={b.id} b={b} onChanged={loadData} />)
        )}
      </div>
    </div>
  );
}

function BillingRow({ b, onChanged }: { b: Billing; onChanged: () => void }) {
  const supabase = createClient();
  const [expanded, setExpanded] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(b.receipt_url);
  const [depositPath, setDepositPath] = useState<string | null>(b.deposit_slip_url);
  const [saving, setSaving] = useState(false);

  async function markPaid() {
    setSaving(true);
    await supabase
      .from("billing")
      .update({
        status: "paid",
        paid_date: new Date().toISOString().slice(0, 10),
        receipt_url: receiptPath,
        deposit_slip_url: depositPath,
      })
      .eq("id", b.id);
    setSaving(false);
    onChanged();
  }

  async function viewFile(bucket: string, path: string | null) {
    if (!path) return;
    const url = await getSignedUrl(bucket, path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink text-sm">
            {b.units?.unit_name} — {b.tenants?.full_name ?? "No tenant"}
          </p>
          <p className="text-xs text-inkmuted mt-0.5">
            {new Date(b.billing_period).toLocaleDateString("en-US", { month: "long", year: "numeric" })} · Due{" "}
            {b.due_date} · ₱{Number(b.amount_due).toLocaleString()}
            {b.follow_up_count > 0 && ` · ${b.follow_up_count} follow-up(s) sent`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={b.status} />
          <button onClick={() => setExpanded((e) => !e)} className="text-xs text-seal underline">
            {expanded ? "Close" : b.status === "paid" ? "View proof" : "Record payment"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          {b.status === "paid" ? (
            <div className="flex gap-4">
              {b.receipt_url && (
                <button onClick={() => viewFile("billing-proofs", b.receipt_url)} className="text-xs text-seal underline">
                  View receipt
                </button>
              )}
              {b.deposit_slip_url && (
                <button onClick={() => viewFile("billing-proofs", b.deposit_slip_url)} className="text-xs text-seal underline">
                  View deposit slip
                </button>
              )}
              <p className="text-xs text-inkmuted">Paid on {b.paid_date}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FileUploadField bucket="billing-proofs" label="Payment receipt" onUploaded={setReceiptPath} />
                <FileUploadField bucket="billing-proofs" label="Deposit slip" onUploaded={setDepositPath} />
              </div>
              <button onClick={markPaid} disabled={saving} className="btn-primary text-sm">
                {saving ? "Saving…" : "Mark as paid"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
