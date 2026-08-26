"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/units", label: "Units", icon: "▤" },
  { href: "/billing", label: "Billing", icon: "₱" },
  { href: "/contracts", label: "Contracts", icon: "✎" },
  { href: "/maintenance", label: "Maintenance", icon: "⚒" },
  { href: "/permits", label: "Permits", icon: "◍" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const currentLabel = NAV.find((item) => pathname.startsWith(item.href))?.label ?? "";

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border"
        >
          <span className="text-lg leading-none">☰</span>
        </button>
        <span className="font-display text-sm font-semibold text-ink">{currentLabel}</span>
        <div className="h-9 w-9 rounded-full border-2 border-seal flex items-center justify-center shrink-0">
          <span className="font-display text-xs text-seal">JO</span>
        </div>
      </div>

      {/* Backdrop (mobile only, shown when drawer is open) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-border bg-card flex flex-col
        transform transition-transform duration-200 ease-in-out
        md:static md:z-auto md:w-60 md:translate-x-0 md:min-h-screen
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="px-5 py-5 border-b border-border flex items-center justify-between">
          <div className="rounded-md border border-border bg-white px-3 py-2.5 flex-1">
            <img src="/logo.png" alt="Juan Ortiz Lessor" className="w-full h-auto" />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden ml-2 flex h-8 w-8 items-center justify-center rounded-md border border-border shrink-0"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  active ? "bg-ink text-paper" : "text-ink hover:bg-paper"
                }`}
              >
                <span className="w-4 text-center opacity-80">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <button onClick={handleLogout} className="btn-secondary w-full text-sm">
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
