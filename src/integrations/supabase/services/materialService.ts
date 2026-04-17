// src/integrations/supabase/services/materialService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { Material } from '../types';
import { logAudit } from './auditLogService';

const MaterialService = {
  getAll: async (): Promise<Material[]> => {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[MaterialService.getAll] Error:', error);
      showError('Error al cargar materiales.');
      return [];
    }
    return data;
  },

  create: async (materialData: Omit<Material, 'id' | 'created_at' | 'updated_at'>): Promise<Material | null> => {
    const payload = {
      ...materialData,
      name: materialData.name.toUpperCase(), // Convert name to uppercase
    };

    const { data: newMaterial, error } = await supabase
      .from('materials')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[MaterialService.create] Error:', error);
      showError('Error al crear el material.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_MATERIAL', { 
      table: 'materials',
      record_id: newMaterial.id, 
      description: `Creación de material ${newMaterial.name} (${newMaterial.code})`,
      name: newMaterial.name, 
      code: newMaterial.code 
    });
    // -----------------
    
    return newMaterial;
  },

  update: async (id: string, updates: Partial<Omit<Material, 'id' | 'created_at' | 'updated_at'>>): Promise<Material | null> => {
    const payload = { ...updates };
    if (payload.name) {
      payload.name = payload.name.toUpperCase(); // Convert name to uppercase
    }

    const { data: updatedMaterial, error } = await supabase
      .from('materials')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[MaterialService.update] Error:', error);
      showError('Error al actualizar el material.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_MATERIAL', { 
      table: 'materials',
      record_id: id, 
      description: 'Actualización de material',
      updates: updates 
    });
    // -----------------
    
    return updatedMaterial;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('materials')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[MaterialService.delete] Error:', error);
      showError('Error al eliminar el material.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_MATERIAL', { 
      table: 'materials',
      record_id: id,
      description: 'Eliminación de material'
    });
    // -----------------
    
    return true;
  },

  search: async (query: string): Promise<Material[]> => {
    // Si la consulta está vacía, devuelve todos los materiales como sugerencias
    if (!query.trim()) {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('[MaterialService.search] Error fetching default materials:', error);
        return [];
      }
      return data;
    }

    const searchPattern = `%${query}%`;

    // First search by name and code
    const { data: directMatches, error } = await supabase
      .from('materials')
      .select('*')
      .or(`name.ilike.${searchPattern},code.ilike.${searchPattern}`)
      .order('name', { ascending: true });

    if (error) {
      console.error('[MaterialService.search] Error:', error);
      return [];
    }

    // Also search by alias to find materials with alternative names
    const { data: aliasMatches } = await supabase
      .from('material_aliases')
      .select('material_id')
      .ilike('alias', searchPattern);

    if (aliasMatches && aliasMatches.length > 0) {
      const aliasedMaterialIds = aliasMatches.map(a => a.material_id);
      const directIds = new Set((directMatches || []).map(m => m.id));
      const newIds = aliasedMaterialIds.filter(id => !directIds.has(id));

      if (newIds.length > 0) {
        const { data: aliasedMaterials } = await supabase
          .from('materials')
          .select('*')
          .in('id', newIds)
          .order('name', { ascending: true });

        return [...(directMatches || []), ...(aliasedMaterials || [])];
      }
    }

    return directMatches || [];
  },


  getByName: async (name: string): Promise<Material | null> => {
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .eq('name', name.toUpperCase())
      .maybeSingle();

    if (error) {
      console.error('[MaterialService.getByName] Error:', error);
      return null;
    }
    return data;
  },

  getPaginated: async (
    page: number,
    pageSize: number,
    searchTerm: string = '',
    category: string = 'all'
  ) => {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('materials')
      .select('*', { count: 'exact' });

    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`name.ilike.${searchPattern},code.ilike.${searchPattern}`);
    }

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, count, error } = await query
      .range(from, to)
      .order('name', { ascending: true }); // Orden alfabético

    if (error) {
      console.error('[MaterialService.getPaginated] Error:', error);
      throw error;
    }
    
    return { data: data as Material[], totalCount: count || 0 };
  },
};

export const {
  getAll: getAllMaterials,
  create: createMaterial,
  update: updateMaterial,
  delete: deleteMaterial,
  search: searchMaterials,
  getByName: getMaterialByName,
  getPaginated: getPaginatedMaterials,
} = MaterialService;