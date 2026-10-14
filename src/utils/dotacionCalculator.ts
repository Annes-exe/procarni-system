import {
  QuincenaTipo,
  ConsolidatedWarehouseStock,
  ComedorConfig,
  FincaConfig,
  ProductPresentationConfig,
  DotacionItemCalculation,
  CompanyDotacionCalculation,
  GlobalItemCalculation,
  DotacionCalculationResult,
  DotacionAdjustments,
} from '@/types/dotacion';

export const DEFAULT_PRESENTATIONS: ProductPresentationConfig = {
  arrozUnitsPerPackage: 24,
  harinaUnitsPerPackage: 20,
  azucarUnitsPerPackage: 20,
  papelUnitsPerPackage: 48,
  jabonUnitsPerPackage: 44,
};

export const DEFAULT_COMEDOR: ComedorConfig = {
  kgPerDay: 18,
  days: 15,
  splitPercentPC: 50,
  splitPercentMA: 50,
};

export const DEFAULT_FINCA: FincaConfig = {
  bultosHarina: 2,
  splitPercentPC: 50,
  splitPercentMA: 50,
};

// Default empty stock (all zeros waiting for user input)
export const EMPTY_CONSOLIDATED_STOCK: ConsolidatedWarehouseStock = {
  arroz: { bultos: 0, looseUnits: 0 },
  harina: { bultos: 0, looseUnits: 0 },
  azucar: { bultos: 0, looseUnits: 0 },
  papel: { bultos: 0, looseUnits: 0 },
  jabon: { bultos: 0, looseUnits: 0 },
};

// Example reference parameters (from sample document)
export const EXAMPLE_EMPLOYEES = { pc: 157, ma: 83 };
export const EXAMPLE_CONSOLIDATED_STOCK: ConsolidatedWarehouseStock = {
  arroz: { bultos: 2, looseUnits: 0 },
  harina: { bultos: 3, looseUnits: 0 },
  azucar: { bultos: 0, looseUnits: 5 },
  papel: { bultos: 2, looseUnits: 0 },
  jabon: { bultos: 0, looseUnits: 0 },
};
export const EXAMPLE_ADJUSTMENTS: DotacionAdjustments = {};

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const DEFAULT_PAPEL_USO_DIARIO_BULTOS = 1;
export const DEFAULT_AZUCAR_USO_MES_BULTOS = 1;

export interface CalculateDotacionParams {
  employeesPC: number;
  employeesMA: number;
  quincena: QuincenaTipo;
  month?: number; // 1 - 12
  year?: number;
  stock?: Partial<ConsolidatedWarehouseStock>;
  comedor?: Partial<ComedorConfig>;
  finca?: Partial<FincaConfig>;
  papelUsoDiarioBultos?: number;
  azucarUsoMesBultos?: number;
  presentations?: Partial<ProductPresentationConfig>;
  adjustments?: DotacionAdjustments;
}

