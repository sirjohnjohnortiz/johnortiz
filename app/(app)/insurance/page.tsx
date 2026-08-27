"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { InsurancePolicy, Unit } from "@/types";

export default function InsurancePage() {
  const supabase = createClient();
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    unit_id: "",
    insurer: "",
    policy_number: "",
    amount: "",
    issued_date: "",
    expiry_date: "",
  });

  async function loadData() {
    const { data: p, error: loadErr } = await supabase
      .from("insurance_policies")
      .select("*, units(*)")
      .order("expiry_date", { ascending: true });
    if (loadErr) {
      setError("Couldn't load insurance policies: " + loadErr.message);
    } else {
      setPolicies((p as any) ?? []);
    }
    const { data: u } = await supabase.from("units").select("*").order("unit_name");
    setUnits(u ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.unit_id || !filePath) return;
    setSaving(true);
    setError(null);
    const { error: insertErr } = await supabase.from("insurance_policies").insert({
      unit_id: form.unit_id,
      insurer: form.insurer || null,
      policy_number: form.policy_number || null,
      amount: form.amount ? parseFloat(form.amount) : null,
      issued_date: form.issued_date || null,
      expiry_date: form.expiry_date || null,
      file_url: filePath,
    });
    setSaving(false);
    if (insertErr) {
      setError("Couldn't save this policy: " + insertErr.message);
      return;
    }
    setForm({ unit_id: "", insurer: "", policy_number: "", amount: "", issued_date: "", expiry_date: "" });
    setFilePath(null);
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this insurance policy record?")) return;
    await supabase.from("insurance_policies").delete().eq("id", id);
    loadData();
  }

  const today = new Date().toISOString().slice(0, 10);
  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);
  const in60DaysStr = in60Days.toISOString().slice(0, 10);

  function expiryStatus(expiry: string | null) {
    if (!expiry) return null;
    if (expiry < today) return { label: "Expired", cls: "stamp-bad" };
    if (expiry <= in60DaysStr) return { label: "Expiring Soon", cls: "stamp-warn" };
    return { label: "Valid", cls: "stamp-good" };
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Insurance</h1>
          <p className="text-sm text-inkmuted mt-1">Insurance policies per property, with expiry tracking.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ Add Policy"}
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
              <label className="label-field">Property / unit</label>
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
              <label className="label-field">Insurer / company</label>
              <input
                className="input-field"
                placeholder="e.g. Malayan Insurance"
                value={form.insurer}
                onChange={(e) => setForm({ ...form, insurer: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Policy number (optional)</label>
              <input
                className="input-field"
                value={form.policy_number}
                onChange={(e) => setForm({ ...form, policy_number: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Amount / premium (₱)</label>
              <input
                type="number"
                step="0.01"
                className="input-field"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Issued date</label>
              <input
                type="date"
                className="input-field"
                value={form.issued_date}
                onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Expiry date</label>
              <input
                type="date"
                className="input-field"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
          </div>
          <FileUploadField bucket="insurance" label="Policy document" onUploaded={setFilePath} />
          <button type="submit" disabled={saving || !filePath} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save policy"}
          </button>
        </form>
      )}

      <div className="card divide-y divide-border">
        {policies.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No insurance policies added yet.</p>
        ) : (
          policies.map((p) => {
            const status = expiryStatus(p.expiry_date);
            return (
              <div key={p.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-ink text-sm">
                    {p.units?.unit_name} {p.insurer ? `— ${p.insurer}` : ""}
                  </p>
                  <p className="text-xs text-inkmuted mt-0.5">
                    {p.policy_number ? `Policy #${p.policy_number} · ` : ""}
                    {p.amount ? `₱${Number(p.amount).toLocaleString()} · ` : ""}
                    {p.issued_date ? `Issued ${p.issued_date}` : ""}
                    {p.expiry_date ? ` · Expires ${p.expiry_date}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {status && <span className={status.cls}>{status.label}</span>}
                  <PolicyViewButton path={p.file_url} />
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-bad underline">Delete</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PolicyViewButton({ path }: { path: string }) {
  async function handleClick() {
    const newTab = window.open("", "_blank");
    const url = await getSignedUrl("insurance", path);
    if (url && newTab) {
      newTab.location.href = url;
    } else if (!newTab) {
      alert("Your browser blocked the popup. Please allow popups for this site and try again.");
    } else {
      alert("Couldn't open this file. It may have been removed from storage.");
      newTab.close();
    }
  }
  return (
    <button onClick={handleClick} className="text-xs text-seal underline">
      View policy
    </button>
  );
}
