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
    const { data, error } = await supabase
      .from('price_history')
      .select(`
        *,
        suppliers (name, rif, code)
      `)
      .eq('material_id', materialId)
      .order('recorded_at', { ascending: false });

    if (error) {
      console.error('[PriceHistoryService.getByMaterialId] Error:', error);
      showError('Error al cargar el historial de precios.');
      return [];
    }
    return data as PriceHistoryEntry[];
  },
};

export const {
  getByMaterialId: getPriceHistoryByMaterialId,
} = PriceHistoryService;