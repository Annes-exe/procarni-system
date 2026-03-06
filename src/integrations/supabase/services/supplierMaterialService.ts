import { supabase } from '../client';
import { showError } from '@/utils/toast';

interface SupplierMaterialPayload {
  supplier_id: string;
  material_id: string;
  specification?: string;
  user_id: string;
}

const SupplierMaterialService = {
  create: async (payload: SupplierMaterialPayload): Promise<{ success: boolean; existed: boolean }> => {
    // 1. Check if relation already exists
    const { data: existingRelation, error: checkError } = await supabase
      .from('supplier_materials')
      .select('id')
      .eq('supplier_id', payload.supplier_id)
      .eq('material_id', payload.material_id)
      .maybeSingle();

    if (checkError) {
      console.error('[SupplierMaterialService.create] Error checking existence:', checkError);
      return { success: false, existed: false };
    }

    if (existingRelation) {
      // Relation already exists
      return { success: true, existed: true };
    }

    // 2. Insert if not exists
    const { error } = await supabase
      .from('supplier_materials')
      .insert(payload);

    if (error) {
      console.error('[SupplierMaterialService.create] Error:', error);
      showError('Error al asociar el material con el proveedor.');
      return { success: false, existed: false };
    }
    return { success: true, existed: false };
  },
};

export const {
  create: createSupplierMaterialRelation,
} = SupplierMaterialService;