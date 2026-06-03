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
  website?: string | null;
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
  observations: string | null;
  quote_request_id: string | null;
  service_order_id?: string | null; // Added
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
  unit_id?: string | null; // ADDED
  material_id: string | null;
  description: string | null; // ADDED
  sales_percentage: number | null; // NEW
  discount_percentage: number | null; // NEW
  was_recalculated?: boolean;
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
  material_id: string;
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
  status: 'Draft' | 'Approved' | 'Rejected' | 'Archived';
  user_id: string;
  created_at: string | null;
  supplier?: Supplier;
  company?: Company;
  suppliers?: any;
  companies?: any;
  service_order_items?: ServiceOrderItem[];
  service_order_materials?: ServiceOrderMaterial[];
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
  was_recalculated?: boolean;
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
  unit_id?: string | null; // ADDED
  description: string | null;
  sales_percentage: number | null;
  discount_percentage: number | null;
  material_name?: string | null;
  was_recalculated?: boolean;
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

// ============================================================
// MÓDULO DE INVENTARIO
// ============================================================

export type InventoryCategory = 'MPF' | 'MPS' | 'EMP' | 'ETQ';

export type InventoryTransactionType =
  | 'IN_PURCHASE'     // Entrada desde Orden de Compra
  | 'IN_DIRECT'       // Entrada directa
  | 'OUT_PRODUCTION'  // Salida a producción
  | 'ADJUSTMENT_LOSS' // Merma de traslado (automática) o pérdida manual
  | 'ADJUSTMENT_ADD'  // Sobrante de conteo o ajuste positivo
  | 'ADJUSTMENT_MANUAL' // Ajuste manual genérico (legacy)
  | 'OUT_SALE'        // Salida por venta directa
  | 'REVERSAL';       // Reverso de auditoría

export type InventoryPeriodStatus = 'ABIERTO' | 'CERRADO';

// Familia de prefijos de SKU (inventory_families)
export type InventoryFamily = {
  id: string;
  category: InventoryCategory;
  prefix: string;
  description: string | null;
  current_sequence: number;
  created_at: string;
  updated_at: string;
};

// Material habilitado para almacén (materials_inventory + join materials)
export type MaterialInventory = {
  material_id: string;
  sku: string;
  inventory_category: InventoryCategory;
  unit: string;
  last_purchase_price: number;
  current_stock: number;
  average_unit_cost: number;
  total_value: number;
  min_stock_alert: number;
  is_active: boolean;
  notes: string | null;
  enabled_by: string | null;
  enabled_at: string;
  updated_at: string;
  // Join a materials
  materials?: {
    id: string;
    code: string | null;
    name: string;
    category: string | null;
    unit: string | null;
  };
};

// Transacción del Kardex (inventory_transactions)
export type InventoryTransaction = {
  id: string;
  material_id: string;
  transaction_date: string;
  transaction_type: InventoryTransactionType;
  quantity: number;             // + entrada / - salida
  expected_quantity: number | null;
  actual_quantity: number | null;
  unit_cost: number;
  total_cost: number;           // Columna generada: quantity * unit_cost
  stock_after: number | null;   // Snapshot post-transacción
  avg_cost_after: number | null;
  reference_doc: string | null;
  destination_data: Record<string, unknown> | null; // JSONB libre (capsulas, evidencia cloudinary, etc.)
  reverses_id: string | null;
  reason_code: string | null;   // Para ADJUSTMENT_LOSS / ADJUSTMENT_ADD
  sale_reference: string | null; // Para OUT_SALE
  created_by: string | null;
  created_at: string;
  audit_note: string | null;
  // Join a materials_inventory
  materials_inventory?: {
    sku: string;
    unit: string;
    materials?: { name: string; code: string | null };
  };
};

// Periodo contable (inventory_periods)
export type InventoryPeriod = {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  status: InventoryPeriodStatus;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
};

// Motivo de ajuste manual (inventory_adjustment_reasons)
export type InventoryAdjustmentReason = {
  id: string;
  code: string;
  description: string;
  applies_to: 'LOSS' | 'ADD' | 'BOTH';
  is_active: boolean;
  created_at: string;
};

// Snapshot diario (inventory_snapshots)
export type InventorySnapshot = {
  id: string;
  snapshot_date: string;
  material_id: string;
  stock_quantity: number;
  average_unit_cost: number;
  total_value: number;
  created_at: string;
};

// Payloads de los RPCs
export type RecepcionPayload = {
  p_material_id: string;
  p_transaction_type: 'IN_PURCHASE' | 'IN_DIRECT';
  p_peso_guia: number;
  p_peso_recibido: number;
  p_unit_cost: number;
  p_reference_doc: string;
  p_transaction_date?: string;
};

export type SalidaProduccionItem = {
  material_id: string;
  cantidad_real: number;
  cantidad_teorica?: number;
  material_original_id?: string | null;
  nota?: string | null;
};

export type SalidaProduccionPayload = {
  p_orden_id: string;
  p_destination_data: Record<string, unknown>;
  p_items: SalidaProduccionItem[];
  p_transaction_date?: string;
};

export type SalidaVentaPayload = {
  p_material_id: string;
  p_cantidad: number;
  p_sale_reference: string;
  p_cliente: string;
  p_transaction_date?: string;
};

export type AjusteInventarioPayload = {
  p_material_id: string;
  p_transaction_type: 'ADJUSTMENT_LOSS' | 'ADJUSTMENT_ADD';
  p_cantidad: number;
  p_reason_code: string;
  p_observacion: string;
  p_reference_doc?: string;
  p_transaction_date?: string;
};

// Metadatos de evidencia Cloudinary (guardados en destination_data)
export type CloudinaryEvidenceMeta = {
  tipo: 'EVIDENCIA_ENTRADA_DIRECTA';
  secure_url: string;
  public_id: string;
  format: string;
  bytes: number;
};

// Contrato del archivo JSON de Orden de Producción
export type ProductionOrderJSON = {
  orden_id: string;
  producto_fabricado: string;
  presentacion: string;
  fecha_produccion: string;
  lotes_planificados: number;
  peso_crudo_total_kg: number;
  materiales_requeridos: {
    material_id?: string;
    codigo_origen?: string;
    nombre_material: string;
    cantidad_teorica: number;
    unidad_medida: string;
  }[];
};