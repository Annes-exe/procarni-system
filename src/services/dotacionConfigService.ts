import { DotacionMaterialMapping, DotacionProductId } from '@/types/dotacion';
import { Material } from '@/integrations/supabase/types';
import { UnitOfMeasure } from '@/integrations/supabase/services/unitService';

const normalizeText = (str: string): string =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const STORAGE_KEY = 'procarni_dotacion_material_mappings_v2';

export const DEFAULT_DOTACION_MAPPINGS: DotacionMaterialMapping[] = [
  {
    productId: 'harina',
    productLabel: 'Harina de Maíz',
    defaultBrand: 'Harina Pan Blanca',
    materialId: null,
    materialName: null,
    materialCode: null,
    unitId: null,
    unitName: 'Kg',
    isExempt: true,
    bultoUnitId: null,
    bultoUnitName: 'Bulto',
    customPoName: null,
  },
  {
    productId: 'arroz',
    productLabel: 'Arroz',
    defaultBrand: 'Arroz Primor Clásico',
    materialId: null,
    materialName: null,
    materialCode: null,
    unitId: null,
    unitName: 'Kg',
    isExempt: true,
    bultoUnitId: null,
    bultoUnitName: 'Bulto',
    customPoName: null,
  },
  {
    productId: 'azucar',
    productLabel: 'Azúcar',
    defaultBrand: 'Azúcar Konfit',
    materialId: null,
    materialName: null,
    materialCode: null,
    unitId: null,
    unitName: 'Kg',
    isExempt: true,
    bultoUnitId: null,
    bultoUnitName: 'Bulto',
    customPoName: null,
  },
  {
    productId: 'papel',
    productLabel: 'Papel Higiénico',
    defaultBrand: 'Papel Higiénico Caricia Individual',
    materialId: null,
    materialName: null,
    materialCode: null,
    unitId: null,
    unitName: 'Rollo',
    isExempt: false,
    bultoUnitId: null,
    bultoUnitName: 'Bulto',
    customPoName: null,
  },
  {
    productId: 'jabon',
    productLabel: 'Jabón de Panela',
    defaultBrand: 'Jabón Azul Las Llaves',
    materialId: null,
    materialName: null,
    materialCode: null,
    unitId: null,
    unitName: 'Barra',
    isExempt: false,
    bultoUnitId: null,
    bultoUnitName: 'Bulto',
    customPoName: null,
  },
];

export const dotacionConfigService = {
  getMappings: (): DotacionMaterialMapping[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as DotacionMaterialMapping[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge with defaults in case new items were added
          return DEFAULT_DOTACION_MAPPINGS.map((def) => {
            const found = parsed.find((p) => p.productId === def.productId);
            return found ? { ...def, ...found } : def;
          });
        }
      }
    } catch (e) {
      console.error('[dotacionConfigService.getMappings] Error reading localStorage:', e);
    }
    return [...DEFAULT_DOTACION_MAPPINGS];
  },

  saveMappings: (mappings: DotacionMaterialMapping[]): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
    } catch (e) {
      console.error('[dotacionConfigService.saveMappings] Error writing localStorage:', e);
    }
  },

  getMappingForProduct: (productId: DotacionProductId): DotacionMaterialMapping => {
    const all = dotacionConfigService.getMappings();
    return all.find((m) => m.productId === productId) || {
      ...DEFAULT_DOTACION_MAPPINGS.find((d) => d.productId === productId)!,
    };
  },

  /**
   * Intenta encontrar coincidencias inteligentes en la lista de materiales y unidades de la base de datos
   */
  autoMatchMaterials: (
    materials: Material[],
    units: UnitOfMeasure[],
    currentMappings?: DotacionMaterialMapping[]
  ): DotacionMaterialMapping[] => {
    const base = currentMappings ? [...currentMappings] : dotacionConfigService.getMappings();

    // Buscar la unidad "Bulto" o similar
    const bultoUnit = units.find((u) => {
      const n = u.name.trim().toLowerCase();
      return n === 'bulto' || n === 'bto' || n === 'bultos';
    });

    const searchPatterns: Record<DotacionProductId, string[][]> = {
      harina: [['harina', 'pan'], ['harina'], ['pan blanca']],
      arroz: [['arroz', 'primor'], ['arroz']],
      azucar: [['azucar', 'konfit'], ['azúcar', 'konfit'], ['azucar'], ['azúcar']],
      papel: [['papel', 'caricia'], ['papel', 'higienico'], ['papel', 'higiénico'], ['papel']],
      jabon: [['jabon', 'llaves'], ['jabón', 'llaves'], ['jabon', 'azul'], ['jabón', 'azul'], ['jabon'], ['jabón']],
    };

    return base.map((mapping) => {
      // Si ya tiene un material asignado válido, conservarlo
      if (mapping.materialId) {
        const stillExists = materials.find((m) => m.id === mapping.materialId);
        if (stillExists) {
          return {
            ...mapping,
            materialName: stillExists.name,
            materialCode: stillExists.code,
            unitId: stillExists.unit_id || mapping.unitId,
            unitName: stillExists.unit || mapping.unitName,
            isExempt: stillExists.is_exempt ?? mapping.isExempt,
            bultoUnitId: bultoUnit ? bultoUnit.id : mapping.bultoUnitId,
            bultoUnitName: bultoUnit ? bultoUnit.name : mapping.bultoUnitName,
          };
        }
      }

      // Buscar candidato por patrones
      const patterns = searchPatterns[mapping.productId] || [];
      let matchedMaterial: Material | undefined;

      for (const group of patterns) {
        matchedMaterial = materials.find((m) => {
          const matName = normalizeText(m.name);
          return group.every((word) => matName.includes(normalizeText(word)));
        });
        if (matchedMaterial) break;
      }

      if (matchedMaterial) {
        return {
          ...mapping,
          materialId: matchedMaterial.id,
          materialName: matchedMaterial.name,
          materialCode: matchedMaterial.code,
          unitId: matchedMaterial.unit_id || null,
          unitName: matchedMaterial.unit || mapping.unitName,
          isExempt: matchedMaterial.is_exempt ?? mapping.isExempt,
          bultoUnitId: bultoUnit ? bultoUnit.id : mapping.bultoUnitId,
          bultoUnitName: bultoUnit ? bultoUnit.name : mapping.bultoUnitName,
        };
      }

      return {
        ...mapping,
        bultoUnitId: bultoUnit ? bultoUnit.id : mapping.bultoUnitId,
        bultoUnitName: bultoUnit ? bultoUnit.name : mapping.bultoUnitName,
      };
    });
  },
};
