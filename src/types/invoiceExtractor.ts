/**
 * Interfaces TypeScript para el esquema canónico de facturas
 * Diseñado para tipado estricto e inserción directa en PostgreSQL / Supabase.
 */

export type DocumentType = 'Factura' | 'Nota de Entrega' | 'Recibo' | 'Factura Fiscal' | 'Desconocido';
export type CurrencyCode = 'VES' | 'USD' | 'EUR';
export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Pago Movil' | 'Divisas' | 'Multiples' | 'Desconocido';

export interface DocumentInfo {
  tipo: DocumentType | null;
  numero_factura: string | null;
  numero_control?: string | null;
  fecha_emision: string | null; // Formato YYYY-MM-DD
  hora_emision: string | null;  // Formato HH:MM
}

export interface EmisorInfo {
  razon_social: string | null;
  rif: string | null;
  direccion_fiscal?: string | null;
  telefono?: string | null;
}

export interface ClienteInfo {
  razon_social: string | null;
  identificacion_rif_ci: string | null;
  direccion?: string | null;
}

export interface TotalesInfo {
  moneda_principal: CurrencyCode | null;
  subtotal_base_imponible: number | null;
  monto_iva: number | null;
  monto_igtf: number | null;
  total_general: number | null;
}

export interface ExtractedInvoiceItem {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number;
  precio_total?: number | null;
  codigo_referencia?: string | null;
}

export interface ExtractedInvoiceSchema {
  documento: DocumentInfo;
  emisor: EmisorInfo;
  cliente: ClienteInfo;
  totales: TotalesInfo;
  items?: ExtractedInvoiceItem[];
  metodo_pago: PaymentMethod | string | null;
}

export interface InvoiceExtractionResult {
  success: boolean;
  data?: ExtractedInvoiceSchema;
  rawOcrText?: string;
  executionTimeMs?: number;
  error?: string;
}
