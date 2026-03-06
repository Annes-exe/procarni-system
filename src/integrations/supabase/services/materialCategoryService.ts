import { supabase } from '../client';
import { MaterialCategory } from '../types';
import { showError } from '@/utils/toast';

/**
 * Fetches all material categories from the database.
 */
export const getAllMaterialCategories = async (): Promise<MaterialCategory[]> => {
    try {
        const { data, error } = await supabase
            .from('material_categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('[getAllMaterialCategories] Error:', error);
            showError('Error al cargar las categorías de materiales.');
            return [];
        }

        return data || [];
    } catch (err) {
        console.error('[getAllMaterialCategories] Unexpected error:', err);
        return [];
    }
};

/**
 * Creates a new material category.
 */
export const createMaterialCategory = async (name: string, userId: string): Promise<MaterialCategory | null> => {
    try {
        const { data, error } = await supabase
            .from('material_categories')
            .insert([{ name, user_id: userId }])
            .select()
            .single();

        if (error) {
            console.error('[createMaterialCategory] Error:', error);
            if (error.code === '23505') {
                showError('Esta categoría ya existe.');
            } else {
                showError('Error al crear la categoría.');
            }
            return null;
        }

        return data;
    } catch (err) {
        console.error('[createMaterialCategory] Unexpected error:', err);
        return null;
    }
};

/**
 * Deletes a material category.
 * Performs a check to ensure no materials are using the category before deleting.
 */
export const deleteMaterialCategory = async (id: string): Promise<boolean> => {
    try {
        // 1. Get the category name
        const { data: category, error: fetchError } = await supabase
            .from('material_categories')
            .select('name')
            .eq('id', id)
            .single();

        if (fetchError || !category) {
            console.error('[deleteMaterialCategory] Fetch error:', fetchError);
            showError('Error al encontrar la categoría.');
            return false;
        }

        // 2. Check if any material is using this category
        const { count, error: countError } = await supabase
            .from('materials')
            .select('*', { count: 'exact', head: true })
            .eq('category', category.name);

        if (countError) {
            console.error('[deleteMaterialCategory] Count error:', countError);
            showError('Error al verificar el uso de la categoría.');
            return false;
        }

        if (count && count > 0) {
            showError(`No se puede eliminar: hay ${count} materiales usando esta categoría.`);
            return false;
        }

        // 3. Delete the category
        const { error: deleteError } = await supabase
            .from('material_categories')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('[deleteMaterialCategory] Delete error:', deleteError);
            showError('Error al eliminar la categoría.');
            return false;
        }

        return true;
    } catch (err) {
        console.error('[deleteMaterialCategory] Unexpected error:', err);
        return false;
    }
};
