// src/integrations/supabase/services/quoteComparisonService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { QuoteComparison, QuoteComparisonItem } from '../types';
import { logAudit } from './auditLogService';

interface QuoteComparisonPayload {
  name: string;
  base_currency: 'USD' | 'VES' | 'EUR';
  global_exchange_rate?: number | null;
  user_id: string;
  type?: 'quote_comparison' | 'price_matrix';
}

interface QuoteComparisonItemPayload {
  material_id?: string | null; // NULLABLE for Price Matrix items that might not map to catalog materials
  material_name: string;
  unit_id?: string | null; // OPTIONAL
  quotes: QuoteComparisonItem['quotes'];
}

const QuoteComparisonService = {
  getAll: async (typeFilter?: 'quote_comparison' | 'price_matrix'): Promise<QuoteComparison[]> => {
    let query = supabase
      .from('quote_comparisons')
      .select('*, quote_comparison_items(*)');

    if (typeFilter) {
      query = query.eq('type', typeFilter);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[QuoteComparisonService.getAll] Error:', error);
      showError('Error al cargar las comparaciones guardadas.');
      return [];
    }

    if (!data || data.length === 0) return [];

    // Fetch user profiles for all unique user_ids to avoid PostgREST relationship errors
    const userIds = Array.from(new Set(data.map((c: any) => c.user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username, email')
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      return data.map((item: any) => ({
        ...item,
        profiles: profileMap.get(item.user_id) || null
      })) as QuoteComparison[];
    }

    return data as QuoteComparison[];
  },

  getById: async (id: string): Promise<QuoteComparison | null> => {
    const { data: comparison, error: comparisonError } = await supabase
      .from('quote_comparisons')
      .select('*')
      .eq('id', id)
      .single();

    if (comparisonError || !comparison) {
      console.error('[QuoteComparisonService.getById] Error fetching comparison:', comparisonError);
      return null;
    }

    // Fetch items and creator profile in parallel
    const [itemsRes, profileRes] = await Promise.all([
      supabase
        .from('quote_comparison_items')
        .select(`
          *,
          materials (code, name, unit_id)
        `)
        .eq('comparison_id', id)
        .order('created_at', { ascending: true }),
      comparison.user_id
        ? supabase
            .from('profiles')
            .select('id, first_name, last_name, username, email')
            .eq('id', comparison.user_id)
            .single()
        : Promise.resolve({ data: null, error: null })
    ]);

    return {
      ...comparison,
      profiles: profileRes.data || null,
      items: (itemsRes.data || []) as QuoteComparisonItem[],
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
        material_name: item.material_name || 'Material sin nombre',
        unit_id: item.unit_id,
        quotes: item.quotes,
      }));

      const { error: itemsError } = await supabase
        .from('quote_comparison_items')
        .insert(comparisonItems);

      if (itemsError) {
        console.error('[QuoteComparisonService.create] Error inserting items:', itemsError);
        showError('Error al guardar los ítems de la comparación.');
        // Clean up the header to avoid partial saves showing up in the list
        await supabase.from('quote_comparisons').delete().eq('id', newComparison.id);
        return null;
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
        material_name: item.material_name || 'Material sin nombre',
        unit_id: item.unit_id,
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