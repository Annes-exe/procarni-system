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

  create: async (type: 'purchase' | 'service' | 'warehouse', quantity: number = 1): Promise<Requisition[] | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showError('No hay sesión activa para realizar esta acción.');
      return null;
    }

    const payload = Array.from({ length: quantity }, () => ({
      type,
      user_id: session.user.id
    }));

    const { data, error } = await supabase
      .from('requisitions')
      .insert(payload)
      .select('*, profiles(first_name, last_name)');

    if (error) {
      console.error('[requisitionService.create] Error:', error);
      showError('Error al generar los formatos de requisición.');
      return null;
    }

    // Sort by sequence_number ascending to match insertion order
    const sorted = [...data].sort((a, b) => a.sequence_number - b.sequence_number);
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
