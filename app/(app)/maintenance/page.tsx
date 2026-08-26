"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import type { Maintenance, Unit } from "@/types";

export default function MaintenancePage() {
  const supabase = createClient();
  const [records, setRecords] = useState<Maintenance[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ unit_id: "", repair_type: "", description: "", cost: "", repair_date: "" });
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  async function loadData() {
    const { data: m } = await supabase
      .from("maintenance")
      .select("*, units(*)")
      .order("repair_date", { ascending: false });
    setRecords((m as any) ?? []);
    const { data: u } = await supabase.from("units").select("*").order("unit_name");
    setUnits(u ?? []);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("maintenance").insert({
      unit_id: form.unit_id,
      repair_type: form.repair_type,
      description: form.description,
      cost: parseFloat(form.cost) || 0,
      repair_date: form.repair_date || new Date().toISOString().slice(0, 10),
      before_photo_url: beforePhoto,
      after_photo_url: afterPhoto,
      materials_receipt_url: receiptPath,
    });
    setForm({ unit_id: "", repair_type: "", description: "", cost: "", repair_date: "" });
    setBeforePhoto(null);
    setAfterPhoto(null);
    setReceiptPath(null);
    setShowForm(false);
    setSaving(false);
    loadData();
  }

  const totalCost = records.reduce((sum, r) => sum + Number(r.cost), 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Maintenance</h1>
          <p className="text-sm text-inkmuted mt-1">
            Repairs across all units · ₱{totalCost.toLocaleString()} spent to date
          </p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ Log Repair"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <label className="label-field">Repair type</label>
              <input
                required
                className="input-field"
                placeholder="e.g. Plumbing, Electrical"
                value={form.repair_type}
                onChange={(e) => setForm({ ...form, repair_type: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Date</label>
              <input
                type="date"
                className="input-field"
                value={form.repair_date}
                onChange={(e) => setForm({ ...form, repair_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="label-field">Description of repair</label>
            <textarea
              className="input-field"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <label className="label-field">Cost of materials (₱)</label>
            <input
              required
              type="number"
              step="0.01"
              className="input-field max-w-xs"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FileUploadField bucket="maintenance-files" label="Before photo" onUploaded={setBeforePhoto} accept="image/*" />
            <FileUploadField bucket="maintenance-files" label="After photo" onUploaded={setAfterPhoto} accept="image/*" />
            <FileUploadField bucket="maintenance-files" label="Materials receipt" onUploaded={setReceiptPath} />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save repair log"}
          </button>
        </form>
      )}

      <div className="card divide-y divide-border">
        {records.length === 0 ? (
          <p className="text-sm text-inkmuted p-5">No maintenance logged yet.</p>
        ) : (
          records.map((r) => <MaintRow key={r.id} r={r} />)
        )}
      </div>
    </div>
  );
}

function MaintRow({ r }: { r: Maintenance }) {
  async function viewFile(path: string | null) {
    if (!path) return;
    const url = await getSignedUrl("maintenance-files", path);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-ink text-sm">{r.units?.unit_name} — {r.repair_type}</p>
          <p className="text-xs text-inkmuted mt-0.5">{r.repair_date} · {r.description}</p>
        </div>
        <p className="font-mono text-sm text-ink">₱{Number(r.cost).toLocaleString()}</p>
      </div>
      <div className="flex gap-3 mt-2">
        {r.before_photo_url && (
          <button onClick={() => viewFile(r.before_photo_url)} className="text-xs text-seal underline">Before photo</button>
        )}
        {r.after_photo_url && (
          <button onClick={() => viewFile(r.after_photo_url)} className="text-xs text-seal underline">After photo</button>
        )}
        {r.materials_receipt_url && (
          <button onClick={() => viewFile(r.materials_receipt_url)} className="text-xs text-seal underline">Receipt</button>
        )}
      </div>
    </div>
  );
}
