export type UnitType = "residential" | "commercial";
export type UnitStatus = "occupied" | "vacant" | "under_maintenance";
export type ContractStatus = "active" | "expiring_soon" | "expired" | "terminated";
export type BillingStatus = "paid" | "pending" | "overdue";
export type PermitType = string;

export interface Unit {
  id: string;
  unit_name: string;
  unit_type: UnitType;
  address: string | null;
  status: UnitStatus;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface Tenant {
  id: string;
  unit_id: string | null;
  full_name: string;
  contact_number: string | null;
  email: string | null;
  move_in_date: string | null;
  active: boolean;
  created_at: string;
}

export interface Contract {
  id: string;
  unit_id: string;
  tenant_id: string | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  status: ContractStatus;
  contract_file_url: string | null;
  renewal_reminder_days: number;
  created_at: string;
  units?: Unit;
  tenants?: Tenant;
}

export interface Billing {
  id: string;
  unit_id: string;
  tenant_id: string | null;
  billing_period: string;
  amount_due: number;
  due_date: string;
  status: BillingStatus;
  receipt_url: string | null;
  deposit_slip_url: string | null;
  paid_date: string | null;
  follow_up_count: number;
  last_follow_up_at: string | null;
  notes: string | null;
  created_at: string;
  units?: Unit;
  tenants?: Tenant;
}

export interface Maintenance {
  id: string;
  unit_id: string;
  repair_date: string;
  repair_type: string;
  description: string | null;
  cost: number;
  before_photo_url: string | null;
  after_photo_url: string | null;
  materials_receipt_url: string | null;
  created_at: string;
  units?: Unit;
}

export interface Permit {
  id: string;
  unit_id: string | null;
  permit_type: PermitType;
  label: string | null;
  file_url: string;
  issued_date: string | null;
  expiry_date: string | null;
  created_at: string;
  units?: Unit;
}

export interface AppNotification {
  id: string;
  kind: "renewal" | "payment_pending" | "permit_expiring";
  related_table: string;
  related_id: string;
  message: string;
  due_on: string | null;
  resolved: boolean;
  created_at: string;
}

export const PERMIT_LABELS: Record<string, string> = {
  mayors_permit: "Mayor's Permit",
  dti: "DTI Registration",
  brgy_clearance: "Barangay Clearance",
  fire_permit: "Fire Permit",
  tax_declaration_property: "Tax Declaration — Property",
  tax_declaration_building: "Tax Declaration — Building",
  real_property_tax_property: "Real Property Tax — Property",
  real_property_tax_building: "Real Property Tax — Building",
  zonal_clearance: "Zonal Clearance",
  occupancy_permit: "Occupancy Permit",
  building_plan: "Building Plan",
  bir_2303: "BIR Form 2303 (Certificate of Registration)",
  land_title: "Land Title",
};
