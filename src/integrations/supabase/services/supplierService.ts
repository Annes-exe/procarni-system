// src/integrations/supabase/services/supplierService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { Supplier, SupplierMaterialPayload } from '../types';
import { logAudit } from './auditLogService';
import { bulkArchiveQuoteRequestsBySupplier } from './quoteRequestService'; // Import bulk archive QR
import { purchaseOrderService } from '@/services/purchaseOrderService'; // Import new service

const SupplierService = {
  getAll: async (): Promise<Supplier[]> => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[SupplierService.getAll] Error:', error);
      showError('Error al cargar proveedores.');
      return [];
    }
    return data;
  },

  create: async (
    supplierData: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>,
    materials: SupplierMaterialPayload[],
  ): Promise<Supplier | null> => {
    const payload = {
      ...supplierData,
      name: supplierData.name.toUpperCase(), // Convert name to uppercase
    };

    const { data: newSupplier, error: supplierError } = await supabase
      .from('suppliers')
      .insert(payload)
      .select()
      .single();

    if (supplierError) {
      console.error('[SupplierService.create] Error:', supplierError);
      showError('Error al crear el proveedor.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_SUPPLIER', {
      table: 'suppliers',
      record_id: newSupplier.id,
      description: `Creación de proveedor ${newSupplier.name} (${newSupplier.code})`,
      name: newSupplier.name,
      rif: newSupplier.rif,
      materials_count: materials.length
    });
    // -----------------

    if (materials && materials.length > 0) {
      const supplierMaterials = materials.map(mat => ({
        supplier_id: newSupplier.id,
        material_id: mat.material_id,
        specification: mat.specification,
        user_id: newSupplier.user_id,
      }));

      const { error: materialsError } = await supabase
        .from('supplier_materials')
        .insert(supplierMaterials);

      if (materialsError) {
        console.error('[SupplierService.create] Error al crear materiales:', materialsError);
        showError('Error al asociar materiales al proveedor.');
        return null;
      }
    }

    return newSupplier;
  },

  update: async (
    id: string,
    updates: Partial<Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'materials'>>,
    materials: SupplierMaterialPayload[],
  ): Promise<Supplier | null> => {
    const payload = { ...updates };
    if (payload.name) {
      payload.name = payload.name.toUpperCase(); // Convert name to uppercase
    }

    const { data: updatedSupplier, error: supplierError } = await supabase
      .from('suppliers')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (supplierError) {
      console.error('[SupplierService.update] Error:', supplierError);
      showError('Error al actualizar el proveedor.');
      return null;
    }

    // --- CONDITIONAL ARCHIVE LOGIC ---
    if (updates.status === 'Inactive') {
      const archivedQRs = await bulkArchiveQuoteRequestsBySupplier(id);
      const archivedPOs = await purchaseOrderService.bulkArchiveBySupplier(id);

      if (archivedQRs > 0) {
        logAudit('BULK_ARCHIVE_QUOTE_REQUESTS', {
          table: 'quote_requests',
          description: `Archivado masivo de ${archivedQRs} SCs por inactividad de proveedor`,
          supplier_id: id,
          count: archivedQRs
        });
      }
      if (archivedPOs > 0) {
        logAudit('BULK_ARCHIVE_PURCHASE_ORDERS', {
          table: 'purchase_orders',
          description: `Archivado masivo de ${archivedPOs} OCs por inactividad de proveedor`,
          supplier_id: id,
          count: archivedPOs
        });
      }

      if (archivedQRs > 0 || archivedPOs > 0) {
        console.log(`[SupplierService.update] Archived ${archivedQRs} QRs and ${archivedPOs} POs for inactive supplier ${id}.`);
        showError(`Advertencia: Se archivaron ${archivedQRs} Solicitudes de Cotización y ${archivedPOs} Órdenes de Compra activas para este proveedor.`);
      }
    }
    // ---------------------------------

    // --- AUDIT LOG ---
    logAudit('UPDATE_SUPPLIER', {
      table: 'suppliers',
      record_id: id,
      description: 'Actualización de proveedor',
      updates: updates,
      materials_count: materials.length
    });
    // -----------------

    // Obtener las relaciones de materiales existentes
    const { data: existingSupplierMaterials, error: fetchError } = await supabase
      .from('supplier_materials')
      .select('id, material_id, specification')
      .eq('supplier_id', id);

    if (fetchError) {
      console.error('[SupplierService.update] Error al obtener materiales existentes:', fetchError);
      showError('Error al actualizar los materiales del proveedor.');
      return null;
    }

    const existingMaterialMap = new Map(existingSupplierMaterials.map(sm => [sm.material_id, sm]));
    const newMaterialIds = new Set(materials.map(mat => mat.material_id));

    // Materiales a eliminar (existentes que ya no están en la lista nueva)
    const materialsToDelete = existingSupplierMaterials.filter(sm => !newMaterialIds.has(sm.material_id));
    if (materialsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('supplier_materials')
        .delete()
        .in('id', materialsToDelete.map(sm => sm.id));

      if (deleteError) {
        console.error('[SupplierService.update] Error al eliminar materiales antiguos:', deleteError);
        showError('Error al eliminar materiales antiguos del proveedor.');
        return null;
      }
    }

    // Materiales a insertar/actualizar
    for (const mat of materials) {
      const existingSm = existingMaterialMap.get(mat.material_id);

      if (!existingSm) {
        // Insertar nuevo material
        const { error: insertError } = await supabase
          .from('supplier_materials')
          .insert({
            supplier_id: id,
            material_id: mat.material_id,
            specification: mat.specification,
            user_id: updatedSupplier.user_id,
          });

        if (insertError) {
          console.error('[SupplierService.update] Error al insertar nuevo material:', insertError);
          showError('Error al insertar nuevos materiales para el proveedor.');
          return null;
        }
      } else if (existingSm.specification !== mat.specification) {
        // Actualizar especificación de material existente solo si cambió
        const { error: updateMaterialError } = await supabase
          .from('supplier_materials')
          .update({ specification: mat.specification })
          .eq('id', existingSm.id);

        if (updateMaterialError) {
          console.error('[SupplierService.update] Error al actualizar especificación:', updateMaterialError);
          showError('Error al actualizar la especificación del material del proveedor.');
          return null;
        }
      }
    }

    return updatedSupplier;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[SupplierService.delete] Error:', error);
      showError('Error al eliminar el proveedor.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_SUPPLIER', {
      table: 'suppliers',
      record_id: id,
      description: 'Eliminación de proveedor'
    });
    // -----------------

    return true;
  },

  search: async (query: string): Promise<Supplier[]> => {
    // Si la consulta está vacía, devuelve todos los proveedores como sugerencias
    if (!query.trim()) {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true }); // Removed limit(10)

      if (error) {
        console.error('[SupplierService.search] Error fetching default suppliers:', error);
        return [];
      }
      return data;
    }

    // Sanitizar query: reemplazar comas y puntos con espacios para evitar romper la sintaxis OR de PostgREST
    const sanitizedQuery = query.replace(/[,.]/g, ' ');

    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .or(`name.ilike.%${sanitizedQuery}%,rif.ilike.%${sanitizedQuery}%`)
      .limit(10);

    if (error) {
      console.error('[SupplierService.search] Error:', error);
      return [];
    }
    return data;
  },

  getById: async (id: string): Promise<Supplier | null> => {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*, materials:supplier_materials(material_id, specification, materials:materials(id, name, code, category, unit))')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[SupplierService.getById] Error:', error);
      return null;
    }
    return data;
  },
};

export const {
  getAll: getAllSuppliers,
  create: createSupplier,
  update: updateSupplier,
  delete: deleteSupplier,
  search: searchSuppliers,
  getById: getSupplierDetails,
} = SupplierService;