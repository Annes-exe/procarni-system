// src/integrations/supabase/types/index.ts

export interface Supplier {
  id: string;
  rif: string;
  code?: string;
  name: string;
  email?: string;
  phone?: string;
  phone_2?: string;
  instagram?: string;
  address?: string;
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
}

export interface Material {
  id: string;
  code?: string;
  name: string;
  category?: string;
  unit?: string;
  is_exempt?: boolean;
  user_id: string;
}

export interface Company {
  id: string;
  name: string;
  rif: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  fiscal_data?: any;
  created_at: string;
  updated_at: string;
  user_id: string;
}

export interface QuoteRequest {
  id: string;
  supplier_id: string;
  company_id: string;
  currency: string;
  exchange_rate?: number | null;
  status: 'Draft' | 'Sent' | 'Archived' | 'Approved'; // Updated status type
  created_at: string;
  created_by?: string;
  user_id: string;
}

export interface PurchaseOrder {
  id: string;
  sequence_number?: number;
  supplier_id: string;
  company_id: string;
  currency: string;
  exchange_rate?: number | null;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived'; // Updated status type
  created_at: string;
  created_by?: string;
  user_id: string;
  // New fields
  delivery_date?: string;
  payment_terms?: string;
  custom_payment_terms?: string | null;
  credit_days?: number;
  observations?: string;
  quote_request_id?: string; // New field
}

export interface ServiceOrder { // NEW INTERFACE
  id: string;
  sequence_number?: number;
  issue_date: string;
  service_date: string;
  supplier_id: string;
  company_id: string;
  equipment_name: string;
  service_type: string;
  detailed_service_description?: string | null;
  destination_address: string;
  observations?: string | null;
  currency: 'USD' | 'VES';
  exchange_rate?: number | null;
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Archived';
  user_id: string;
  created_at: string;
}

export interface ServiceOrderItem { // NEW INTERFACE
  id?: string;
  order_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  sales_percentage?: number;
  discount_percentage?: number;
}

export interface SupplierMaterialPayload {
  material_id: string;
  specification?: string;
}

export interface QuoteRequestItem {
  id?: string;
  request_id?: string;
  material_name: string;
  quantity: number;
  description?: string;
  unit?: string;
  // is_exempt removed
}

export interface PurchaseOrderItem {
  id?: string;
  order_id?: string;
  material_id?: string; // NEW: Link to materials table
  material_name: string;
  supplier_code?: string; // Nuevo campo
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  is_exempt?: boolean;
  unit?: string; // Added unit field
  description?: string; // ADDED
  sales_percentage?: number; // NEW: Porcentaje de Venta (Additional Tax)
  discount_percentage?: number; // NEW: Porcentaje de Descuento
}

export interface FichaTecnica {
  id: string;
  user_id: string;
  nombre_producto: string;
  proveedor_id: string;
  storage_url: string; // Renamed from url_visualizacion
  created_at: string;
  suppliers?: { name: string }; // For fetching list
}

export interface SupplierQuote {
  id: string;
  material_id: string;
  supplier_id: string;
  user_id: string;
  unit_price: number;
  currency: 'USD' | 'VES';
  exchange_rate?: number | null;
  quote_request_id?: string | null;
  valid_until?: string | null;
  delivery_days?: number | null;
  created_at: string;
}

export interface QuoteComparison {
  id: string;
  user_id: string;
  name: string;
  base_currency: 'USD' | 'VES';
  global_exchange_rate?: number | null;
  created_at: string;
  items?: QuoteComparisonItem[];
}

export interface QuoteComparisonItem {
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
  materials?: {
    code: string;
    name: string;
  };
}