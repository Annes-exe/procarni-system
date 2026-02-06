// src/integrations/supabase/services/companyService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';
import { Company } from '../types';
import { logAudit } from './auditLogService';

const CompanyService = {
  getAll: async (): Promise<Company[]> => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CompanyService.getAll] Error:', error);
      showError('Error al cargar empresas.');
      return [];
    }
    return data;
  },

  create: async (companyData: Omit<Company, 'id' | 'created_at' | 'updated_at'>): Promise<Company | null> => {
    const { data: newCompany, error } = await supabase
      .from('companies')
      .insert(companyData)
      .select()
      .single();

    if (error) {
      console.error('[CompanyService.create] Error:', error);
      showError('Error al crear la empresa.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('CREATE_COMPANY', { 
      table: 'companies',
      record_id: newCompany.id, 
      description: `Creación de empresa ${newCompany.name}`,
      name: newCompany.name, 
      rif: newCompany.rif 
    });
    // -----------------
    
    return newCompany;
  },

  update: async (id: string, updates: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>): Promise<Company | null> => {
    const { data: updatedCompany, error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[CompanyService.update] Error:', error);
      showError('Error al actualizar la empresa.');
      return null;
    }

    // --- AUDIT LOG ---
    logAudit('UPDATE_COMPANY', { 
      table: 'companies',
      record_id: id, 
      description: 'Actualización de empresa',
      updates: updates 
    });
    // -----------------
    
    return updatedCompany;
  },

  delete: async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[CompanyService.delete] Error:', error);
      showError('Error al eliminar la empresa.');
      return false;
    }

    // --- AUDIT LOG ---
    logAudit('DELETE_COMPANY', { 
      table: 'companies',
      record_id: id,
      description: 'Eliminación de empresa'
    });
    // -----------------
    
    return true;
  },

  search: async (query: string): Promise<Company[]> => {
    // Si la consulta está vacía, devuelve todas las empresas como sugerencias
    if (!query.trim()) {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true }); // Removed limit(10)

      if (error) {
        console.error('[CompanyService.search] Error fetching default companies:', error);
        return [];
      }
      return data;
    }

    // Sanitize query: replace commas (which break PostgREST 'or' filter) with spaces
    const sanitizedQuery = query.replace(/,/g, ' ');

    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .or(`name.ilike.%${sanitizedQuery}%,rif.ilike.%${sanitizedQuery}%`)
      .limit(10);

    if (error) {
      console.error('[CompanyService.search] Error:', error);
      return [];
    }
    return data;
  },
};

export const {
  getAll: getAllCompanies,
  create: createCompany,
  update: updateCompany,
  delete: deleteCompany,
  search: searchCompanies,
} = CompanyService;