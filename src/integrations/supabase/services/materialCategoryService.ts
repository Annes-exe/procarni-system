import { logAudit } from './auditLogService';
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

/**
 * Fetches materials belonging to a specific category.
 */
export const getMaterialsByCategory = async (categoryName: string) => {
  try {
    const { data, error } = await supabase
      .from('materials')
      .select('id, name, code, unit, category')
      .eq('category', categoryName)
      .order('name', { ascending: true });

    if (error) {
      console.error('[getMaterialsByCategory] Error:', error);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[getMaterialsByCategory] Unexpected error:', err);
    return [];
  }
};

export interface MigrateCategoryMaterialsParams {
  sourceCategory: string;
  targetCategory: string;
  materialIds?: string[];
  userId?: string;
  userName?: string;
}

/**
 * Migrates materials from one category to another (bulk or selected).
 * Adapts units when target category has strict unit rules (SECA, FRESCA, EMPAQUE).
 * Logs the action into audit_logs.
 */
export const migrateCategoryMaterials = async ({
  sourceCategory,
  targetCategory,
  materialIds,
  userId,
  userName,
}: MigrateCategoryMaterialsParams): Promise<{ success: boolean; count: number; error?: string }> => {
  try {
    const trimmedSource = sourceCategory.trim();
    const trimmedTarget = targetCategory.trim().toUpperCase();

    if (!trimmedSource || !trimmedTarget) {
      showError('Debes especificar la categoría de origen y de destino.');
      return { success: false, count: 0, error: 'Categorías requeridas' };
    }

    if (trimmedSource.toUpperCase() === trimmedTarget.toUpperCase()) {
      showError('La categoría origen y destino no pueden ser iguales.');
      return { success: false, count: 0, error: 'Categorías iguales' };
    }

    // 1. Ensure target category exists in material_categories; create if not
    const { data: existingCat } = await supabase
      .from('material_categories')
      .select('id, name')
      .ilike('name', trimmedTarget)
      .maybeSingle();

    if (!existingCat) {
      const { error: createCatError } = await supabase
        .from('material_categories')
        .insert([{ name: trimmedTarget, user_id: userId || null }]);
      if (createCatError && createCatError.code !== '23505') {
        console.warn('Could not auto-create target category:', createCatError);
      }
    }

    // 2. Fetch the materials to migrate
    let fetchQuery = supabase
      .from('materials')
      .select('id, name, code, unit, category');

    if (materialIds && materialIds.length > 0) {
      fetchQuery = fetchQuery.in('id', materialIds);
    } else {
      fetchQuery = fetchQuery.eq('category', trimmedSource);
    }

    const { data: materialsToMigrate, error: fetchErr } = await fetchQuery;
    if (fetchErr) {
      console.error('[migrateCategoryMaterials] Fetch error:', fetchErr);
      showError('Error al consultar los materiales a migrar.');
      return { success: false, count: 0, error: fetchErr.message };
    }

    if (!materialsToMigrate || materialsToMigrate.length === 0) {
      showError(`No se encontraron materiales para migrar desde "${trimmedSource}".`);
      return { success: false, count: 0, error: 'Sin materiales' };
    }

    // 3. Prepare updates, handling unit adaptations for strict categories (SECA, FRESCA, EMPAQUE)
    const targetUpper = trimmedTarget.toUpperCase();
    const idsToUpdate = materialsToMigrate.map(m => m.id);

    let adaptedCount = 0;
    for (const mat of materialsToMigrate) {
      const currentUnitUpper = (mat.unit || '').toUpperCase();
      let newUnit = mat.unit;

      if (targetUpper === 'SECA' && !['KG', 'LT', 'GR'].includes(currentUnitUpper)) {
        newUnit = 'KG';
      } else if (targetUpper === 'FRESCA' && currentUnitUpper !== 'KG') {
        newUnit = 'KG';
      } else if (targetUpper === 'EMPAQUE' && !['MT', 'UND'].includes(currentUnitUpper)) {
        const nameUpper = (mat.name || '').toUpperCase();
        newUnit = nameUpper.startsWith('TRIPA') ? 'MT' : 'UND';
      }

      const updatePayload: { category: string; unit?: string } = { category: trimmedTarget };
      if (newUnit !== mat.unit) {
        updatePayload.unit = newUnit;
        adaptedCount++;
      }

      const { error: updErr } = await supabase
        .from('materials')
        .update(updatePayload)
        .eq('id', mat.id);

      if (updErr) {
        console.error('[migrateCategoryMaterials] Update item error:', updErr);
      }
    }

    // 4. Audit Log
    await logAudit('CATEGORY_MIGRATION', {
      table: 'materials',
      description: `Migración Dev: ${materialsToMigrate.length} ítems de "${trimmedSource}" a "${trimmedTarget}" (unidades adaptadas: ${adaptedCount})`,
      source_category: trimmedSource,
      target_category: trimmedTarget,
      migrated_count: materialsToMigrate.length,
      adapted_units_count: adaptedCount,
      user_id: userId,
      user_name: userName || 'Dev',
      material_ids: idsToUpdate.slice(0, 50),
    });

    return {
      success: true,
      count: materialsToMigrate.length,
    };
  } catch (err: any) {
    console.error('[migrateCategoryMaterials] Unexpected error:', err);
    showError(err?.message || 'Error inesperado al migrar materiales.');
    return { success: false, count: 0, error: err?.message };
  }
};
