import {
  DotacionMaterialMapping,
  DotacionProductId,
  DotacionOperationalParameters,
} from '@/types/dotacion';
import { Material } from '@/integrations/supabase/types';
import { UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import {
  DEFAULT_COMEDOR,
  DEFAULT_FINCA,
  DEFAULT_PAPEL_USO_DIARIO_BULTOS,
  DEFAULT_PRESENTATIONS,
  DEFAULT_SURPLUS_TOLERANCE_PERCENT,
  DEFAULT_ARROZ_MAX_SURPLUS_KG,
  DEFAULT_GLOBAL_PURCHASE_MODE,
} from '@/utils/dotacionCalculator';

const normalizeText = (str: string): string =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const MAPPINGS_STORAGE_KEY = 'procarni_dotacion_material_mappings_v2';
const PARAMS_STORAGE_KEY = 'procarni_dotacion_operational_params_v1';

export const DEFAULT_OPERATIONAL_PARAMETERS: DotacionOperationalParameters = {
  comedor: { ...DEFAULT_COMEDOR },
  finca: { ...DEFAULT_FINCA },
  papelUsoDiarioBultos: DEFAULT_PAPEL_USO_DIARIO_BULTOS,
  azucarUsoBultosMap: {
    primera: 1.5,
    segunda: 1.5,
  },
  presentations: { ...DEFAULT_PRESENTATIONS },
  surplusTolerancePercent: DEFAULT_SURPLUS_TOLERANCE_PERCENT,
  arrozMaxSurplusKg: DEFAULT_ARROZ_MAX_SURPLUS_KG,
  globalPurchaseMode: DEFAULT_GLOBAL_PURCHASE_MODE,
};

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
  // --- PARÁMETROS OPERATIVOS BASE ---
  getOperationalParameters: (): DotacionOperationalParameters => {
    try {
      const stored = localStorage.getItem(PARAMS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<DotacionOperationalParameters>;
        return {
          comedor: { ...DEFAULT_OPERATIONAL_PARAMETERS.comedor, ...(parsed.comedor || {}) },
          finca: { ...DEFAULT_OPERATIONAL_PARAMETERS.finca, ...(parsed.finca || {}) },
          papelUsoDiarioBultos:
            parsed.papelUsoDiarioBultos ?? DEFAULT_OPERATIONAL_PARAMETERS.papelUsoDiarioBultos,
          azucarUsoBultosMap: {
            ...DEFAULT_OPERATIONAL_PARAMETERS.azucarUsoBultosMap,
            ...(parsed.azucarUsoBultosMap || {}),
          },
          presentations: {
            ...DEFAULT_OPERATIONAL_PARAMETERS.presentations,
            ...(parsed.presentations || {}),
          },
          surplusTolerancePercent:
            parsed.surplusTolerancePercent ?? DEFAULT_OPERATIONAL_PARAMETERS.surplusTolerancePercent,
          arrozMaxSurplusKg:
            parsed.arrozMaxSurplusKg ?? DEFAULT_OPERATIONAL_PARAMETERS.arrozMaxSurplusKg,
          globalPurchaseMode:
            parsed.globalPurchaseMode ?? DEFAULT_OPERATIONAL_PARAMETERS.globalPurchaseMode,
        };
      }
    } catch (e) {
      console.error('[dotacionConfigService.getOperationalParameters] Error reading localStorage:', e);
    }
    return {
      comedor: { ...DEFAULT_OPERATIONAL_PARAMETERS.comedor },
      finca: { ...DEFAULT_OPERATIONAL_PARAMETERS.finca },
      papelUsoDiarioBultos: DEFAULT_OPERATIONAL_PARAMETERS.papelUsoDiarioBultos,
      azucarUsoBultosMap: { ...DEFAULT_OPERATIONAL_PARAMETERS.azucarUsoBultosMap },
      presentations: { ...DEFAULT_OPERATIONAL_PARAMETERS.presentations },
      surplusTolerancePercent: DEFAULT_OPERATIONAL_PARAMETERS.surplusTolerancePercent,
      arrozMaxSurplusKg: DEFAULT_OPERATIONAL_PARAMETERS.arrozMaxSurplusKg,
      globalPurchaseMode: DEFAULT_OPERATIONAL_PARAMETERS.globalPurchaseMode,
    };
  },

  saveOperationalParameters: (params: DotacionOperationalParameters): void => {
    try {
      localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(params));
    } catch (e) {
      console.error('[dotacionConfigService.saveOperationalParameters] Error writing localStorage:', e);
    }
  },

  resetOperationalParameters: (): DotacionOperationalParameters => {
    try {
      localStorage.removeItem(PARAMS_STORAGE_KEY);
    } catch (e) {
      console.error('[dotacionConfigService.resetOperationalParameters] Error:', e);
    }
    return {
      comedor: { ...DEFAULT_OPERATIONAL_PARAMETERS.comedor },
      finca: { ...DEFAULT_OPERATIONAL_PARAMETERS.finca },
      papelUsoDiarioBultos: DEFAULT_OPERATIONAL_PARAMETERS.papelUsoDiarioBultos,
      azucarUsoBultosMap: { ...DEFAULT_OPERATIONAL_PARAMETERS.azucarUsoBultosMap },
      presentations: { ...DEFAULT_OPERATIONAL_PARAMETERS.presentations },
      surplusTolerancePercent: DEFAULT_OPERATIONAL_PARAMETERS.surplusTolerancePercent,
      arrozMaxSurplusKg: DEFAULT_OPERATIONAL_PARAMETERS.arrozMaxSurplusKg,
      globalPurchaseMode: DEFAULT_OPERATIONAL_PARAMETERS.globalPurchaseMode,
    };
  },

  // --- VINCULACIÓN DE MATERIALES ---
  getMappings: (): DotacionMaterialMapping[] => {
    try {
      const stored = localStorage.getItem(MAPPINGS_STORAGE_KEY);
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
      localStorage.setItem(MAPPINGS_STORAGE_KEY, JSON.stringify(mappings));
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
