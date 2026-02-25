// src/integrations/supabase/services/unitService.ts

import { supabase } from '../client';
import { showError } from '@/utils/toast';

export interface UnitOfMeasure {
    id: string;
    name: string;
    user_id?: string | null;
    created_at?: string | null;
}

const UnitService = {
    getAll: async (): Promise<UnitOfMeasure[]> => {
        const { data, error } = await supabase
            .from('units_of_measure')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('[UnitService.getAll] Error:', error);
            showError('Error al cargar unidades de medida.');
            return [];
        }
        return data;
    },

    create: async (name: string, userId?: string): Promise<UnitOfMeasure | null> => {
        const payload = {
            name: name.toUpperCase(),
            user_id: userId,
        };

        const { data: newUnit, error } = await supabase
            .from('units_of_measure')
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error('[UnitService.create] Error:', error);
            if (error.code === '23505') {
                showError('La unidad de medida ya existe.');
            } else {
                showError('Error al crear la unidad de medida.');
            }
            return null;
        }

        return newUnit;
    },

    delete: async (id: string): Promise<boolean> => {
        const { error } = await supabase
            .from('units_of_measure')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[UnitService.delete] Error:', error);
            showError('Error al eliminar la unidad de medida.');
            return false;
        }

        return true;
    },
};

export const {
    getAll: getAllUnits,
    create: createUnit,
    delete: deleteUnit,
} = UnitService;
