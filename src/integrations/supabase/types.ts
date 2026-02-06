// Define types based on your Supabase schema

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

export type Supplier = {
  id: string;
  rif: string;
  name: string;
  email: string | null;
  phone: string | null;
  payment_terms: string;
  credit_days: number | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
  custom_payment_terms: string | null;
  phone_2: string | null;
  instagram: string | null;
  address: string | null;
  code: string | null;
};

export type Material = {
  id: string;
  code: string | null;
  name: string;
  category: string | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
  unit: string | null;
  is_exempt: boolean | null;
};

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  fiscal_data: any | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string;
  rif: string;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type PurchaseOrder = {
  id: string;
  sequence_number: number | null;
  supplier_id: string;
  company_id: string;
  currency: string;
  exchange_rate: number | null;
  status: string;
  created_at: string | null;
  created_by: string | null;
  user_id: string;
  delivery_date: string | null;
  payment_terms: string | null;
  custom_payment_terms: string | null;
  credit_days: number | null;
  observations: string | null;
  quote_request_id: string | null;
  supplier: Supplier; // Assuming we might join this
  company: Company; // Assuming we might join this
};

export type PurchaseOrderItem = {
  id: string;
  order_id: string;
  material_name: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  created_at: string | null;
  updated_at: string | null;
  supplier_code: string | null;
  unit: string | null;
  material_id: string | null;
  description: string | null; // ADDED
  sales_percentage: number | null; // NEW
  discount_percentage: number | null; // NEW
};

export type QuoteRequest = {
  id: string;
  supplier_id: string;
  company_id: string;
  currency: string;
  exchange_rate: number | null;
  status: string;
  created_at: string | null;
  created_by: string | null;
  user_id: string;
};

export type QuoteRequestItem = {
  id: string;
  request_id: string;
  material_name: string;
  quantity: number;
  created_at: string | null;
  updated_at: string | null;
  description: string | null;
  unit: string | null;
  is_exempt: boolean | null;
};

export type PriceHistory = {
  id: string;
  material_id: string;
  supplier_id: string;
  unit_price: number;
  currency: string;
  exchange_rate: number | null;
  purchase_order_id: string | null;
  recorded_at: string | null;
  user_id: string;
};

export type FichaTecnica = {
  id: string;
  user_id: string;
  nombre_producto: string;
  proveedor_id: string;
  storage_url: string;
  created_at: string | null;
};

export type AuditLog = {
  id: string;
  action: string;
  user_email: string | null;
  details: any | null;
  timestamp: string | null;
};

export type SupplierMaterial = {
  id: string;
  supplier_id: string;
  material_id: string;
  specification: string | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
};

export type SupplierQuote = {
  id: string;
  material_id: string;
  supplier_id: string;
  user_id: string;
  unit_price: number;
  currency: 'USD' | 'VES';
  exchange_rate: number | null;
  quote_request_id: string | null;
  valid_until: string | null;
  delivery_days: number | null;
  created_at: string;
};

export type QuoteComparison = {
  id: string;
  user_id: string;
  name: string;
  base_currency: 'USD' | 'VES';
  global_exchange_rate: number | null;
  created_at: string;
  items?: QuoteComparisonItem[]; // Joined items
};

export type QuoteComparisonItem = {
  id: string;
  comparison_id: string;
  material_id: string;
  material_name: string;
  quotes: Array<{
    supplierId: string;
    supplierName: string;
    unitPrice: number;
    currency: 'USD' | 'VES';
    exchangeRate?: number;
  }>;
  created_at: string;
  materials?: { // Joined material details
    code: string;
    name: string;
  };
};

// --- NEW TYPES FOR SERVICE ORDERS ---

export type ServiceOrder = {
  id: string;
  sequence_number: number | null;
  issue_date: string;
  service_date: string;
  supplier_id: string;
  company_id: string;
  equipment_name: string;
  service_type: string;
  detailed_service_description: string | null;
  destination_address: string;
  observations: string | null;
  currency: 'USD' | 'VES';
  exchange_rate: number | null;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
  user_id: string;
  created_at: string | null;
  supplier?: Supplier;
  company?: Company;
};

export type ServiceOrderItem = {
  id: string;
  order_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  sales_percentage: number | null;
  discount_percentage: number | null;
  created_at: string | null;
};