export type LeadStatus = "New" | "Contacted" | "Qualified" | "Converted" | "Rejected";
export type CommissionModel = "qualified_lead" | "sale_fixed" | "sale_percent";

export interface Creator {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  platform: string | null;
  profile_url: string | null;
  referral_code: string;
  commission_model: CommissionModel;
  commission_value: number;
  is_active: boolean;
  auth_user_id: string | null;
  dashboard_permissions: Record<string, boolean>;
  created_at: string;
}

export interface Lead {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  creator_id: string | null;
  referral_code: string | null;
  source: string;
  product_id: string | null;
  product_name?: string | null;
  status: LeadStatus;
  message: string | null;
  notes: string | null;
  revenue_amount: number;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

export interface Commission {
  id: string;
  creator_id: string;
  lead_id: string;
  amount: number;
  commission_type: string;
  status: "pending" | "approved" | "paid";
  created_at: string;
  creators?: { name: string; referral_code: string } | null;
}

export interface Payment {
  id: string;
  creator_id: string;
  amount: number;
  payment_date: string;
  method: string;
  transaction_reference: string | null;
  created_at: string;
  creators?: { name: string; referral_code: string } | null;
}
