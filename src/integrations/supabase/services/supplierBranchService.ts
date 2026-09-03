// src/integrations/supabase/services/supplierBranchService.ts

import { supabase } from '../client';
import { showError, showSuccess } from '@/utils/toast';
import { SupplierBranch } from '../types';
import { logAudit } from './auditLogService';

const SupplierBranchService = {
  getBySupplierId: async (supplierId: string): Promise<SupplierBranch[]> => {
    try {
      const { data, error } = await supabase
        .from('supplier_branches')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[SupplierBranchService.getBySupplierId] Error:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('[SupplierBranchService.getBySupplierId] Unexpected error:', err);
      return [];
    }
  },

  create: async (
    branchData: Omit<SupplierBranch, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SupplierBranch | null> => {
    try {
      let finalUserId = branchData.user_id && String(branchData.user_id).trim() !== ''
        ? branchData.user_id
        : null;

      if (!finalUserId) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData.user?.id) {
          finalUserId = authData.user.id;
        }
      }

      const payload = {
        ...branchData,
        name: branchData.name.trim(),
        address: branchData.address?.trim() || null,
        state: branchData.state?.trim() || null,
        city: branchData.city?.trim() || null,
        phone: branchData.phone?.trim() || null,
        phone_2: branchData.phone_2?.trim() || null,
        email: branchData.email?.trim() || null,
        status: branchData.status || 'Active',
        user_id: finalUserId,
      };

      const { data, error } = await supabase
        .from('supplier_branches')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[SupplierBranchService.create] Error:', error);
        showError(`Error al crear la sede: ${error.message}`);
        return null;
      }

      logAudit('CREATE_SUPPLIER_BRANCH', {
        table: 'supplier_branches',
        record_id: data.id,
        supplier_id: data.supplier_id,
        description: `Creación de sede "${data.name}" para proveedor`,
        branch_name: data.name,
      });

      return data;
    } catch (err: any) {
      console.error('[SupplierBranchService.create] Unexpected error:', err);
      showError(`Error inesperado al crear la sede: ${err?.message || ''}`);
      return null;
    }
  },

  update: async (
    id: string,
    updates: Partial<Omit<SupplierBranch, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<SupplierBranch | null> => {
    try {
      const payload: any = { ...updates };
      if (payload.name) payload.name = payload.name.trim();
      if (payload.address !== undefined) payload.address = payload.address?.trim() || null;
      if (payload.state !== undefined) payload.state = payload.state?.trim() || null;
      if (payload.city !== undefined) payload.city = payload.city?.trim() || null;
      if (payload.phone !== undefined) payload.phone = payload.phone?.trim() || null;
      if (payload.phone_2 !== undefined) payload.phone_2 = payload.phone_2?.trim() || null;
      if (payload.email !== undefined) payload.email = payload.email?.trim() || null;

      const { data, error } = await supabase
        .from('supplier_branches')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[SupplierBranchService.update] Error:', error);
        showError(`Error al actualizar la sede: ${error.message}`);
        return null;
      }

      logAudit('UPDATE_SUPPLIER_BRANCH', {
        table: 'supplier_branches',
        record_id: id,
        supplier_id: data.supplier_id,
        description: `Actualización de sede "${data.name}"`,
        updates,
      });

      return data;
    } catch (err: any) {
      console.error('[SupplierBranchService.update] Unexpected error:', err);
      showError(`Error al actualizar la sede: ${err?.message || ''}`);
      return null;
    }
  },

  delete: async (id: string, supplierId?: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('supplier_branches')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[SupplierBranchService.delete] Error:', error);
        showError(`Error al eliminar la sede: ${error.message}`);
        return false;
      }

      logAudit('DELETE_SUPPLIER_BRANCH', {
        table: 'supplier_branches',
        record_id: id,
        supplier_id: supplierId,
        description: 'Eliminación de sede de proveedor',
      });

      return true;
    } catch (err: any) {
      console.error('[SupplierBranchService.delete] Unexpected error:', err);
      showError(`Error al eliminar la sede: ${err?.message || ''}`);
      return false;
    }
  },
};

export const {
  getBySupplierId: getSupplierBranches,
  create: createSupplierBranch,
  update: updateSupplierBranch,
  delete: deleteSupplierBranch,
} = SupplierBranchService;

export default SupplierBranchService;
