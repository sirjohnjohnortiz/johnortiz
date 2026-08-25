"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import FileUploadField from "@/components/FileUploadField";
import { StatusBadge } from "@/components/StatusBadge";
import type { Unit, Tenant, Contract, Maintenance } from "@/types";

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = createClient();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [maintForm, setMaintForm] = useState({ repair_type: "", description: "", cost: "" });
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);

  async function loadAll() {
    const { data: u } = await supabase.from("units").select("*").eq("id", id).single();
    setUnit(u);
    if (u?.photo_url) setPhotoUrl(await getSignedUrl("unit-photos", u.photo_url));

    const { data: t } = await supabase.from("tenants").select("*").eq("unit_id", id).eq("active", true).maybeSingle();
    setTenant(t);

    const { data: c } = await supabase
      .from("contracts")
      .select("*")
      .eq("unit_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setContract(c);

    const { data: m } = await supabase
      .from("maintenance")
      .select("*")
      .eq("unit_id", id)
      .order("repair_date", { ascending: false });
    setMaintenance(m ?? []);
  }

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  async function handleAddMaintenance(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("maintenance").insert({
      unit_id: id,
      repair_type: maintForm.repair_type,
      description: maintForm.description,
      cost: parseFloat(maintForm.cost) || 0,
      before_photo_url: beforePhoto,
      after_photo_url: afterPhoto,
      materials_receipt_url: receiptPath,
    });
    setMaintForm({ repair_type: "", description: "", cost: "" });
    setBeforePhoto(null);
    setAfterPhoto(null);
    setReceiptPath(null);
    setShowMaintForm(false);
    setSaving(false);
    loadAll();
  }

  if (!unit) return <p className="text-sm text-inkmuted">Loading…</p>;

  const totalMaintCost = maintenance.reduce((sum, m) => sum + Number(m.cost), 0);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{unit.unit_name}</h1>
          <p className="text-sm text-inkmuted mt-1 uppercase tracking-wide">{unit.unit_type} · {unit.address}</p>
        </div>
        <StatusBadge status={unit.status} />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="card p-4 col-span-1">
          <p className="label-field">Unit photo</p>
          {photoUrl ? (
            <img src={photoUrl} alt={unit.unit_name} className="rounded-md w-full h-40 object-cover" />
          ) : (
            <div className="rounded-md w-full h-40 bg-paper flex items-center justify-center text-xs text-inkmuted">
              No photo uploaded
            </div>
          )}
        </div>

        <div className="card p-4 col-span-1">
          <p className="label-field">Current tenant</p>
          {tenant ? (
            <>
              <p className="font-medium text-ink">{tenant.full_name}</p>
              <p className="text-sm text-inkmuted">{tenant.contact_number}</p>
              <p className="text-sm text-inkmuted">{tenant.email}</p>
            </>
          ) : (
            <p className="text-sm text-inkmuted">No active tenant assigned. Add one from the Billing tab.</p>
          )}
        </div>

        <div className="card p-4 col-span-1">
          <p className="label-field">Contract</p>
          {contract ? (
            <>
              <div className="mb-1"><StatusBadge status={contract.status} /></div>
              <p className="text-sm text-inkmuted">Ends {contract.end_date}</p>
              <p className="text-sm text-inkmuted font-mono">₱{Number(contract.monthly_rent).toLocaleString()}/mo</p>
            </>
          ) : (
            <p className="text-sm text-inkmuted">No contract on file. Add one from the Contracts tab.</p>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">Maintenance history</h2>
            <p className="text-xs text-inkmuted mt-0.5">Total spent: ₱{totalMaintCost.toLocaleString()}</p>
          </div>
          <button onClick={() => setShowMaintForm((s) => !s)} className="btn-secondary text-sm">
            {showMaintForm ? "Cancel" : "+ Log repair"}
          </button>
        </div>

        {showMaintForm && (
          <form onSubmit={handleAddMaintenance} className="border border-border rounded-md p-4 mb-4 space-y-4 bg-paper/40">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-field">Repair type</label>
                <input
                  required
                  className="input-field"
                  placeholder="e.g. Plumbing, Repainting"
                  value={maintForm.repair_type}
                  onChange={(e) => setMaintForm({ ...maintForm, repair_type: e.target.value })}
                />
              </div>
              <div>
                <label className="label-field">Cost of materials (₱)</label>
                <input
                  required
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={maintForm.cost}
                  onChange={(e) => setMaintForm({ ...maintForm, cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="label-field">Description</label>
              <textarea
                className="input-field"
                rows={2}
                value={maintForm.description}
                onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FileUploadField bucket="maintenance-files" label="Before photo" onUploaded={setBeforePhoto} accept="image/*" />
              <FileUploadField bucket="maintenance-files" label="After photo" onUploaded={setAfterPhoto} accept="image/*" />
              <FileUploadField bucket="maintenance-files" label="Materials receipt" onUploaded={setReceiptPath} />
            </div>
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? "Saving…" : "Save repair log"}
            </button>
          </form>
        )}

        {maintenance.length === 0 ? (
          <p className="text-sm text-inkmuted">No maintenance logged for this unit yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {maintenance.map((m) => (
              <MaintenanceRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MaintenanceRow({ m }: { m: Maintenance }) {
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-ink text-sm">{m.repair_type}</p>
          <p className="text-xs text-inkmuted">{m.repair_date} · {m.description}</p>
        </div>
        <p className="font-mono text-sm text-ink">₱{Number(m.cost).toLocaleString()}</p>
      </div>
      <div className="flex gap-3 mt-2">
        {m.before_photo_url && (
          <FileLink bucket="maintenance-files" path={m.before_photo_url} label="Before photo" />
        )}
        {m.after_photo_url && (
          <FileLink bucket="maintenance-files" path={m.after_photo_url} label="After photo" />
        )}
        {m.materials_receipt_url && (
          <FileLink bucket="maintenance-files" path={m.materials_receipt_url} label="Receipt" />
        )}
      </div>
    </li>
  );
}

function FileLink({ bucket, path, label }: { bucket: string; path: string; label: string }) {
  async function handleClick() {
    const url = await getSignedUrl(bucket, path);
    if (url) window.open(url, "_blank");
  }
  return (
    <button onClick={handleClick} className="text-xs text-seal underline">
      {label}
    </button>
  );
}
