import { supabase } from '../client';
import { showError } from '@/utils/toast';

interface SupplierMaterialPayload {
  supplier_id: string;
  material_id: string;
  specification?: string;
  user_id: string;
}

const SupplierMaterialService = {
  create: async (payload: SupplierMaterialPayload): Promise<boolean> => {
    const { error } = await supabase
      .from('supplier_materials')
      .insert(payload);

    if (error) {
      console.error('[SupplierMaterialService.create] Error:', error);
      showError('Error al asociar el material con el proveedor.');
      return false;
    }
    return true;
  },
};

export const {
  create: createSupplierMaterialRelation,
} = SupplierMaterialService;