-- =========================================================================
-- Juan Ortiz Lessor — Property Management System
-- Run this entire file once in Supabase: Dashboard -> SQL Editor -> New query
-- =========================================================================

-- ---------- EXTENSIONS ----------
create extension if not exists "uuid-ossp";

-- ---------- ENUM TYPES ----------
create type unit_type as enum ('residential', 'commercial');
create type unit_status as enum ('occupied', 'vacant', 'under_maintenance');
create type contract_status as enum ('active', 'expiring_soon', 'expired', 'terminated');
create type billing_status as enum ('paid', 'pending', 'overdue');
create type permit_type as enum (
  'mayors_permit',
  'dti',
  'brgy_clearance',
  'fire_permit',
  'tax_declaration_property',
  'tax_declaration_building',
  'real_property_tax_property',
  'real_property_tax_building',
  'zonal_clearance',
  'occupancy_permit',
  'building_plan'
);

-- ---------- UNITS ----------
create table units (
  id uuid primary key default uuid_generate_v4(),
  unit_name text not null,
  unit_type unit_type not null default 'residential',
  address text,
  status unit_status not null default 'vacant',
  photo_url text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- TENANTS ----------
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid references units(id) on delete set null,
  full_name text not null,
  contact_number text,
  email text,
  move_in_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- CONTRACTS ----------
create table contracts (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete set null,
  start_date date not null,
  end_date date not null,
  monthly_rent numeric(12,2) not null default 0,
  status contract_status not null default 'active',
  contract_file_url text,
  renewal_reminder_days int not null default 30,
  created_at timestamptz not null default now()
);

-- ---------- BILLING ----------
create table billing (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete set null,
  billing_period date not null, -- first day of the month being billed
  amount_due numeric(12,2) not null,
  due_date date not null,
  status billing_status not null default 'pending',
  receipt_url text,
  deposit_slip_url text,
  paid_date date,
  follow_up_count int not null default 0,
  last_follow_up_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (unit_id, billing_period)
);

-- ---------- MAINTENANCE ----------
create table maintenance (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid not null references units(id) on delete cascade,
  repair_date date not null default current_date,
  repair_type text not null,
  description text,
  cost numeric(12,2) not null default 0,
  before_photo_url text,
  after_photo_url text,
  materials_receipt_url text,
  created_at timestamptz not null default now()
);

-- ---------- PERMITS & PROPERTY DOCUMENTS ----------
create table permits (
  id uuid primary key default uuid_generate_v4(),
  unit_id uuid references units(id) on delete cascade, -- null = business-wide (e.g. mayor's permit, DTI)
  permit_type permit_type not null,
  label text, -- optional custom label, e.g. "Unit 4 - Occupancy Permit"
  file_url text not null,
  issued_date date,
  expiry_date date,
  created_at timestamptz not null default now()
);

-- ---------- NOTIFICATIONS / ALERTS ----------
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  kind text not null check (kind in ('renewal', 'payment_pending', 'permit_expiring')),
  related_table text not null,
  related_id uuid not null,
  message text not null,
  due_on date,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- FUNCTIONS: keep statuses & alerts fresh automatically
-- =========================================================================

-- Recompute contract status based on end_date vs reminder window
create or replace function refresh_contract_statuses() returns void as $$
begin
  update contracts set status = 'expired'
    where end_date < current_date and status <> 'expired' and status <> 'terminated';
  update contracts set status = 'expiring_soon'
    where end_date >= current_date
      and end_date <= current_date + (renewal_reminder_days || ' days')::interval
      and status = 'active';
end;
$$ language plpgsql;

-- Recompute billing status: pending -> overdue once past due_date
create or replace function refresh_billing_statuses() returns void as $$
begin
  update billing set status = 'overdue'
    where status = 'pending' and due_date < current_date;
end;
$$ language plpgsql;

-- Generate follow-up billing notifications for anything overdue/pending
create or replace function generate_follow_up_billing() returns void as $$
begin
  perform refresh_billing_statuses();

  insert into notifications (kind, related_table, related_id, message, due_on)
  select
    'payment_pending',
    'billing',
    b.id,
    'Follow-up billing: ' || t.full_name || ' — ' || u.unit_name ||
      ' has an unpaid balance of ₱' || b.amount_due || ' for ' || to_char(b.billing_period, 'Mon YYYY'),
    b.due_date
  from billing b
  join units u on u.id = b.unit_id
  left join tenants t on t.id = b.tenant_id
  where b.status in ('pending', 'overdue')
    and not exists (
      select 1 from notifications n
      where n.related_table = 'billing' and n.related_id = b.id
        and n.kind = 'payment_pending' and n.resolved = false
    );

  update billing set follow_up_count = follow_up_count + 1, last_follow_up_at = now()
    where status in ('pending', 'overdue');
end;
$$ language plpgsql;

-- Generate renewal notifications for contracts entering the reminder window
create or replace function generate_renewal_alerts() returns void as $$
begin
  perform refresh_contract_statuses();

  insert into notifications (kind, related_table, related_id, message, due_on)
  select
    'renewal',
    'contracts',
    c.id,
    'Contract renewal due for ' || u.unit_name || ' (ends ' || to_char(c.end_date, 'Mon DD, YYYY') || ')',
    c.end_date
  from contracts c
  join units u on u.id = c.unit_id
  where c.status = 'expiring_soon'
    and not exists (
      select 1 from notifications n
      where n.related_table = 'contracts' and n.related_id = c.id
        and n.kind = 'renewal' and n.resolved = false
    );
end;
$$ language plpgsql;

-- Generate permit expiry notifications (60-day window)
create or replace function generate_permit_alerts() returns void as $$
begin
  insert into notifications (kind, related_table, related_id, message, due_on)
  select
    'permit_expiring',
    'permits',
    p.id,
    coalesce(p.label, replace(p.permit_type::text, '_', ' ')) || ' expires ' || to_char(p.expiry_date, 'Mon DD, YYYY'),
    p.expiry_date
  from permits p
  where p.expiry_date is not null
    and p.expiry_date <= current_date + interval '60 days'
    and not exists (
      select 1 from notifications n
      where n.related_table = 'permits' and n.related_id = p.id
        and n.kind = 'permit_expiring' and n.resolved = false
    );
end;
$$ language plpgsql;

-- Convenience: run all checks in one call (call this from the app on load, or on a schedule)
create or replace function run_all_alert_checks() returns void as $$
begin
  perform generate_follow_up_billing();
  perform generate_renewal_alerts();
  perform generate_permit_alerts();
end;
$$ language plpgsql;

-- =========================================================================
-- ROW LEVEL SECURITY — single admin (you) only, via Supabase Auth
-- =========================================================================
alter table units enable row level security;
alter table tenants enable row level security;
alter table contracts enable row level security;
alter table billing enable row level security;
alter table maintenance enable row level security;
alter table permits enable row level security;
alter table notifications enable row level security;

-- Any authenticated user (i.e. you, logged in) has full access.
-- This app is single-admin; if you later add staff logins, tighten these.
create policy "Authenticated full access" on units for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on tenants for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on contracts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on billing for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on maintenance for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on permits for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on notifications for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =========================================================================
-- STORAGE — private buckets for all uploads (photos, receipts, permits, contracts)
-- =========================================================================
insert into storage.buckets (id, name, public)
values
  ('unit-photos', 'unit-photos', false),
  ('contracts', 'contracts', false),
  ('billing-proofs', 'billing-proofs', false),
  ('maintenance-files', 'maintenance-files', false),
  ('permits', 'permits', false)
on conflict (id) do nothing;

create policy "Authenticated read" on storage.objects for select
  using (auth.role() = 'authenticated');
create policy "Authenticated write" on storage.objects for insert
  with check (auth.role() = 'authenticated');
create policy "Authenticated update" on storage.objects for update
  using (auth.role() = 'authenticated');
create policy "Authenticated delete" on storage.objects for delete
  using (auth.role() = 'authenticated');

-- =========================================================================
-- Done. Next: create your admin login user in
-- Supabase Dashboard -> Authentication -> Users -> Add user
-- =========================================================================
