"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types";

export default function DashboardPage() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [stats, setStats] = useState({ units: 0, occupied: 0, pendingBilling: 0, activeContracts: 0 });
  const [revenue, setRevenue] = useState({ monthlyRentRoll: 0, collectedThisMonth: 0, collectedAllTime: 0 });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  async function loadData() {
    setLoading(true);
    const [{ data: notes }, { data: units }, { data: billing }, { data: contracts }, { data: paidBilling }] = await Promise.all([
      supabase.from("notifications").select("*").eq("resolved", false).order("due_on", { ascending: true }),
      supabase.from("units").select("id,status"),
      supabase.from("billing").select("id,status").in("status", ["pending", "overdue"]),
      supabase.from("contracts").select("id,status,monthly_rent").eq("status", "active"),
      supabase.from("billing").select("amount_due,billing_period").eq("status", "paid"),
    ]);
    setNotifications(notes ?? []);
    setStats({
      units: units?.length ?? 0,
      occupied: units?.filter((u) => u.status === "occupied").length ?? 0,
      pendingBilling: billing?.length ?? 0,
      activeContracts: contracts?.length ?? 0,
    });

    const monthlyRentRoll = (contracts ?? []).reduce((sum, c) => sum + (Number(c.monthly_rent) || 0), 0);
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let collectedThisMonth = 0;
    let collectedAllTime = 0;
    (paidBilling ?? []).forEach((b: any) => {
      const amt = Number(b.amount_due) || 0;
      collectedAllTime += amt;
      if (b.billing_period && String(b.billing_period).startsWith(currentMonthKey)) {
        collectedThisMonth += amt;
      }
    });
    setRevenue({ monthlyRentRoll, collectedThisMonth, collectedAllTime });

    setLoading(false);
  }

  async function runChecks() {
    setChecking(true);
    await supabase.rpc("run_all_alert_checks");
    await loadData();
    setChecking(false);
  }

  async function resolveNotification(id: string) {
    await supabase.from("notifications").update({ resolved: true }).eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  useEffect(() => {
    loadData();
  }, []);

  const kindMeta: Record<string, { label: string; cls: string; href: string }> = {
    payment_pending: { label: "Payment", cls: "stamp-bad", href: "/billing" },
    renewal: { label: "Renewal", cls: "stamp-warn", href: "/contracts" },
    permit_expiring: { label: "Permit", cls: "stamp-warn", href: "/permits" },
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-inkmuted mt-1">Overview of your properties, tenants, and alerts.</p>
        </div>
        <button onClick={runChecks} disabled={checking} className="btn-secondary text-sm">
          {checking ? "Checking…" : "Refresh alerts"}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Units" value={stats.units} />
        <StatCard label="Occupied" value={stats.occupied} />
        <StatCard label="Active Contracts" value={stats.activeContracts} />
        <StatCard label="Unpaid Bills" value={stats.pendingBilling} accent={stats.pendingBilling > 0} />
      </div>

      <div className="mb-8">
        <h2 className="font-display text-lg font-semibold text-ink mb-3">Revenue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RevenueCard label="Monthly Rent Roll" value={revenue.monthlyRentRoll} sub="From active contracts" />
          <RevenueCard label="Collected This Month" value={revenue.collectedThisMonth} sub="Paid bills, current month" good />
          <RevenueCard label="Collected All Time" value={revenue.collectedAllTime} sub="All paid bills to date" />
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-display text-lg font-semibold text-ink mb-4">Alerts</h2>
        {loading ? (
          <p className="text-sm text-inkmuted">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-inkmuted">No open alerts. Click "Refresh alerts" to check for new renewals, unpaid bills, and expiring permits.</p>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((n) => {
              const meta = kindMeta[n.kind];
              return (
                <li key={n.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={meta.cls}>{meta.label}</span>
                    <span className="text-sm text-ink truncate">{n.message}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {n.due_on && <span className="text-xs font-mono text-inkmuted">{n.due_on}</span>}
                    <Link href={meta.href} className="text-xs text-seal underline">
                      View
                    </Link>
                    <button onClick={() => resolveNotification(n.id)} className="text-xs text-inkmuted underline">
                      Dismiss
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">{label}</p>
      <p className={`font-display text-3xl font-semibold mt-1 ${accent ? "text-bad" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function RevenueCard({ label, value, sub, good }: { label: string; value: number; sub: string; good?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-inkmuted">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1 ${good ? "text-good" : "text-ink"}`}>
        ₱{value.toLocaleString()}
      </p>
      <p className="text-xs text-inkmuted mt-1">{sub}</p>
    </div>
  );
}