export function calculateDotacion({
  employeesPC = 0,
  employeesMA = 0,
  quincena = 'primera',
  month = new Date().getMonth() + 1,
  year = new Date().getFullYear(),
  stock: customStock,
  comedor: customComedor,
  finca: customFinca,
  papelUsoDiarioBultos = DEFAULT_PAPEL_USO_DIARIO_BULTOS,
  azucarUsoMesBultos = DEFAULT_AZUCAR_USO_MES_BULTOS,
  presentations: customPresentations,
  adjustments = {},
}: CalculateDotacionParams): DotacionCalculationResult {
  const stock: ConsolidatedWarehouseStock = {
    arroz: { ...EMPTY_CONSOLIDATED_STOCK.arroz, ...customStock?.arroz },
    harina: { ...EMPTY_CONSOLIDATED_STOCK.harina, ...customStock?.harina },
    azucar: { ...EMPTY_CONSOLIDATED_STOCK.azucar, ...customStock?.azucar },
    papel: { ...EMPTY_CONSOLIDATED_STOCK.papel, ...customStock?.papel },
    jabon: { ...EMPTY_CONSOLIDATED_STOCK.jabon, ...customStock?.jabon },
  };

  const comedor: ComedorConfig = { ...DEFAULT_COMEDOR, ...customComedor };
  const finca: FincaConfig = { ...DEFAULT_FINCA, ...customFinca };
  const pres: ProductPresentationConfig = { ...DEFAULT_PRESENTATIONS, ...customPresentations };

  const isFirstFortnight = quincena === 'primera';
  const isSecondFortnight = quincena === 'segunda';
  const monthName = MONTH_NAMES[Math.max(0, Math.min(11, month - 1))];
  const periodLabel = `${monthName} ${year} - ${quincena === 'primera' ? '1.ª Quincena (Día 15)' : '2.ª Quincena (Día 30)'}`;

  const hasEmployees = employeesPC + employeesMA > 0;

  // --- 1. COMEDOR (Arroz) ---
  // 18 kg/día * 15 días = 270 kg. Reparto 50% PC (135 kg) y 50% MA (135 kg). Ambas quincenas.
  const comedorKgTotal = comedor.kgPerDay * comedor.days;
  const comedorUnitsPC = hasEmployees ? Math.round(comedorKgTotal * (comedor.splitPercentPC / 100)) : 0;
  const comedorUnitsMA = hasEmployees ? comedorKgTotal - comedorUnitsPC : 0;
  const comedorBultosPC = Math.ceil(comedorUnitsPC / pres.arrozUnitsPerPackage);
  const comedorBultosMA = Math.ceil(comedorUnitsMA / pres.arrozUnitsPerPackage);

  // --- 2. FINCA (Harina Pan) ---
  // Reserva de almacén para la Finca. Reparto 50% PC y 50% MA (ej. 1 bulto PC y 1 bulto MA).
  // REGLA: Aplica CADA QUINCENA (1.ª y 2.ª quincena).
  const fincaBultosTotal = hasEmployees ? finca.bultosHarina : 0;
  const fincaBultosPC = Math.round(fincaBultosTotal * (finca.splitPercentPC / 100));
  const fincaBultosMA = fincaBultosTotal - fincaBultosPC;
  const fincaUnitsPC = fincaBultosPC * pres.harinaUnitsPerPackage;
  const fincaUnitsMA = fincaBultosMA * pres.harinaUnitsPerPackage;

  // Determinar qué empresa tiene menor cantidad de colaboradores/combos
  // REGLA: No hay insumos exclusivos de PC o MA; el excedente se le agrega a la empresa con menor cantidad.
  const isMaSmaller = employeesMA <= employeesPC;

  // --- 3. USO DIARIO PLANTA (Papel Higiénico) ---
  // Excedente de uso diario quincenal (por defecto 1 bulto / 48 und). Aplica en ambas quincenas.
  // Se asigna a la empresa con menor cantidad de colaboradores para equilibrar la dotación.
  const papelUnitsTotal = hasEmployees ? papelUsoDiarioBultos * pres.papelUnitsPerPackage : 0;
  const papelUnitsPC = isMaSmaller ? 0 : papelUnitsTotal;
  const papelUnitsMA = isMaSmaller ? papelUnitsTotal : 0;
  const papelBultosPC = isMaSmaller ? 0 : papelUsoDiarioBultos;
  const papelBultosMA = isMaSmaller ? papelUsoDiarioBultos : 0;

  // --- 4. USO DEL MES (Azúcar Konfit) ---
  // Excedente para cafetería y uso de todo el mes (por defecto 1 bulto / 20 kg). Aplica en 1.ª quincena.
  // Se asigna a la empresa con menor cantidad de colaboradores.
  const azucarKgTotal = (hasEmployees && isFirstFortnight) ? (azucarUsoMesBultos * pres.azucarUnitsPerPackage) : 0;
  const azucarUnitsPC = isMaSmaller ? 0 : azucarKgTotal;
  const azucarUnitsMA = isMaSmaller ? azucarKgTotal : 0;
  const azucarBultosPC = (hasEmployees && isFirstFortnight) ? (isMaSmaller ? 0 : azucarUsoMesBultos) : 0;
  const azucarBultosMA = (hasEmployees && isFirstFortnight) ? (isMaSmaller ? azucarUsoMesBultos : 0) : 0;

  // --- 5. ITEMS DEFINITION & STOCK DISTRIBUTION ---
  type ItemKey = 'harina' | 'arroz' | 'azucar' | 'papel' | 'jabon';

  interface ItemPrep {
    id: ItemKey;
    name: string;
    brandDetail: string;
    unitsPerPkg: number;
    unitsPerCombo: number;
    included: boolean;
    pcFixedUnits: number;
    pcFixedBultos: number;
    pcFixedLabel: string;
    maFixedUnits: number;
    maFixedBultos: number;
    maFixedLabel: string;
    stockBultos: number;
    stockLooseUnits: number;
  }

  const preps: ItemPrep[] = [
    {
      id: 'harina',
      name: 'Harina Pan',
      brandDetail: 'Harina de Maíz Precocida',
      unitsPerPkg: pres.harinaUnitsPerPackage,
      unitsPerCombo: 2,
      included: true,
      pcFixedUnits: hasEmployees ? fincaUnitsPC : 0,
      pcFixedBultos: hasEmployees ? fincaBultosPC : 0,
      pcFixedLabel: hasEmployees && fincaBultosPC > 0 ? `Finca (${fincaBultosPC} bulto${fincaBultosPC > 1 ? 's' : ''})` : '-',
      maFixedUnits: hasEmployees ? fincaUnitsMA : 0,
      maFixedBultos: hasEmployees ? fincaBultosMA : 0,
      maFixedLabel: hasEmployees && fincaBultosMA > 0 ? `Finca (${fincaBultosMA} bulto${fincaBultosMA > 1 ? 's' : ''})` : '-',
      stockBultos: stock.harina.bultos,
      stockLooseUnits: stock.harina.looseUnits,
    },
    {
      id: 'arroz',
      name: 'Arroz Mary Superior',
      brandDetail: 'Arroz Tipo I Blanco',
      unitsPerPkg: pres.arrozUnitsPerPackage,
      unitsPerCombo: 1,
      included: true,
      pcFixedUnits: hasEmployees ? comedorUnitsPC : 0,
      pcFixedBultos: hasEmployees ? comedorBultosPC : 0,
      pcFixedLabel: hasEmployees && comedorUnitsPC > 0 ? `Comedor (${comedorUnitsPC} kg)` : '-',
      maFixedUnits: hasEmployees ? comedorUnitsMA : 0,
      maFixedBultos: hasEmployees ? comedorBultosMA : 0,
      maFixedLabel: hasEmployees && comedorUnitsMA > 0 ? `Comedor (${comedorUnitsMA} kg)` : '-',
      stockBultos: stock.arroz.bultos,
      stockLooseUnits: stock.arroz.looseUnits,
    },
    {
      id: 'azucar',
      name: 'Azúcar Konfit',
      brandDetail: 'Azúcar Refinada',
      unitsPerPkg: pres.azucarUnitsPerPackage,
      unitsPerCombo: 1,
      included: true,
      pcFixedUnits: hasEmployees ? azucarUnitsPC : 0,
      pcFixedBultos: hasEmployees ? azucarBultosPC : 0,
      pcFixedLabel: hasEmployees && azucarUnitsPC > 0 ? `Uso Mes (${azucarUnitsPC} kg)` : '-',
      maFixedUnits: hasEmployees ? azucarUnitsMA : 0,
      maFixedBultos: hasEmployees ? azucarBultosMA : 0,
      maFixedLabel: hasEmployees && azucarUnitsMA > 0 ? `Uso Mes (${azucarUnitsMA} kg)` : '-',
      stockBultos: stock.azucar.bultos,
      stockLooseUnits: stock.azucar.looseUnits,
    },
    {
      id: 'papel',
      name: 'Papel Higiénico Caricia Individual',
      brandDetail: 'Rollos Individuales 48 und/bulto',
      unitsPerPkg: pres.papelUnitsPerPackage,
      unitsPerCombo: 1,
      included: true,
      pcFixedUnits: hasEmployees ? papelUnitsPC : 0,
      pcFixedBultos: hasEmployees ? papelBultosPC : 0,
      pcFixedLabel: hasEmployees && papelUnitsPC > 0 ? `Uso Planta (${papelUnitsPC} und)` : '-',
      maFixedUnits: hasEmployees ? papelUnitsMA : 0,
      maFixedBultos: hasEmployees ? papelBultosMA : 0,
      maFixedLabel: hasEmployees && papelUnitsMA > 0 ? `Uso Planta (${papelUnitsMA} und)` : '-',
      stockBultos: stock.papel.bultos,
      stockLooseUnits: stock.papel.looseUnits,
    },
    {
      id: 'jabon',
      name: 'Jabón en Barra',
      brandDetail: 'Jabón en Barra 44 und/bulto',
      unitsPerPkg: pres.jabonUnitsPerPackage,
      unitsPerCombo: 1,
      included: isSecondFortnight,
      pcFixedUnits: 0,
      pcFixedBultos: 0,
      pcFixedLabel: '-',
      maFixedUnits: 0,
      maFixedBultos: 0,
      maFixedLabel: '-',
      stockBultos: isSecondFortnight ? stock.jabon.bultos : 0,
      stockLooseUnits: isSecondFortnight ? stock.jabon.looseUnits : 0,
    },
  ];

  const pcItems: DotacionItemCalculation[] = [];
  const maItems: DotacionItemCalculation[] = [];
  const globalItems: GlobalItemCalculation[] = [];

  preps.forEach((p) => {
    if (!p.included) {
      const emptyPC: DotacionItemCalculation = {
        productId: p.id,
        productName: p.name,
        brandDetail: p.brandDetail,
        unitsPerPackage: p.unitsPerPkg,
        unitsPerCombo: p.unitsPerCombo,
        comboUnitsNeeded: 0,
        fixedAdditionUnits: 0,
        fixedAdditionBultos: 0,
        fixedAdditionLabel: p.pcFixedLabel,
        stockDeductionUnits: 0,
        stockDeductionBultos: 0,
        stockDeductionDetail: '0 bultos / 0 und',
        netUnitsNeeded: 0,
        calculatedBultos: 0,
        manualAdjustment: 0,
        bultosToBuy: 0,
        totalUnitsPurchased: 0,
        surplusUnits: 0,
        includedInPeriod: false,
      };
      const emptyMA: DotacionItemCalculation = {
        ...emptyPC,
        fixedAdditionLabel: p.maFixedLabel,
      };
      pcItems.push(emptyPC);
      maItems.push(emptyMA);

      globalItems.push({
        productId: p.id,
        productName: p.name,
        brandDetail: p.brandDetail,
        unitsPerPackage: p.unitsPerPkg,
        totalComboUnits: 0,
        totalFixedUnits: 0,
        totalFixedBultos: 0,
        totalFixedLabel: '-',
        totalStockDeductedUnits: 0,
        stockBultos: 0,
        stockLooseUnits: 0,
        stockSummaryLabel: 'Sin existencia',
        globalNetUnitsNeeded: 0,
        calculatedGlobalBultos: 0,
        hasSurplusOverlap: false,
        surplusBultosCount: 0,
        hasDeficitAlert: false,
        deficitBultosCount: 0,
        deficitUnitsCount: 0,
        statusMessage: undefined,
        globalBultosToBuy: 0,
        pcBultos: 0,
        maBultos: 0,
        pcAdjustment: 0,
        maAdjustment: 0,
        totalUnitsPurchased: 0,
        netSurplusUnits: 0,
        includedInPeriod: false,
      });
      return;
    }

    const pcComboUnits = employeesPC * p.unitsPerCombo;
    const maComboUnits = employeesMA * p.unitsPerCombo;
    const pcGrossUnits = pcComboUnits + p.pcFixedUnits;
    const maGrossUnits = maComboUnits + p.maFixedUnits;
    const totalGrossUnits = pcGrossUnits + maGrossUnits;

    // Total consolidated stock units in warehouse
    const totalStockUnits = p.stockBultos * p.unitsPerPkg + p.stockLooseUnits;

    // Distribute consolidated stock between PC and MA
    const stockBultosPC = Math.ceil(p.stockBultos / 2);
    const stockBultosMA = p.stockBultos - stockBultosPC;

    let stockLooseUnitsPC = 0;
    let stockLooseUnitsMA = 0;
    if (p.stockLooseUnits > 0) {
      if (p.stockBultos === 0) {
        stockLooseUnitsPC = p.stockLooseUnits;
        stockLooseUnitsMA = 0;
      } else {
        const ratio = totalGrossUnits > 0 ? pcGrossUnits / totalGrossUnits : 0.5;
        stockLooseUnitsPC = Math.round(p.stockLooseUnits * ratio);
        stockLooseUnitsMA = p.stockLooseUnits - stockLooseUnitsPC;
      }
    }

    const pcDeductionUnits = stockBultosPC * p.unitsPerPkg + stockLooseUnitsPC;
    const maDeductionUnits = stockBultosMA * p.unitsPerPkg + stockLooseUnitsMA;

    const pcNetUnits = Math.max(0, pcGrossUnits - pcDeductionUnits);
    const maNetUnits = Math.max(0, maGrossUnits - maDeductionUnits);

    // 1. CÁLCULO CONSOLIDADO GLOBAL (Compra única sobre el total de combos y necesidades)
    const globalNetUnits = Math.max(0, totalGrossUnits - totalStockUnits);
    const calculatedGlobalBultos = totalGrossUnits > 0 ? Math.ceil(globalNetUnits / p.unitsPerPkg) : 0;

    // 2. DISTRIBUCIÓN PARA FACTURACIÓN SEPARADA POR EMPRESA
    // Se prorratea el total global a comprar entre cada empresa según su cuota neta requerida (combos + adiciones fijas - stock)
    let maBultosCalculated = 0;
    if (totalGrossUnits > 0 && calculatedGlobalBultos > 0) {
      const maNetRatio = globalNetUnits > 0 ? maNetUnits / globalNetUnits : maGrossUnits / totalGrossUnits;
      maBultosCalculated = Math.min(
        calculatedGlobalBultos,
        Math.max(0, Math.round(calculatedGlobalBultos * maNetRatio))
      );
    }
    const pcBultosCalculated = Math.max(0, calculatedGlobalBultos - maBultosCalculated);

    // AJUSTES MANUALES DEL USUARIO (Dinámicos por si desea mover bultos entre empresas)
    const itemAdj = adjustments[p.id];
    const pcManualAdj = itemAdj?.pc ?? 0;
    const maManualAdj = itemAdj?.ma ?? 0;

    // Bultos Finales = Calculado Prorrateado + Ajuste Manual
    const pcBultos = Math.max(0, pcBultosCalculated + pcManualAdj);
    const maBultos = Math.max(0, maBultosCalculated + maManualAdj);
    const globalBultosToBuy = pcBultos + maBultos;
    const totalUnitsPurchased = globalBultosToBuy * p.unitsPerPkg;

    // Comparación dinámica contra el techo global requerido
    const bultoDiff = totalGrossUnits > 0 ? globalBultosToBuy - calculatedGlobalBultos : 0;
    const hasSurplusOverlap = bultoDiff > 0;
    const surplusBultosCount = Math.max(0, bultoDiff);
    const hasDeficitAlert = totalGrossUnits > 0 && bultoDiff < 0;
    const deficitBultosCount = Math.max(0, -bultoDiff);
    const deficitUnitsCount = Math.max(0, globalNetUnits - totalUnitsPurchased);

    let statusMessage: string | undefined = undefined;
    if (hasSurplusOverlap) {
      statusMessage =
        surplusBultosCount === 1
          ? 'Excedente: Puedes reducir 1 bulto en PC o MA'
          : `Excedente: Puedes reducir ${surplusBultosCount} bultos en PC o MA`;
    } else if (hasDeficitAlert) {
      statusMessage = `Atención: Faltante de ${deficitBultosCount} bulto${deficitBultosCount > 1 ? 's' : ''} (faltan ${deficitUnitsCount} und para cubrir dotación)`;
    }

    // Fixed addition details (Comedor, Finca, Uso Diario & Uso Mes)
    const totalFixedUnits = p.pcFixedUnits + p.maFixedUnits;
    const totalFixedBultos = p.pcFixedBultos + p.maFixedBultos;
    let totalFixedLabel = '-';
    if (totalFixedUnits > 0) {
      const fixedParts: string[] = [];
      if (p.id === 'harina') {
        if (p.pcFixedBultos > 0) fixedParts.push(`Finca PC: +${p.pcFixedBultos} bulto${p.pcFixedBultos > 1 ? 's' : ''} (${p.pcFixedUnits} und)`);
        if (p.maFixedBultos > 0) fixedParts.push(`Finca MA: +${p.maFixedBultos} bulto${p.maFixedBultos > 1 ? 's' : ''} (${p.maFixedUnits} und)`);
      } else if (p.id === 'arroz') {
        if (p.pcFixedUnits > 0) fixedParts.push(`Comedor PC: +${p.pcFixedUnits} kg`);
        if (p.maFixedUnits > 0) fixedParts.push(`Comedor MA: +${p.maFixedUnits} kg`);
      } else if (p.id === 'azucar') {
        if (p.pcFixedUnits > 0) fixedParts.push(`Uso del Mes PC: +${p.pcFixedBultos} bulto (${p.pcFixedUnits} kg)`);
        if (p.maFixedUnits > 0) fixedParts.push(`Uso del Mes MA: +${p.maFixedBultos} bulto (${p.maFixedUnits} kg)`);
      } else if (p.id === 'papel') {
        if (p.pcFixedUnits > 0) fixedParts.push(`Uso Planta PC: +${p.pcFixedBultos} bulto (${p.pcFixedUnits} und)`);
        if (p.maFixedUnits > 0) fixedParts.push(`Uso Planta MA: +${p.maFixedBultos} bulto (${p.maFixedUnits} und)`);
      }
      totalFixedLabel = fixedParts.length > 0 ? fixedParts.join(' | ') : `+${totalFixedBultos} bultos`;
    }

    let pcOptNote: string | undefined = undefined;
    let maOptNote: string | undefined = undefined;

    if (pcManualAdj !== 0) {
      pcOptNote = `Ajuste manual: ${pcManualAdj > 0 ? `+${pcManualAdj}` : pcManualAdj} bulto(s)${itemAdj?.reason ? ` (${itemAdj.reason})` : ''}`;
    }
    if (maManualAdj !== 0) {
      maOptNote = `Ajuste manual: ${maManualAdj > 0 ? `+${maManualAdj}` : maManualAdj} bulto(s)${itemAdj?.reason ? ` (${itemAdj.reason})` : ''}`;
    }

    if (hasDeficitAlert) {
      if (pcManualAdj < 0) {
        pcOptNote = (pcOptNote ? pcOptNote + ' — ' : '') + `⚠️ Faltante: Reducción deja déficit global de ${deficitBultosCount} bulto(s)`;
      }
      if (maManualAdj < 0) {
        maOptNote = (maOptNote ? maOptNote + ' — ' : '') + `⚠️ Faltante: Reducción deja déficit global de ${deficitBultosCount} bulto(s)`;
      }
    }

    const pcPurchased = pcBultos * p.unitsPerPkg;
    const maPurchased = maBultos * p.unitsPerPkg;
    const globalPurchased = pcPurchased + maPurchased;

    const formatStockDetail = (bultos: number, loose: number): string => {
      const parts: string[] = [];
      if (bultos > 0) parts.push(`${bultos} bulto${bultos > 1 ? 's' : ''}`);
      if (loose > 0) parts.push(`${loose} ${p.id === 'azucar' ? 'kg' : 'und'} sueltas`);
      return parts.length > 0 ? parts.join(' + ') : '0';
    };

    const stockSummaryLabel = formatStockDetail(p.stockBultos, p.stockLooseUnits);

    pcItems.push({
      productId: p.id,
      productName: p.name,
      brandDetail: p.brandDetail,
      unitsPerPackage: p.unitsPerPkg,
      unitsPerCombo: p.unitsPerCombo,
      comboUnitsNeeded: pcComboUnits,
      fixedAdditionUnits: p.pcFixedUnits,
      fixedAdditionBultos: p.pcFixedBultos,
      fixedAdditionLabel: p.pcFixedLabel,
      stockDeductionUnits: pcDeductionUnits,
      stockDeductionBultos: stockBultosPC,
      stockDeductionDetail: formatStockDetail(stockBultosPC, stockLooseUnitsPC),
      netUnitsNeeded: pcNetUnits,
      calculatedBultos: pcBultosCalculated,
      manualAdjustment: pcManualAdj,
      bultosToBuy: pcBultos,
      totalUnitsPurchased: pcPurchased,
      surplusUnits: pcPurchased - pcNetUnits,
      optimizationNote: pcOptNote,
      includedInPeriod: true,
    });

    maItems.push({
      productId: p.id,
      productName: p.name,
      brandDetail: p.brandDetail,
      unitsPerPackage: p.unitsPerPkg,
      unitsPerCombo: p.unitsPerCombo,
      comboUnitsNeeded: maComboUnits,
      fixedAdditionUnits: p.maFixedUnits,
      fixedAdditionBultos: p.maFixedBultos,
      fixedAdditionLabel: p.maFixedLabel,
      stockDeductionUnits: maDeductionUnits,
      stockDeductionBultos: stockBultosMA,
      stockDeductionDetail: formatStockDetail(stockBultosMA, stockLooseUnitsMA),
      netUnitsNeeded: maNetUnits,
      calculatedBultos: maBultosCalculated,
      manualAdjustment: maManualAdj,
      bultosToBuy: maBultos,
      totalUnitsPurchased: maPurchased,
      surplusUnits: maPurchased - maNetUnits,
      optimizationNote: maOptNote,
      includedInPeriod: true,
    });

    globalItems.push({
      productId: p.id,
      productName: p.name,
      brandDetail: p.brandDetail,
      unitsPerPackage: p.unitsPerPkg,
      totalComboUnits: pcComboUnits + maComboUnits,
      totalFixedUnits,
      totalFixedBultos,
      totalFixedLabel,
      totalStockDeductedUnits: totalStockUnits,
      stockBultos: p.stockBultos,
      stockLooseUnits: p.stockLooseUnits,
      stockSummaryLabel,
      globalNetUnitsNeeded: globalNetUnits,
      calculatedGlobalBultos,
      hasSurplusOverlap,
      surplusBultosCount,
      hasDeficitAlert,
      deficitBultosCount,
      deficitUnitsCount,
      statusMessage,
      globalBultosToBuy,
      pcBultos,
      maBultos,
      pcAdjustment: pcManualAdj,
      maAdjustment: maManualAdj,
      totalUnitsPurchased: globalPurchased,
      netSurplusUnits: globalPurchased - globalNetUnits,
      includedInPeriod: true,
    });
  });

  const totalPcBultos = pcItems.reduce((acc, it) => acc + it.bultosToBuy, 0);
  const totalMaBultos = maItems.reduce((acc, it) => acc + it.bultosToBuy, 0);
  const totalGlobalBultos = totalPcBultos + totalMaBultos;

  // Format messages matching Section 5 in specification
  const formatItemLine = (bultos: number, name: string): string => {
    let formattedName = name.toLowerCase();
    if (formattedName.includes('individual')) {
      formattedName = 'papel higiénico caricia *individual*';
    }
    return `- ${bultos} bulto${bultos === 1 ? '' : 's'} de ${formattedName}`;
  };

  const maLines = maItems
    .filter((it) => it.includedInPeriod && it.bultosToBuy > 0)
    .map((it) => formatItemLine(it.bultosToBuy, it.productName));
  const maMessage = `Por Montano Antilia:\n\n${maLines.join('\n')}\n`;

  const pcLines = pcItems
    .filter((it) => it.includedInPeriod && it.bultosToBuy > 0)
    .map((it) => formatItemLine(it.bultosToBuy, it.productName));
  const pcMessage = `Por Productos Carnicos:\n\n${pcLines.join('\n')}\n`;

  const globalLines = globalItems
    .filter((it) => it.includedInPeriod && it.globalBultosToBuy > 0)
    .map((it) => formatItemLine(it.globalBultosToBuy, it.productName));
  const globalMessage = `Total Global a Comprar (${quincena === 'primera' ? '1.ª Quincena' : '2.ª Quincena'}):\n\n${globalLines.join('\n')}\n`;

  return {
    quincena,
    month,
    year,
    periodLabel,
    totalEmployees: employeesPC + employeesMA,
    pc: {
      companyId: 'pc',
      companyName: 'Productos Cárnicos (PC)',
      shortName: 'PC',
      employees: employeesPC,
      items: pcItems,
      totalBultos: totalPcBultos,
    },
    ma: {
      companyId: 'ma',
      companyName: 'Montano Antilia (MA)',
      shortName: 'MA',
      employees: employeesMA,
      items: maItems,
      totalBultos: totalMaBultos,
    },
    globalItems,
    totalGlobalBultos,
    formattedMessages: {
      pcMessage,
      maMessage,
      globalMessage,
    },
  };
}
