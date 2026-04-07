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
        .order('name', { ascending: true }); // Removed limit(10)

      if (error) {
        console.error('[MaterialService.search] Error fetching default materials:', error);
        return [];
      }
      return data;
    }

    // Usamos el cliente para buscar por nombre o código.
    // Para buscar dentro del array de aliases con coincidencia parcial, lo ideal sería un RPC,
    // pero temporalmente podemos traer más resultados y filtrar en cliente si es necesario,
    // o hacer match exacto de alias.
    const { data, error } = await supabase
      .from('materials')
      .select('*')
      .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
      .limit(20);

    if (error) {
      console.error('[MaterialService.search] Error:', error);
      return [];
    }

    // Traer adicionalmente coincidencia exacta de aliases
    const { data: aliasData } = await supabase
      .from('materials')
      .select('*')
      .contains('search_aliases', [query.toUpperCase()])
      .limit(5);

    // Merge and deduplicate
    const combined = [...(data || []), ...(aliasData || [])];
    const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

    return unique.slice(0, 10);
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
};

export const {
  getAll: getAllMaterials,
  create: createMaterial,
  update: updateMaterial,
  delete: deleteMaterial,
  search: searchMaterials,
  mergeMaterials,
} = MaterialService;