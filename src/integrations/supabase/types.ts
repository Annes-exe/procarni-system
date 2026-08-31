// Define types based on your Supabase schema

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  cloudinary_public_id: string | null;
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
  city: string | null;
  alert_comment: string | null;
  website: string | null;
  is_raw_material?: boolean | null;
  rubros?: string | null;
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
  unit_id: string | null; // ADDED
  is_exempt: boolean | null;
  base_material_id?: string | null;
  search_aliases?: string[] | null;
  is_master?: boolean;
  status?: string;
  color?: string | null;
  brand?: string | null;
};

export type MaterialCategory = {
  id: string;
  name: string;
  user_id: string | null;
  created_at: string | null;
};

export type UnitOfMeasure = {
  id: string;
  name: string;
  category: 'Base' | 'Volumen'; // ADDED
  user_id: string | null;
  created_at: string | null;
};

export type Company = {
  id: string;
  name: string;
  logo_url: string | null;
  cloudinary_public_id: string | null;
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
  currency: 'USD' | 'VES' | 'EUR';
  base_currency: 'USD' | 'EUR';
  exchange_rate: number | null;
  status: string;
  created_at: string | null;
  created_by: string | null;
  user_id: string;
  issue_date: string | null; // Added
  delivery_date: string | null;
  print_date: string | null; // Added
  payment_terms: string | null;
  custom_payment_terms: string | null;
  credit_days: number | null;
  payment_date: string | null;
  paid_amount: number | null;
  observations: string | null;
  quote_request_id: string | null;
  service_order_id?: string | null; // Added
  supplier: Supplier; // Assuming we might join this
  company: Company; // Assuming we might join this
  reception_status?: 'Ninguno' | 'En tránsito' | 'Parcial' | 'Recibido' | null;
  is_raw_material?: boolean | null;
  requisition_number?: string | null; // Added
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
  unit_id: string | null; // ADDED
  material_id: string | null;
  description: string | null; // ADDED
  sales_percentage: number | null; // NEW
  discount_percentage: number | null; // NEW
  was_recalculated?: boolean | null;
  received_quantity?: number;
};

export type QuoteRequest = {
  id: string;
  supplier_id: string;
  company_id: string;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  status: string;
  created_at: string | null;
  created_by: string | null;
  user_id: string;
  issue_date: string | null;
  deadline_date: string | null;
  print_date: string | null; // Added
  is_raw_material?: boolean | null;
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
  unit_id: string | null; // ADDED
  is_exempt: boolean | null;
  material_id: string | null; // Added
  materials?: { // Added
    code: string | null;
    name: string;
    unit_id?: string | null;
  };
};

export type PriceHistory = {
  id: string;
  material_id: string;
  supplier_id: string;
  unit_id: string | null; // ADDED
  unit_price: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  purchase_order_id: string | null;
  service_order_id: string | null;
  recorded_at: string | null;
  user_id: string;
};

export type FichaTecnica = {
  id: string;
  user_id: string;
  nombre_producto: string;
  proveedor_id: string;
  storage_url: string;
  cloudinary_public_id?: string | null;
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
  unit_id: string | null; // ADDED
  specification: string | null;
  name_provided: string | null;
  created_at: string | null;
  updated_at: string | null;
  user_id: string | null;
};

export type SupplierQuote = {
  id: string;
  material_id: string;
  supplier_id: string;
  unit_id: string | null; // ADDED
  user_id: string;
  unit_price: number;
  currency: 'USD' | 'VES' | 'EUR';
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
  base_currency: 'USD' | 'VES' | 'EUR';
  global_exchange_rate: number | null;
  created_at: string;
  type?: 'quote_comparison' | 'price_matrix' | null;
  items?: QuoteComparisonItem[]; // Joined items
};

export type QuoteEntry = {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number;
  unit_id: string;
  unit_name?: string;
  convertedPrice?: number | null;
  isValid?: boolean;
  error?: string | null;
  isBest?: boolean;
  comment?: string | null;
};

export interface ComparisonResult {
  material: {
    id: string;
    name: string;
    code: string;
    unit_id?: string;
  };
  results: QuoteEntry[];
  unitGroups?: Record<string, number>;
  bestPrice: number | null;
}

export type QuoteComparisonItem = {
  id: string;
  comparison_id: string;
  material_id: string | null;
  material_name: string;
  quotes: QuoteEntry[];
  unit_id?: string | null;
  created_at: string;
  materials?: {
    code: string;
    name: string;
    unit_id?: string | null;
  };
};

// --- NEW TYPES FOR SERVICE ORDERS ---

