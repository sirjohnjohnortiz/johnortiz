"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { Cheque, Unit, Tenant } from "@/types";

export default function ChequesPage() {
  const supabase = createClient();
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [units, setUnits] = useState<(Unit & { tenants: Tenant[] })[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"pending" | "archived">("pending");

  const [form, setForm] = useState({
    unit_id: "",
    cheque_date: "",
    amount: "",
    cheque_number: "",
    bank_name: "",
  });

  async function loadData() {
    const { data: c, error: loadErr } = await supabase
      .from("cheques")
      .select("*, units(*), tenants(*)")
      .order("cheque_date", { ascending: true });
    if (loadErr) {
      setError("Couldn't load cheques: " + loadErr.message);
    } else {
      setCheques((c as any) ?? []);
    }
    const { data: u } = await supabase.from("units").select("*, tenants(*)").order("unit_name");
    setUnits((u as any) ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !form.cheque_date || !filePath) return;
    setSaving(true);
    setError(null);
    const unit = units.find((u) => u.id === form.unit_id);
    const tenant = unit?.tenants?.find((t) => t.active);
    const { error: insertErr } = await supabase.from("cheques").insert({
      unit_id: form.unit_id,
      tenant_id: tenant?.id ?? null,
      cheque_date: form.cheque_date,
      amount: parseFloat(form.amount) || 0,
      cheque_number: form.cheque_number || null,
      bank_name: form.bank_name || null,
      file_url: filePath,
      status: "pending",
    });
    setSaving(false);
    if (insertErr) {
      setError("Couldn't save this cheque: " + insertErr.message);
      return;
    }
    setForm({ unit_id: "", cheque_date: "", amount: "", cheque_number: "", bank_name: "" });
    setFilePath(null);
    setShowForm(false);
    loadData();
  }

  async function archiveCheque(id: string) {
    await supabase.from("cheques").update({ status: "archived" }).eq("id", id);
    loadData();
  }

  async function unarchiveCheque(id: string) {
    await supabase.from("cheques").update({ status: "pending" }).eq("id", id);
    loadData();
  }

  async function deleteCheque(id: string) {
    if (!confirm("Delete this cheque record permanently? This cannot be undone.")) return;
    await supabase.from("cheques").delete().eq("id", id);
    loadData();
  }

  const filtered = cheques.filter((c) => c.status === tab);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Cheques</h1>
          <p className="text-sm text-inkmuted mt-1">
            Post-dated cheques from tenants — upload the year's batch, then archive or delete each month.
          </p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ Upload Cheque"}
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-bad/40">
          <p className="text-sm text-bad">{error}</p>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <label className="label-field">Cheque date (month it covers)</label>
              <input
                required
                type="date"
                className="input-field"
                value={form.cheque_date}
                onChange={(e) => setForm({ ...form, cheque_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Amount (₱)</label>
              <input
                required
                type="number"
                step="0.01"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Cheque number (optional)</label>
              <input
                className="input-field"
                value={form.cheque_number}
                onChange={(e) => setForm({ ...form, cheque_number: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Bank name (optional)</label>
              <input
                className="input-field"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
              />
            </div>
          </div>
          <FileUploadField bucket="cheques" label="Cheque photo/scan" onUploaded={setFilePath} accept="image/*,.pdf" />
          <button type="submit" disabled={saving || !filePath} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save cheque"}
          </button>
        </form>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("pending")}
          className={tab === "pending" ? "btn-primary text-xs" : "btn-secondary text-xs"}
        >
          Pending ({cheques.filter((c) => c.status === "pending").length})
        </button>
        <button
          onClick={() => setTab("archived")}
          className={tab === "archived" ? "btn-primary text-xs" : "btn-secondary text-xs"}
        >
          Archived ({cheques.filter((c) => c.status === "archived").length})
        </button>
      </div>

      <div className="card divide-y divide-border">
        {filtered.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">
            {tab === "pending" ? "No pending cheques." : "No archived cheques."}
          </p>
        ) : (
          filtered.map((c) => (
            <ChequeRow
              key={c.id}
              c={c}
              onArchive={() => archiveCheque(c.id)}
              onUnarchive={() => unarchiveCheque(c.id)}
              onDelete={() => deleteCheque(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ChequeRow({
  c,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  c: Cheque;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  async function handleView() {
    const url = await getSignedUrl("cheques", c.file_url);
    if (url) window.open(url, "_blank");
    else alert("Couldn't open this file — it may be missing from storage.");
  }

  return (
    <div className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink text-sm">
          {c.units?.unit_name} {c.tenants?.full_name ? `— ${c.tenants.full_name}` : ""}
        </p>
        <p className="text-xs text-inkmuted mt-0.5">
          {c.cheque_date} · ₱{Number(c.amount).toLocaleString()}
          {c.cheque_number ? ` · Cheque #${c.cheque_number}` : ""}
          {c.bank_name ? ` · ${c.bank_name}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={handleView} className="text-xs text-seal underline">View</button>
        {c.status === "pending" ? (
          <button onClick={onArchive} className="text-xs text-inkmuted underline">Archive</button>
        ) : (
          <button onClick={onUnarchive} className="text-xs text-inkmuted underline">Move back to pending</button>
        )}
        <button onClick={onDelete} className="text-xs text-bad underline">Delete</button>
      </div>
    </div>
  );
}
