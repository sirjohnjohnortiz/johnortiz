"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import { StatusBadge } from "@/components/StatusBadge";
import type { Contract, Unit } from "@/types";
import { PAYMENT_MODE_LABELS } from "@/types";

const EMPTY_FORM = {
  unit_id: "",
  tenant_name: "",
  tenant_contact: "",
  tenant_email: "",
  start_date: "",
  end_date: "",
  monthly_rent: "",
  renewal_reminder_days: "30",
  payment_mode: "bank_transfer",
  payment_notes: "",
};

export default function ContractsPage() {
  const supabase = createClient();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractFile, setContractFile] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExistingFile, setEditingExistingFile] = useState<string | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });

  async function loadData() {
    const { data: c } = await supabase
      .from("contracts")
      .select("*, units(*), tenants(*)")
      .order("end_date", { ascending: true });
    setContracts((c as any) ?? []);
    const { data: u } = await supabase.from("units").select("*").order("unit_name");
    setUnits(u ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  function resetForm() {
    setForm({ ...EMPTY_FORM });
    setContractFile(null);
    setEditingId(null);
    setEditingExistingFile(null);
  }

  function startEdit(c: Contract) {
    setEditingId(c.id);
    setForm({
      unit_id: c.unit_id,
      tenant_name: c.tenants?.full_name ?? "",
      tenant_contact: c.tenants?.contact_number ?? "",
      tenant_email: c.tenants?.email ?? "",
      start_date: c.start_date,
      end_date: c.end_date,
      monthly_rent: String(c.monthly_rent ?? ""),
      renewal_reminder_days: String(c.renewal_reminder_days ?? 30),
      payment_mode: c.payment_mode || "bank_transfer",
      payment_notes: c.payment_notes || "",
    });
    setContractFile(null);
    setEditingExistingFile(c.contract_file_url);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      // Update the contract itself
      await supabase
        .from("contracts")
        .update({
          unit_id: form.unit_id,
          start_date: form.start_date,
          end_date: form.end_date,
          monthly_rent: parseFloat(form.monthly_rent) || 0,
          renewal_reminder_days: parseInt(form.renewal_reminder_days) || 30,
          payment_mode: form.payment_mode,
          payment_notes: form.payment_notes || null,
          ...(contractFile ? { contract_file_url: contractFile } : {}),
        })
        .eq("id", editingId);

      // Keep the linked tenant's info in sync too
      const editedContract = contracts.find((c) => c.id === editingId);
      if (editedContract?.tenant_id) {
        await supabase
          .from("tenants")
          .update({
            full_name: form.tenant_name,
            contact_number: form.tenant_contact,
            email: form.tenant_email,
          })
          .eq("id", editedContract.tenant_id);
      }
    } else {
      const { data: tenant } = await supabase
        .from("tenants")
        .insert({
          unit_id: form.unit_id,
          full_name: form.tenant_name,
          contact_number: form.tenant_contact,
          email: form.tenant_email,
        })
        .select()
        .single();

      await supabase.from("contracts").insert({
        unit_id: form.unit_id,
        tenant_id: tenant?.id,
        start_date: form.start_date,
        end_date: form.end_date,
        monthly_rent: parseFloat(form.monthly_rent) || 0,
        renewal_reminder_days: parseInt(form.renewal_reminder_days) || 30,
        contract_file_url: contractFile,
        payment_mode: form.payment_mode,
        payment_notes: form.payment_notes || null,
        status: "active",
      });

      await supabase.from("units").update({ status: "occupied" }).eq("id", form.unit_id);
    }

    resetForm();
    setShowForm(false);
    setSaving(false);
    loadData();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Contracts</h1>
          <p className="text-sm text-inkmuted mt-1">Lease terms and renewal tracking, per unit.</p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            setShowForm((s) => !s);
          }}
          className="btn-primary text-sm"
        >
          {showForm ? "Cancel" : "+ New Contract"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          {editingId && (
            <p className="text-xs font-semibold uppercase tracking-wide text-seal">Editing existing contract</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Unit</label>
              <select
                required
                className="input-field"
                value={form.unit_id}
                onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
              >
                <option value="">Select a unit…</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.unit_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Monthly rent (₱)</label>
              <input
                required
                type="number"
                step="0.01"
                className="input-field"
                value={form.monthly_rent}
                onChange={(e) => setForm({ ...form, monthly_rent: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Tenant name</label>
              <input
                required
                className="input-field"
                value={form.tenant_name}
                onChange={(e) => setForm({ ...form, tenant_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Contact number</label>
              <input
                className="input-field"
                value={form.tenant_contact}
                onChange={(e) => setForm({ ...form, tenant_contact: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Email</label>
              <input
                type="email"
                className="input-field"
                value={form.tenant_email}
                onChange={(e) => setForm({ ...form, tenant_email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Start date</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">End date</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Remind me before (days)</label>
              <input
                type="number"
                className="input-field"
                value={form.renewal_reminder_days}
                onChange={(e) => setForm({ ...form, renewal_reminder_days: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Payment mode</label>
              <select
                className="input-field"
                value={form.payment_mode}
                onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}
              >
                {Object.entries(PAYMENT_MODE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-field">Payment details (optional)</label>
              <input
                className="input-field"
                placeholder="e.g. Security Bank acct, or staff pickup schedule"
                value={form.payment_notes}
                onChange={(e) => setForm({ ...form, payment_notes: e.target.value })}
              />
            </div>
          </div>

          <FileUploadField
            bucket="contracts"
            label="Contract file"
            existingPath={editingExistingFile}
            onUploaded={setContractFile}
          />

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : editingId ? "Update contract" : "Save contract"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
                className="btn-secondary text-sm"
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      )}

      <div className="card divide-y divide-border">
        {contracts.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No contracts yet.</p>
        ) : (
          contracts.map((c) => <ContractRow key={c.id} c={c} onChanged={loadData} onEdit={() => startEdit(c)} />)
        )}
      </div>
    </div>
  );
}

function ContractRow({ c, onChanged, onEdit }: { c: Contract; onChanged: () => void; onEdit: () => void }) {
  const supabase = createClient();

  async function handleView() {
    if (!c.contract_file_url) return;
    const url = await getSignedUrl("contracts", c.contract_file_url);
    if (url) window.open(url, "_blank");
  }

  async function markTerminated() {
    await supabase.from("contracts").update({ status: "terminated" }).eq("id", c.id);
    onChanged();
  }

  return (
    <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink text-sm">{c.units?.unit_name} — {c.tenants?.full_name}</p>
        <p className="text-xs text-inkmuted mt-0.5">
          {c.start_date} to {c.end_date} · ₱{Number(c.monthly_rent).toLocaleString()}/mo
        </p>
        {c.payment_mode && (
          <p className="text-xs text-inkmuted mt-0.5">
            {PAYMENT_MODE_LABELS[c.payment_mode] || c.payment_mode}
            {c.payment_notes ? ` — ${c.payment_notes}` : ""}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={c.status} />
        <button onClick={onEdit} className="text-xs text-seal underline">Edit</button>
        {c.contract_file_url && (
          <button onClick={handleView} className="text-xs text-seal underline">View file</button>
        )}
        {c.status !== "terminated" && (
          <button onClick={markTerminated} className="text-xs text-inkmuted underline">Terminate</button>
        )}
      </div>
    </div>
  );
}
