import { supabase } from '@/integrations/supabase/client';
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
  contingencyCombosPC: 0,
  contingencyCombosMA: 0,
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
          contingencyCombosPC:
            parsed.contingencyCombosPC ?? DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosPC,
          contingencyCombosMA:
            parsed.contingencyCombosMA ?? DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosMA,
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
      contingencyCombosPC: DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosPC,
      contingencyCombosMA: DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosMA,
    };
  },

  saveOperationalParameters: (params: DotacionOperationalParameters): void => {
    try {
      localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(params));
    } catch (e) {
      console.error('[dotacionConfigService.saveOperationalParameters] Error writing localStorage:', e);
    }
  },

  // --- SINCRONIZACIÓN SUPABASE (PERSISTENCIA REMOTA EN LA NUBE) ---
  fetchRemoteOperationalParameters: async (): Promise<DotacionOperationalParameters | null> => {
    try {
      const { data, error, status } = await supabase
        .from('dotacion_operational_config')
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle();

      if (error || status === 404 || !data) {
        return null;
      }

      const remoteParams: DotacionOperationalParameters = {
        comedor: { ...DEFAULT_OPERATIONAL_PARAMETERS.comedor, ...(data.comedor_data || {}) },
        finca: { ...DEFAULT_OPERATIONAL_PARAMETERS.finca, ...(data.finca_data || {}) },
        papelUsoDiarioBultos: data.papel_uso_diario_bultos ?? DEFAULT_OPERATIONAL_PARAMETERS.papelUsoDiarioBultos,
        azucarUsoBultosMap: {
          ...DEFAULT_OPERATIONAL_PARAMETERS.azucarUsoBultosMap,
          ...(data.azucar_uso_bultos_map || {}),
        },
        presentations: {
          ...DEFAULT_OPERATIONAL_PARAMETERS.presentations,
          ...(data.presentations_data || {}),
        },
        surplusTolerancePercent: data.surplus_tolerance_percent ?? DEFAULT_OPERATIONAL_PARAMETERS.surplusTolerancePercent,
        arrozMaxSurplusKg: data.arroz_max_surplus_kg ?? DEFAULT_OPERATIONAL_PARAMETERS.arrozMaxSurplusKg,
        globalPurchaseMode: data.global_purchase_mode ?? DEFAULT_OPERATIONAL_PARAMETERS.globalPurchaseMode,
        contingencyCombosPC: data.contingency_combos_pc ?? DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosPC,
        contingencyCombosMA: data.contingency_combos_ma ?? DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosMA,
      };

      // Actualizar caché local
      localStorage.setItem(PARAMS_STORAGE_KEY, JSON.stringify(remoteParams));
      return remoteParams;
    } catch {
      return null;
    }
  },

  saveRemoteOperationalParameters: async (params: DotacionOperationalParameters, userEmail?: string | null): Promise<boolean> => {
    // 1. Guardar siempre en local primero para respuesta instantánea
    dotacionConfigService.saveOperationalParameters(params);

    // 2. Intentar guardar en Supabase para sincronizar con todos los usuarios
    try {
      const { error } = await supabase
        .from('dotacion_operational_config')
        .upsert({
          id: 'global_config',
          comedor_data: params.comedor,
          finca_data: params.finca,
          papel_uso_diario_bultos: params.papelUsoDiarioBultos,
          azucar_uso_bultos_map: params.azucarUsoBultosMap,
          presentations_data: params.presentations,
          surplus_tolerance_percent: params.surplusTolerancePercent,
          arroz_max_surplus_kg: params.arrozMaxSurplusKg,
          global_purchase_mode: params.globalPurchaseMode || 'mixto',
          contingency_combos_pc: params.contingencyCombosPC ?? 0,
          contingency_combos_ma: params.contingencyCombosMA ?? 0,
          updated_at: new Date().toISOString(),
          updated_by: userEmail || 'Sistema',
        }, { onConflict: 'id' });

      return !error;
    } catch {
      return false;
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
      contingencyCombosPC: DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosPC,
      contingencyCombosMA: DEFAULT_OPERATIONAL_PARAMETERS.contingencyCombosMA,
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
