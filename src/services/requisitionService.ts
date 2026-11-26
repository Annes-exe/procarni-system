import { supabase } from '@/integrations/supabase/client';
import { Requisition } from '@/integrations/supabase/types';
import { showError } from '@/utils/toast';

export const requisitionService = {
  /**
   * Fetch all requisitions sorted by creation date
   */
  getAll: async (): Promise<Requisition[]> => {
    const { data, error } = await supabase
      .from('requisitions')
      .select('*, profiles(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[requisitionService.getAll] Error:', error);
      showError('Error al cargar la lista de requisiciones.');
      return [];
    }

    return data as unknown as Requisition[];
  },

  create: async (
    type: 'purchase' | 'service' | 'warehouse' | 'logbook' | 'solvent_red' | 'solvent_brown', 
    quantity: number = 1,
    metadata?: { lot_date?: string; lot_number?: string; responsible?: string }
  ): Promise<Requisition[] | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('No hay sesión activa para realizar esta acción.');
      return null;
    }

    const payload = Array.from({ length: quantity }, () => ({
      type,
      user_id: session.user.id,
      ...(metadata?.lot_date ? { lot_date: metadata.lot_date } : {}),
      ...(metadata?.lot_number ? { lot_number: metadata.lot_number } : {}),
      ...(metadata?.responsible ? { responsible: metadata.responsible } : {})
    }));

    let res = await supabase
      .from('requisitions')
      .insert(payload)
      .select('*, profiles(first_name, last_name)');

    // Fallback if optional metadata columns do not exist yet in DB schema
    if (res.error && (res.error.message?.includes('column') || res.error.code === '42703')) {
      const basicPayload = Array.from({ length: quantity }, () => ({
        type,
        user_id: session.user.id
      }));
      res = await supabase
        .from('requisitions')
        .insert(basicPayload)
        .select('*, profiles(first_name, last_name)');
    }

    if (res.error) {
      console.error('[requisitionService.create] Error:', res.error);
      showError(`Error al generar los formatos de requisición: ${res.error.message}`);
      return null;
    }

    // Sort by sequence_number ascending to match insertion order
    const sorted = [...(res.data || [])].sort((a, b) => a.sequence_number - b.sequence_number);
    return sorted as unknown as Requisition[];
  },

  /**
   * Fetch a requisition by its ID
   */
  getById: async (id: string): Promise<Requisition | null> => {
    const { data, error } = await supabase
      .from('requisitions')
      .select('*, profiles(first_name, last_name)')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[requisitionService.getById] Error:', error);
      return null;
    }

    return data as unknown as Requisition;
  }
};
