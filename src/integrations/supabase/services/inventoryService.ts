import { supabase } from '../client';
import {
  MaterialInventory,
  InventoryTransaction,
  InventoryPeriod,
  InventoryAdjustmentReason,
  InventoryFamily,
  RecepcionPayload,
  SalidaProduccionPayload,
  SalidaVentaPayload,
  AjusteInventarioPayload,
} from '../types';

// ============================================================
// READS
// ============================================================

/** Lista todos los materiales habilitados para almacén con datos del catálogo */
export const getMaterialsInventory = async (): Promise<MaterialInventory[]> => {
  const { data, error } = await supabase
    .from('materials_inventory')
    .select(`
      *,
      materials (
        id,
        code,
        name,
        category,
        unit
      )
    `)
    .eq('is_active', true)
    .order('sku')
    .limit(10000); // Override PostgREST's default 1000-row cap

  if (error) throw error;
  return (data ?? []) as MaterialInventory[];
};

/** Materiales del catálogo general que aún NO están en inventario */
export const getMaterialsNotInInventory = async (
  search?: string
): Promise<
  { id: string; name: string; code: string | null; category: string | null; unit: string | null }[]
> => {
  // Step 1: get IDs already in inventory
  const { data: enabled, error: errEnabled } = await supabase
    .from('materials_inventory')
    .select('material_id')
    .eq('is_active', true)
    .limit(10000); // Override PostgREST's default 1000-row cap

  if (errEnabled) throw errEnabled;

  const enabledIds = (enabled ?? []).map(r => r.material_id);

  // Step 2: fetch all materials excluding those IDs
  let query = supabase
    .from('materials')
    .select('id, name, code, category, unit');

  if (enabledIds.length > 0) {
    query = query.not('id', 'in', `(${enabledIds.map(id => `"${id}"`).join(',')})`);
  }

  if (search && search.trim() !== '') {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%`);
  }

  const { data, error } = await query
    .order('name')
    .limit(100); // Return up to 100 candidate matches

  if (error) throw error;
  return data ?? [];
};


/** Habilita un material para el almacén (el trigger de Postgres asigna el SKU) */
export const enableMaterialForInventory = async (payload: {
  material_id: string;
  inventory_category: MaterialInventory['inventory_category'];
  unit: string;
  min_stock_alert?: number;
  last_purchase_price?: number;
  notes?: string;
}): Promise<MaterialInventory> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase
    .from('materials_inventory')
    .insert({
      material_id: payload.material_id,
      inventory_category: payload.inventory_category,
      unit: payload.unit,
      min_stock_alert: payload.min_stock_alert ?? 0,
      last_purchase_price: payload.last_purchase_price ?? 0,
      notes: payload.notes ?? null,
      sku: '', // El trigger lo reemplazará automáticamente
      enabled_by: session?.user.id ?? null,
    })
    .select('*, materials(id, code, name, category, unit)')
    .single();

  if (error) throw error;
  return data as MaterialInventory;
};

/** Secuencias actuales para preview del SKU en el formulario de habilitación */
export const getInventoryFamilies = async (): Promise<InventoryFamily[]> => {
  const { data, error } = await supabase
    .from('inventory_families')
    .select('*')
    .order('category');

  if (error) throw error;
  return (data ?? []) as InventoryFamily[];
};

// ============================================================
// ÓRDENES DE COMPRA (para el tab "Desde OC" de Recepciones)
// ============================================================

/** OCs en estado 'Approved' — usadas en la pestaña de recepción por OC */
export const getPurchaseOrdersAprobadas = async () => {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id, sequence_number, created_at, suppliers(name)')
    .eq('status', 'Approved')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const getPurchaseOrderItemsHabilitados = async (orderId: string) => {
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(`
      id,
      material_id,
      material_name,
      quantity,
      unit_price,
      unit,
      materials!inner (
        id,
        materials_inventory!inner (
          material_id,
          sku,
          average_unit_cost,
          current_stock
        )
      )
    `)
    .eq('order_id', orderId)
    .not('material_id', 'is', null);

  if (error) throw error;
  
  return (data ?? []).map((item: any) => ({
    id: item.id,
    material_id: item.material_id,
    material_name: item.material_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    unit: item.unit,
    materials_inventory: item.materials?.materials_inventory || null
  }));
};

// ============================================================
// KARDEX (reads)
// ============================================================

export interface KardexFilters {
  materialId?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

/** Historial de transacciones del Kardex con filtros y join */
export const getKardex = async (filters: KardexFilters = {}): Promise<InventoryTransaction[]> => {
  let query = supabase
    .from('inventory_transactions')
    .select(`
      *,
      materials_inventory (
        sku,
        unit,
        materials (name, code)
      )
    `)
    .order('transaction_date', { ascending: false });

  if (filters.materialId) {
    query = query.eq('material_id', filters.materialId);
  }
  if (filters.startDate) {
    query = query.gte('transaction_date', filters.startDate);
  }
  if (filters.endDate) {
    // Incluye todo el día final
    query = query.lte('transaction_date', filters.endDate + 'T23:59:59.999Z');
  }
  if (filters.type) {
    query = query.eq('transaction_type', filters.type);
  }

  const from = filters.offset ?? 0;
  const to = from + (filters.limit ?? 100) - 1;
  query = query.range(from, to);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryTransaction[];
};

// ============================================================
// PERIODOS CONTABLES
// ============================================================

/** Lista todos los periodos ordenados por fecha descendente */
export const getInventoryPeriods = async (): Promise<InventoryPeriod[]> => {
  const { data, error } = await supabase
    .from('inventory_periods')
    .select('*')
    .order('start_date', { ascending: false });

  if (error) throw error;
  return (data ?? []) as InventoryPeriod[];
};

/** Crea un nuevo periodo contable */
export const crearPeriodoInventario = async (payload: {
  period_name: string;
  start_date: string;
  end_date: string;
  notes?: string;
}): Promise<InventoryPeriod> => {
  const { data, error } = await supabase
    .from('inventory_periods')
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as InventoryPeriod;
};

// ============================================================
// CATÁLOGO DE MOTIVOS DE AJUSTE
// ============================================================

/** Motivos filtrados por tipo de ajuste */
export const getAdjustmentReasons = async (
  appliesTo?: 'LOSS' | 'ADD'
): Promise<InventoryAdjustmentReason[]> => {
  let query = supabase
    .from('inventory_adjustment_reasons')
    .select('*')
    .eq('is_active', true)
    .order('code');

  if (appliesTo) {
    query = query.or(`applies_to.eq.${appliesTo},applies_to.eq.BOTH`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as InventoryAdjustmentReason[];
};

// ============================================================
// RPCs ATÓMICOS
// ============================================================

/** Registra una entrada de inventario (OC o Directa) con merma automática */
export const registrarRecepcion = async (
  payload: RecepcionPayload
): Promise<{ success: boolean; entrada_id: string; merma_id?: string; merma_kg: number }> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc('registrar_recepcion_inventario', {
    ...payload,
    p_created_by: session?.user.id ?? null,
  });

  if (error) throw error;
  return data;
};

/** Registra una salida de inventario a producción (batch de materiales) */
export const registrarSalidaProduccion = async (
  payload: SalidaProduccionPayload
): Promise<{ success: boolean; orden_id: string; transacciones: unknown[] }> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc('registrar_salida_produccion', {
    p_orden_id: payload.p_orden_id,
    p_destination_data: payload.p_destination_data,
    p_items: payload.p_items,
    p_transaction_date: payload.p_transaction_date,
    p_created_by: session?.user.id ?? null,
  });

  if (error) throw error;
  return data;
};

/** Registra una salida por venta directa */
export const registrarSalidaVenta = async (
  payload: SalidaVentaPayload
): Promise<{ success: boolean; tx_id: string; costo_total: number }> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc('registrar_salida_venta', {
    ...payload,
    p_created_by: session?.user.id ?? null,
  });

  if (error) throw error;
  return data;
};

/** Registra un ajuste de inventario (pérdida o sobrante) */
export const registrarAjusteInventario = async (
  payload: AjusteInventarioPayload
): Promise<{ success: boolean; tx_id: string; impacto_financiero: number }> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc('registrar_ajuste_inventario', {
    ...payload,
    p_created_by: session?.user.id ?? null,
  });

  if (error) throw error;
  return data;
};

/** Emite un reverso de auditoría para una transacción errónea */
export const registrarReversoInventario = async (
  txId: string,
  motivo: string
): Promise<{ success: boolean; reverso_id: string; original_id: string }> => {
  const { data: { session } } = await supabase.auth.getSession();

  const { data, error } = await supabase.rpc('registrar_reverso_inventario', {
    p_transaction_id_a_revertir: txId,
    p_motivo: motivo,
    p_created_by: session?.user.id ?? null,
  });

  if (error) throw error;
  return data;
};

/** Cierra un periodo contable (solo admin) */
export const cerrarPeriodoInventario = async (
  periodId: string
): Promise<{ success: boolean; period_name: string; closed_at: string }> => {
  const { data, error } = await supabase.rpc('cerrar_periodo_inventario', {
    p_period_id: periodId,
  });

  if (error) throw error;
  return data;
};

// ============================================================
// DICCIONARIO JUST-IN-TIME (Aliases)
// ============================================================

// Función para obtener todos los alias conocidos
export const getMaterialAliases = async () => {
  const { data, error } = await supabase
    .from('material_aliases')
    .select('material_id, external_code');

  if (error) {
    console.error('Error fetching aliases:', error);
    throw error;
  }
  
  // Retornamos un mapa (Record) para búsquedas instantáneas O(1) en el frontend
  const aliasMap: Record<string, string> = {};
  data?.forEach(alias => {
    aliasMap[alias.external_code] = alias.material_id;
  });
  
  return aliasMap;
};

// Función para guardar los nuevos emparejamientos que haga el analista
export const saveMaterialAliases = async (mappings: { material_id: string; external_code: string }[]) => {
  if (mappings.length === 0) return;

  const { error } = await supabase
    .from('material_aliases')
    .insert(mappings);

  if (error) {
    console.error('Error saving aliases:', error);
    throw error;
  }
};