export type ServiceOrder = {
  id: string;
  sequence_number: number | null;
  issue_date: string;
  service_date: string;
  print_date: string | null; // Added
  supplier_id: string;
  company_id: string;
  equipment_name: string;
  service_type: string;
  detailed_service_description: string | null;
  destination_address: string;
  observations: string | null;
  currency: 'USD' | 'VES' | 'EUR';
  base_currency: 'USD' | 'EUR';
  exchange_rate: number | null;
  status: string;
  payment_terms: string | null;
  custom_payment_terms: string | null;
  credit_days: number | null;
  payment_date: string | null;
  paid_amount: number | null;
  user_id: string;
  created_at: string | null;
  supplier?: Supplier;
  company?: Company;
  service_order_items?: ServiceOrderItem[];
  service_order_materials?: ServiceOrderMaterial[];
  requisition_number?: string | null; // Added
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

export type ServiceOrderMaterial = {
  id: string;
  service_order_id: string;
  supplier_id: string;
  material_id: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  is_exempt: boolean;
  supplier_code: string | null;
  unit: string | null;
  unit_id: string | null; // ADDED
  description: string | null;
  sales_percentage: number | null;
  discount_percentage: number | null;
  suppliers?: {
    name: string;
  };
  materials?: {
    name: string;
  };
  created_at: string | null;
};

export type OrderDocument = {
  id: string;
  purchase_order_id?: string | null;
  service_order_id?: string | null;
  document_type: 'Factura' | 'Nota de Entrega' | 'Otro';
  document_number?: string | null;
  file_url: string;
  cloudinary_public_id?: string | null;
  created_at: string;
  user_id: string;
  profiles?: { email: string | null } | null;
};

export type SupplierMaterialPayload = {
  material_id: string;
  unit_id: string | null;
  specification?: string;
};

export type Location = {
  id: string;
  state: string;
  city: string;
  created_at: string;
};

export type FusionSuggestion = {
  target_id: string;
  target_name: string;
  source_id: string;
  source_name: string;
  similarity_score: number;
};

export type IgnoredMaterialMatch = {
  id: string;
  target_id: string;
  source_id: string;
  user_id: string | null;
  created_at: string;
};

export type SoftMigrationSuggestion = {
  master_id: string;
  master_name: string;
  dirty_id: string;
  dirty_name: string;
  dirty_category: string | null;
  dirty_unit: string | null;
  similarity_score: number;
};

export type PaymentTransaction = {
  id: string;
  order_id: string;
  order_type: 'purchase_order' | 'service_order';
  payment_date: string;
  amount: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  converted_amount: number;
  registered_by: string | null;
  previous_paid: number;
  new_paid: number;
  notes: string | null;
  created_at: string;
};
// --- TYPES FOR INVENTORY ---

export interface MaterialInventory {
  id: string;
  material_id: string;
  sku: string;
  inventory_category: 'MPF' | 'MPS' | 'EP' | 'ME' | 'SUM' | 'SE';
  unit: string;
  current_stock: number;
  average_unit_cost: number;
  last_purchase_price: number;
  min_stock_alert: number;
  is_active: boolean;
  inventory_type?: 'Producción' | 'Suministro' | null;
  notes?: string | null;
  enabled_by?: string | null;
  created_at: string;
  updated_at: string;
  materials?: {
    id: string;
    code: string | null;
    name: string;
    category: string | null;
    unit: string | null;
  } | null;
}

export interface RecepcionPayload {
  p_material_id: string;
  p_transaction_type: 'IN_PURCHASE' | 'IN_INITIAL' | 'IN_ADJUSTMENT';
  p_peso_guia: number;
  p_peso_recibido: number;
  p_unit_cost: number;
  p_reference_doc?: string;
  p_notes?: string;
}

export interface InventoryTransaction {
  id: string;
  material_id: string;
  transaction_type: string;
  quantity_in: number;
  quantity_out: number;
  unit_cost: number;
  total_cost: number;
  stock_after: number;
  average_cost_after: number;
  reference_doc?: string | null;
  notes?: string | null;
  created_by?: string | null;
  transaction_date: string;
  created_at: string;
  materials_inventory?: any;
}

export interface InventoryPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_closed: boolean;
  closed_at?: string | null;
  closed_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface InventoryAdjustmentReason {
  id: string;
  code: string;
  reason_name: string;
  applies_to: 'LOSS' | 'ADD' | 'BOTH';
  is_active: boolean;
  created_at: string;
}

export interface InventoryFamily {
  category: 'MPF' | 'MPS' | 'EP' | 'ME' | 'SUM' | 'SE';
  prefix: string;
  description: string;
  current_sequence: number;
}

export interface SalidaProduccionPayload {
  p_orden_id: string;
  p_destination_data?: any;
  p_items: { material_id: string; quantity: number }[];
  p_transaction_date?: string;
}

export interface SalidaVentaPayload {
  p_material_id: string;
  p_quantity: number;
  p_reference_doc?: string;
  p_notes?: string;
}

export interface AjusteInventarioPayload {
  p_material_id: string;
  p_adjustment_type: 'LOSS' | 'ADD';
  p_quantity: number;
  p_reason_code: string;
  p_reference_doc?: string;
  p_notes?: string;
}

// --- NEW TYPES FOR REQUISITIONS ---
export type Requisition = {
  id: string;
  type: 'purchase' | 'service' | 'warehouse' | 'logbook';
  sequence_number: number;
  created_at: string;
  user_id: string;
  profiles?: { first_name: string | null; last_name: string | null } | null;
};
