"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FileUploadField from "@/components/FileUploadField";
import { StatusBadge } from "@/components/StatusBadge";
import type { Unit } from "@/types";

export default function UnitsPage() {
  const supabase = createClient();
  const [units, setUnits] = useState<Unit[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    unit_name: "",
    unit_type: "residential",
    address: "",
    status: "vacant",
    notes: "",
  });
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadUnits() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("units")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setUnits(data ?? []);
    } catch (err: any) {
      console.error("Failed to load units:", err);
      setLoadError(err?.message ?? "Something went wrong loading units.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUnits();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("units").insert({ ...form, photo_url: photoPath });
    setForm({ unit_name: "", unit_type: "residential", address: "", status: "vacant", notes: "" });
    setPhotoPath(null);
    setShowForm(false);
    setSaving(false);
    loadUnits();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Units</h1>
          <p className="text-sm text-inkmuted mt-1">All commercial and residential units under management.</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary text-sm">
          {showForm ? "Cancel" : "+ Add Unit"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Unit name / number</label>
              <input
                required
                className="input-field"
                value={form.unit_name}
                onChange={(e) => setForm({ ...form, unit_name: e.target.value })}
                placeholder="e.g. Unit 4A, Stall 2"
              />
            </div>
            <div>
              <label className="label-field">Type</label>
              <select
                className="input-field"
                value={form.unit_type}
                onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Address</label>
              <input
                className="input-field"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <label className="label-field">Status</label>
              <select
                className="input-field"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
                <option value="under_maintenance">Under Maintenance</option>
              </select>
            </div>
          </div>
          <FileUploadField bucket="unit-photos" label="Photo of the unit" onUploaded={setPhotoPath} accept="image/*" />
          <div>
            <label className="label-field">Notes</label>
            <textarea
              className="input-field"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving…" : "Save unit"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-inkmuted">Loading…</p>
      ) : loadError ? (
        <div className="card p-5 border-bad/40">
          <p className="text-sm font-medium text-bad mb-1">Couldn't load units</p>
          <p className="text-xs text-inkmuted font-mono">{loadError}</p>
          <button onClick={loadUnits} className="btn-secondary text-xs mt-3">
            Try again
          </button>
        </div>
      ) : units.length === 0 ? (
        <p className="text-sm text-inkmuted">No units yet. Add your first unit to get started.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {units.map((u) => (
            <Link key={u.id} href={`/units/${u.id}`} className="card p-4 hover:border-seal/50 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-display font-semibold text-ink">{u.unit_name}</h3>
                <StatusBadge status={u.status} />
              </div>
              <p className="text-xs text-inkmuted uppercase tracking-wide mb-1">{u.unit_type}</p>
              {u.address && <p className="text-sm text-inkmuted">{u.address}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
