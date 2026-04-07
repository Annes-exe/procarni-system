// src/integrations/supabase/services/priceHistoryService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';

export interface PriceHistoryEntry {
  id: string;
  material_id: string;
  supplier_id: string;
  unit_price: number;
  currency: string;
  exchange_rate?: number | null;
  purchase_order_id?: string | null;
  service_order_id?: string | null;
  recorded_at: string;
  suppliers: {
    name: string;
    rif: string;
    code?: string;
  };
}

const PriceHistoryService = {
  getByMaterialId: async (materialId: string): Promise<PriceHistoryEntry[]> => {
    // 1. Resolve all material IDs that belong to the same group
    const { data: groupData } = await supabase
      .from('materials')
      .select('id, base_material_id')
      .eq('id', materialId)
      .single();

    let materialIds = [materialId];

    if (groupData) {
      if (groupData.base_material_id) {
        // It's a child. Get the base and all other children.
        const { data: relatedData } = await supabase
          .from('materials')
          .select('id')
          .or(`id.eq.${groupData.base_material_id},base_material_id.eq.${groupData.base_material_id}`);
        if (relatedData) {
          materialIds = Array.from(new Set(relatedData.map(r => r.id)));
        }
      } else {
        // It might be a base. Get all its children.
        const { data: relatedData } = await supabase
          .from('materials')
          .select('id')
          .eq('base_material_id', materialId);
        if (relatedData && relatedData.length > 0) {
          materialIds = [materialId, ...relatedData.map(r => r.id)];
        }
      }
    }

    // 2. Fetch price history for all related materials
    const { data, error } = await supabase
      .from('price_history')
      .select(`
        *,
        suppliers (name, rif, code)
      `)
      .in('material_id', materialIds)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('[PriceHistoryService.getByMaterialId] Error:', error);
      showError('Error al cargar el historial de precios.');
      return [];
    }

    const historyData = data as PriceHistoryEntry[];

    // --- DEDUPLICATION LOGIC ---
    // If a Purchase Order (OC) is created from a Service Order (OS), we want to show ONLY the OC price.
    // 1. Identify all PO IDs in the history.
    const poIds = historyData
      .filter(entry => entry.purchase_order_id)
      .map(entry => entry.purchase_order_id as string);

    if (poIds.length === 0) {
      return historyData;
    }

    // 2. Find which of these POs are linked to an SO.
    // We assume 'purchase_orders' table has 'service_order_id'.
    // Even if it doesn't in the type yet, we check if we can query it.
    // If the column doesn't exist, this might fail or return nulls.
    // Assuming we added the column or it exists.
    const { data: linkedPOs, error: poError } = await supabase
      .from('purchase_orders')
      .select('id, service_order_id')
      .in('id', poIds)
      .not('service_order_id', 'is', null);

    if (poError) {
      console.warn('[PriceHistoryService.getByMaterialId] Could not fetch linked POs for deduplication:', poError);
      return historyData; // Return original data if verify fails
    }

    if (!linkedPOs || linkedPOs.length === 0) {
      return historyData;
    }

    // 3. Create a set of "Superseded Service Order IDs"
    const supersededSOIds = new Set(linkedPOs.map(po => po.service_order_id));

    // 4. Filter out SO entries that are in the superseded set.
    // We keep entries that are:
    // - NOT Service Order entries (i.e. PO entries or direct entries)
    // - OR Service Order entries where the ID is NOT in the superseded set.
    const filteredData = historyData.filter(entry => {
      if (entry.service_order_id) {
        return !supersededSOIds.has(entry.service_order_id);
      }
      return true;
    });

    return filteredData;
  },
};

export const {
  getByMaterialId: getPriceHistoryByMaterialId,
} = PriceHistoryService;