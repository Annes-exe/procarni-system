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
      .order('created_at', { ascending: true })
      .limit(10000); // Override PostgREST's default 1000-row cap

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
        .order('name', { ascending: true })
        .limit(10000);

      if (error) {
        console.error('[MaterialService.search] Error fetching default materials:', error);
        return [];
      }
      return data;
    }

    // Usamos el RPC custom que maneja tanto name, code como coincidencias parciales dentro del array search_aliases
    const { data, error } = await supabase.rpc('search_materials_by_substring', { search_query: query });

    if (error) {
      console.error('[MaterialService.search] Error calling search RPC:', error);
      return [];
    }

    return (data as Material[]) || [];
  },

  searchWithCategories: async (query: string): Promise<any[]> => {
    const cleanQuery = query.replace(/^Categoría:\s*/i, '').trim();
    if (!cleanQuery) {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .order('name', { ascending: true })
        .limit(10000);

      if (error) {
        console.error('[MaterialService.searchWithCategories] Error fetching default materials:', error);
        return [];
      }
      return data;
    }

    // 1. Fetch matching categories
    const { data: categories, error: catError } = await supabase
      .from('material_categories')
      .select('id, name')
      .ilike('name', `%${cleanQuery}%`)
      .limit(5);

    const categoryResults = (categories || []).map(cat => ({
      id: `category:${cat.name}`,
      name: `Categoría: ${cat.name}`,
      code: 'Categoría de Materiales',
      category: cat.name,
      isCategory: true
    }));

    // 2. Fetch matching materials using RPC
    const { data, error } = await supabase.rpc('search_materials_by_substring', { search_query: cleanQuery });

    if (error) {
      console.error('[MaterialService.searchWithCategories] Error calling search RPC:', error);
      return categoryResults;
    }

    const materialResults = (data as Material[]) || [];
    return [...categoryResults, ...materialResults];
  },

  mergeMaterials: async (targetId: string, sourceIds: string[]): Promise<boolean> => {
    const { error } = await supabase.rpc('merge_materials_with_alias', {
      p_target_material_id: targetId,
      p_source_material_ids: sourceIds,
    });

    if (error) {
      console.error('[MaterialService.mergeMaterials] Error:', error);
      showError('Error al fusionar materiales.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('MERGE_MATERIALS', {
      table: 'materials',
      record_id: targetId,
      description: `Fusión de ${sourceIds.length} materiales hacia el principal`,
      source_ids: sourceIds
    });
    // -----------------
    
    return true;
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

  getRecentMaterials: async (): Promise<Material[]> => {
    try {
      // 1. Obtener los últimos 15 materiales creados
      const { data: createdData, error: createdError } = await supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15);

      if (createdError) throw createdError;

      // 2. Obtener los últimos materiales usados en órdenes de compra (items)
      const { data: usedPOData, error: usedPOError } = await supabase
        .from('purchase_order_items')
        .select('material_id')
        .order('created_at', { ascending: false })
        .limit(40);

      // 3. Obtener los últimos materiales usados en órdenes de servicio
      const { data: usedSOData, error: usedSOError } = await supabase
        .from('service_order_materials')
        .select('material_id')
        .order('created_at', { ascending: false })
        .limit(40);

      const usedIds = new Set<string>();
      if (!usedPOError && usedPOData) {
        usedPOData.forEach(item => {
          if (item.material_id) usedIds.add(item.material_id);
        });
      }
      if (!usedSOError && usedSOData) {
        usedSOData.forEach(item => {
          if (item.material_id) usedIds.add(item.material_id);
        });
      }

      let usedMaterials: Material[] = [];
      if (usedIds.size > 0) {
        const { data: fetchedUsed, error: fetchUsedError } = await supabase
          .from('materials')
          .select('*')
          .in('id', Array.from(usedIds).slice(0, 15));

        if (!fetchUsedError && fetchedUsed) {
          usedMaterials = fetchedUsed;
        }
      }

      // Combinar: primero los usados recientemente, luego los creados recientemente
      const merged = [...usedMaterials, ...(createdData || [])];
      
      // De-duplicar por id
      const seen = new Set<string>();
      const result: Material[] = [];
      for (const item of merged) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          result.push(item);
        }
      }

      return result.slice(0, 12);
    } catch (e) {
      console.error('[MaterialService.getRecentMaterials] Error:', e);
      // Fallback a los creados recientemente
      const { data } = await supabase
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      return data || [];
    }
  },
};

export const {
  getAll: getAllMaterials,
  create: createMaterial,
  update: updateMaterial,
  delete: deleteMaterial,
  search: searchMaterials,
  searchWithCategories: searchMaterialsAndCategories,
  mergeMaterials,
  getByName: getMaterialByName,
  getPaginated: getPaginatedMaterials,
  getRecentMaterials,
} = MaterialService;