// src/integrations/supabase/services/supplierQuoteService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { SupplierQuote } from '../types';
import { logAudit } from './auditLogService';

interface SupplierQuotePayload extends Omit<SupplierQuote, 'id' | 'created_at' | 'user_id'> {
  user_id: string;
}

const SupplierQuoteService = {
  getQuotesByMaterial: async (materialId: string): Promise<SupplierQuote[]> => {
    const { data, error } = await supabase
      .from('supplier_quotes')
      .select(`
        *,
        suppliers (id, name, code, rif, phone, email)
      `)
      .eq('material_id', materialId)
      .order('unit_price', { ascending: true }); // Order by price for comparison

    if (error) {
      console.error('[SupplierQuoteService.getQuotesByMaterial] Error:', error);
      showError('Error al cargar las cotizaciones.');
      return [];
    }
    return data as SupplierQuote[];
  },

  createOrUpdateQuote: async (payload: SupplierQuotePayload): Promise<SupplierQuote | null> => {
    // Check if a quote already exists for this material/supplier pair
    const { data: existingQuote, error: fetchError } = await supabase
      .from('supplier_quotes')
      .select('id')
      .eq('material_id', payload.material_id)
      .eq('supplier_id', payload.supplier_id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 means "no rows found"
      console.error('[SupplierQuoteService.createOrUpdateQuote] Error checking existing quote:', fetchError);
      showError('Error al verificar cotización existente.');
      return null;
    }

    let result;
    let auditAction: 'CREATE_QUOTE' | 'UPDATE_QUOTE';

    if (existingQuote) {
      // Update existing quote
      result = await supabase
        .from('supplier_quotes')
        .update({
          unit_price: payload.unit_price,
          currency: payload.currency,
          exchange_rate: payload.exchange_rate,
          quote_request_id: payload.quote_request_id,
          valid_until: payload.valid_until,
          delivery_days: payload.delivery_days,
        })
        .eq('id', existingQuote.id)
        .select()
        .single();
      auditAction = 'UPDATE_QUOTE';
    } else {
      // Create new quote
      result = await supabase
        .from('supplier_quotes')
        .insert(payload)
        .select()
        .single();
      auditAction = 'CREATE_QUOTE';
    }

    if (result.error) {
      console.error(`[SupplierQuoteService.${auditAction}] Error:`, result.error);
      showError(`Error al guardar la cotización: ${result.error.message}`);
      return null;
    }

    // --- AUDIT LOG ---
    logAudit(auditAction, { 
      table: 'supplier_quotes',
      record_id: result.data.id, 
      description: `${auditAction === 'CREATE_QUOTE' ? 'Registro' : 'Actualización'} de cotización`,
      material_id: payload.material_id,
      supplier_id: payload.supplier_id,
      price: payload.unit_price,
      currency: payload.currency
    });
    // -----------------

    return result.data as SupplierQuote;
  },
  
  deleteQuote: async (quoteId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('supplier_quotes')
      .delete()
      .eq('id', quoteId);

    if (error) {
      console.error('[SupplierQuoteService.deleteQuote] Error:', error);
      showError('Error al eliminar la cotización.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_QUOTE', { 
      table: 'supplier_quotes',
      record_id: quoteId,
      description: 'Eliminación de cotización'
    });
    // -----------------
    
    return true;
  },
};

export const {
  getQuotesByMaterial,
  createOrUpdateQuote,
  deleteQuote,
} = SupplierQuoteService;