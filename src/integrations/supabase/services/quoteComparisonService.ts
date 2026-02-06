// src/integrations/supabase/services/quoteComparisonService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { QuoteComparison, QuoteComparisonItem } from '../types';
import { logAudit } from './auditLogService';

interface QuoteComparisonPayload {
  name: string;
  base_currency: 'USD' | 'VES';
  global_exchange_rate?: number | null;
  user_id: string;
}

interface QuoteComparisonItemPayload {
  material_id: string;
  material_name: string;
  quotes: QuoteComparisonItem['quotes'];
}

const QuoteComparisonService = {
  getAll: async (): Promise<QuoteComparison[]> => {
    const { data, error } = await supabase
      .from('quote_comparisons')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[QuoteComparisonService.getAll] Error:', error);
      showError('Error al cargar las comparaciones guardadas.');
      return [];
    }
    return data as QuoteComparison[];
  },

  getById: async (id: string): Promise<QuoteComparison | null> => {
    const { data: comparison, error: comparisonError } = await supabase
      .from('quote_comparisons')
      .select('*')
      .eq('id', id)
      .single();

    if (comparisonError) {
      console.error('[QuoteComparisonService.getById] Error fetching comparison:', comparisonError);
      return null;
    }

    const { data: items, error: itemsError } = await supabase
      .from('quote_comparison_items')
      .select(`
        *,
        materials (code, name)
      `)
      .eq('comparison_id', id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      console.error('[QuoteComparisonService.getById] Error fetching comparison items:', itemsError);
      // Return comparison header even if items fail
      return comparison as QuoteComparison;
    }

    return {
      ...comparison,
      items: items as QuoteComparisonItem[],
    } as QuoteComparison;
  },

  create: async (
    comparisonData: QuoteComparisonPayload,
    items: QuoteComparisonItemPayload[]
  ): Promise<QuoteComparison | null> => {
    const { data: newComparison, error: comparisonError } = await supabase
      .from('quote_comparisons')
      .insert(comparisonData)
      .select()
      .single();

    if (comparisonError) {
      console.error('[QuoteComparisonService.create] Error creating comparison:', comparisonError);
      showError('Error al guardar la comparación.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_QUOTE_COMPARISON', { 
      table: 'quote_comparisons',
      record_id: newComparison.id, 
      description: `Creación de Comparación de Cotizaciones: ${newComparison.name}`,
      material_count: items.length
    });
    // -----------------

    if (items && items.length > 0) {
      const comparisonItems = items.map(item => ({
        comparison_id: newComparison.id,
        material_id: item.material_id,
        material_name: item.material_name,
        quotes: item.quotes,
      }));

      const { error: itemsError } = await supabase
        .from('quote_comparison_items')
        .insert(comparisonItems);

      if (itemsError) {
        console.error('[QuoteComparisonService.create] Error inserting items:', itemsError);
        showError('Error al guardar los ítems de la comparación.');
        // Note: We keep the comparison header even if items fail
      }
    }

    return newComparison as QuoteComparison;
  },

  update: async (
    id: string,
    comparisonData: Partial<QuoteComparisonPayload>,
    items: QuoteComparisonItemPayload[]
  ): Promise<QuoteComparison | null> => {
    const { data: updatedComparison, error: comparisonError } = await supabase
      .from('quote_comparisons')
      .update(comparisonData)
      .eq('id', id)
      .select()
      .single();

    if (comparisonError) {
      console.error('[QuoteComparisonService.update] Error updating comparison:', comparisonError);
      showError('Error al actualizar la comparación.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_QUOTE_COMPARISON', { 
      table: 'quote_comparisons',
      record_id: id, 
      description: `Actualización de Comparación de Cotizaciones: ${updatedComparison.name}`,
      material_count: items.length
    });
    // -----------------

    // 1. Delete existing items
    const { error: deleteError } = await supabase
      .from('quote_comparison_items')
      .delete()
      .eq('comparison_id', id);

    if (deleteError) {
      console.error('[QuoteComparisonService.update] Error deleting old items:', deleteError);
      showError('Error al actualizar los ítems de la comparación.');
      return null;
    }

    // 2. Insert new items
    if (items && items.length > 0) {
      const comparisonItems = items.map(item => ({
        comparison_id: id,
        material_id: item.material_id,
        material_name: item.material_name,
        quotes: item.quotes,
      }));

      const { error: itemsError } = await supabase
        .from('quote_comparison_items')
        .insert(comparisonItems);

      if (itemsError) {
        console.error('[QuoteComparisonService.update] Error inserting new items:', itemsError);
        showError('Error al insertar nuevos ítems de la comparación.');
        return null;
      }
    }

    return updatedComparison as QuoteComparison;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('quote_comparisons')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[QuoteComparisonService.delete] Error:', error);
      showError('Error al eliminar la comparación.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_QUOTE_COMPARISON', { 
      table: 'quote_comparisons',
      record_id: id,
      description: 'Eliminación de Comparación de Cotizaciones'
    });
    // -----------------
    
    return true;
  },
};

export const {
  getAll: getAllQuoteComparisons,
  getById: getQuoteComparisonById,
  create: createQuoteComparison,
  update: updateQuoteComparison,
  delete: deleteQuoteComparison,
} = QuoteComparisonService;