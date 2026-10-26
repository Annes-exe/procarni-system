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
  PurchaseMode,
  ProductPurchaseModes,
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
export const DEFAULT_AZUCAR_USO_MES_BULTOS = 1.25; // 25 kg (1 bulto base + 1/4 bulto / 5 kg consumo cotidiano planta)

// POLÍTICA HÍBRIDA SEGÚN NATURALEZA DE CONSUMO:
// - Consumo Diario Fijo (Arroz, Papel, Azúcar): Bultos cerrados. Sus sobrantes se absorben naturalmente en el uso diario (comedor, baños y café).
// - Entregas Puntuales (Harina, Jabón): Modalidad mixta con tolerancia estricta del 25% (<= 5 harina, <= 11 jabón).
export const DEFAULT_PURCHASE_MODES: ProductPurchaseModes = {
  arroz: 'bultos', // Consumo diario continuo (Comedor 18 kg/día)
  papel: 'bultos', // Consumo diario continuo (Baños y Planta 48 und/Q)
  azucar: 'bultos', // Consumo diario continuo (Cafetería 25 kg/mes)
  harina: 'mixto', // Entrega puntual (Dotación combos + Finca) -> tolerancia 25%
  jabon: 'mixto', // Entrega puntual (Dotación combos 2.ª Q) -> tolerancia 25%
};

export const DEFAULT_GLOBAL_PURCHASE_MODE: PurchaseMode = 'mixto';
export const DEFAULT_SURPLUS_TOLERANCE_PERCENT = 25; // 25% del bulto para insumos generales
export const DEFAULT_ARROZ_MAX_SURPLUS_KG = 18; // 18 kg (1 día completo de consumo del comedor)

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
  globalPurchaseMode?: PurchaseMode;
  purchaseModes?: Partial<ProductPurchaseModes>;
  surplusTolerancePercent?: number;
  arrozMaxSurplusKg?: number;
  presentations?: Partial<ProductPresentationConfig>;
  adjustments?: DotacionAdjustments;
}

export const formatOrderSummary = (bultos: number, looseUnits: number, id: string): string => {
  const unitWord = id === 'azucar' || id === 'arroz' ? 'kg' : (id === 'papel' ? 'rollos' : (id === 'jabon' ? 'barras' : 'und'));
  if (bultos > 0 && looseUnits > 0) {
    return `${bultos} b + ${looseUnits} ${unitWord}`;
  } else if (bultos > 0) {
    return `${bultos} bulto${bultos === 1 ? '' : 's'}`;
  } else if (looseUnits > 0) {
    return `${looseUnits} ${unitWord}`;
  }
  return '0 bultos';
};

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
  globalPurchaseMode = DEFAULT_GLOBAL_PURCHASE_MODE,
  purchaseModes = {},
  surplusTolerancePercent = DEFAULT_SURPLUS_TOLERANCE_PERCENT,
  arrozMaxSurplusKg = DEFAULT_ARROZ_MAX_SURPLUS_KG,
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
  // Excedente para cafetería y uso de todo el mes (por defecto 1.25 bultos / 25 kg). Aplica en 1.ª quincena.
  // Se asigna a la empresa con menor cantidad de colaboradores.
  const azucarKgTotal = (hasEmployees && isFirstFortnight) ? Math.round(azucarUsoMesBultos * pres.azucarUnitsPerPackage) : 0;
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
      brandDetail: 'Papel Higiénico Institucional',
      unitsPerPkg: pres.papelUnitsPerPackage,
      unitsPerCombo: 1,
      included: true,
      pcFixedUnits: hasEmployees ? papelUnitsPC : 0,
      pcFixedBultos: hasEmployees ? papelBultosPC : 0,
      pcFixedLabel: hasEmployees && papelBultosPC > 0 ? `Uso Planta (${papelBultosPC} bulto)` : '-',
      maFixedUnits: hasEmployees ? papelUnitsMA : 0,
      maFixedBultos: hasEmployees ? papelBultosMA : 0,
      maFixedLabel: hasEmployees && papelBultosMA > 0 ? `Uso Planta (${papelBultosMA} bulto)` : '-',
      stockBultos: stock.papel.bultos,
      stockLooseUnits: stock.papel.looseUnits,
    },
    {
      id: 'jabon',
      name: 'Jabón de Tocador',
      brandDetail: 'Jabón en Barra',
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
    // Si el usuario especificó un modo para este producto, usarlo; de lo contrario, si el modo global es 'bultos' forzar 'bultos', o si es 'mixto' usar la política híbrida recomendada.
    const itemPurchaseMode: PurchaseMode = purchaseModes[p.id] ?? (globalPurchaseMode === 'bultos' ? 'bultos' : DEFAULT_PURCHASE_MODES[p.id]);

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
        calculatedLooseUnits: 0,
        manualAdjustment: 0,
        bultosToBuy: 0,
        looseUnitsToBuy: 0,
        totalUnitsPurchased: 0,
        surplusUnits: 0,
        orderSummaryLabel: '-',
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
        calculatedGlobalLooseUnits: 0,
        purchaseMode: itemPurchaseMode,
        maxSurplusAllowed: 0,
        isWithinTolerance: true,
        hasSurplusOverlap: false,
        surplusBultosCount: 0,
        hasDeficitAlert: false,
        deficitBultosCount: 0,
        deficitUnitsCount: 0,
        statusMessage: undefined,
        globalBultosToBuy: 0,
        globalLooseUnitsToBuy: 0,
        orderSummaryLabel: '-',
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
    const globalNetUnits = Math.max(0, totalGrossUnits - totalStockUnits);

    // User manual adjustments (+/- bultos)
    const itemAdj = adjustments[p.id];
    const pcManualAdj = itemAdj?.pc ?? 0;
    const maManualAdj = itemAdj?.ma ?? 0;

    let calculatedGlobalBultos = 0;
    let calculatedGlobalLooseUnits = 0;
    let pcBultosCalculated = 0;
    let pcLooseCalculated = 0;
    let maBultosCalculated = 0;
    let maLooseCalculated = 0;

    // REGLA DE TOLERANCIA DE SOBRANTE:
    // - Para Arroz: límite especial de hasta 18 kg (1 día completo de consumo de Comedor).
    //   Si sobran <= 18 kg -> pide el bulto completo. Si sobran > 18 kg -> bultos + kilos sueltos exactos.
    // - Para insumos generales: hasta el 25% del bulto (Harina/Azúcar: 5 kg, Papel: 12 rollos, Jabón: 11 barras).
    const maxSurplusAllowed = p.id === 'arroz'
      ? arrozMaxSurplusKg
      : Math.floor((surplusTolerancePercent / 100) * p.unitsPerPkg);
    const potentialFullBultos = totalGrossUnits > 0 ? Math.ceil(globalNetUnits / p.unitsPerPkg) : 0;
    const potentialSurplus = totalGrossUnits > 0 ? Math.max(0, potentialFullBultos * p.unitsPerPkg - globalNetUnits) : 0;
    const isWithinTolerance = potentialSurplus <= maxSurplusAllowed;

    if (itemPurchaseMode === 'mixto') {
      if (isWithinTolerance) {
        // Sobrante aceptable dentro del 25% -> Comprar bultos completos cerrados
        calculatedGlobalBultos = potentialFullBultos;
        calculatedGlobalLooseUnits = 0;

        if (totalGrossUnits > 0 && calculatedGlobalBultos > 0) {
          const maNetRatio = globalNetUnits > 0 ? maNetUnits / globalNetUnits : maGrossUnits / totalGrossUnits;
          maBultosCalculated = Math.min(
            calculatedGlobalBultos,
            Math.max(0, Math.round(calculatedGlobalBultos * maNetRatio))
          );
        }
        pcBultosCalculated = Math.max(0, calculatedGlobalBultos - maBultosCalculated);
        pcLooseCalculated = 0;
        maLooseCalculated = 0;
      } else {
        // Sobrante excesivo (> 25% del bulto) -> Comprar bultos enteros + unidades sueltas exactas
        calculatedGlobalBultos = totalGrossUnits > 0 ? Math.floor(globalNetUnits / p.unitsPerPkg) : 0;
        calculatedGlobalLooseUnits = totalGrossUnits > 0 ? (globalNetUnits % p.unitsPerPkg) : 0;

        if (totalGrossUnits > 0 && globalNetUnits > 0) {
          const pcBaseBultos = Math.floor(pcNetUnits / p.unitsPerPkg);
          const pcRemainder = pcNetUnits % p.unitsPerPkg;
          const maBaseBultos = Math.floor(maNetUnits / p.unitsPerPkg);
          const maRemainder = maNetUnits % p.unitsPerPkg;

          if (pcRemainder + maRemainder < p.unitsPerPkg) {
            pcBultosCalculated = pcBaseBultos;
            pcLooseCalculated = pcRemainder;
            maBultosCalculated = maBaseBultos;
            maLooseCalculated = maRemainder;
          } else {
            if (pcRemainder >= maRemainder) {
              pcBultosCalculated = pcBaseBultos + 1;
              pcLooseCalculated = 0;
              maBultosCalculated = maBaseBultos;
              maLooseCalculated = calculatedGlobalLooseUnits;
            } else {
              pcBultosCalculated = pcBaseBultos;
              pcLooseCalculated = calculatedGlobalLooseUnits;
              maBultosCalculated = maBaseBultos + 1;
              maLooseCalculated = 0;
            }
          }
        }
      }
    } else {
      // Modo tradicional 'bultos' (redondeo hacia arriba siempre)
      calculatedGlobalBultos = potentialFullBultos;
      calculatedGlobalLooseUnits = 0;

      if (totalGrossUnits > 0 && calculatedGlobalBultos > 0) {
        const maNetRatio = globalNetUnits > 0 ? maNetUnits / globalNetUnits : maGrossUnits / totalGrossUnits;
        maBultosCalculated = Math.min(
          calculatedGlobalBultos,
          Math.max(0, Math.round(calculatedGlobalBultos * maNetRatio))
        );
      }
      pcBultosCalculated = Math.max(0, calculatedGlobalBultos - maBultosCalculated);
      pcLooseCalculated = 0;
      maLooseCalculated = 0;
    }

    const pcBultos = Math.max(0, pcBultosCalculated + pcManualAdj);
    const maBultos = Math.max(0, maBultosCalculated + maManualAdj);
    const globalBultosToBuy = pcBultos + maBultos;

    const pcLooseUnitsToBuy = pcLooseCalculated;
    const maLooseUnitsToBuy = maLooseCalculated;
    const globalLooseUnitsToBuy = pcLooseUnitsToBuy + maLooseUnitsToBuy;

    const pcPurchased = pcBultos * p.unitsPerPkg + pcLooseUnitsToBuy;
    const maPurchased = maBultos * p.unitsPerPkg + maLooseUnitsToBuy;
    const globalPurchased = pcPurchased + maPurchased;

    const bultoDiff = totalGrossUnits > 0 ? globalBultosToBuy - calculatedGlobalBultos : 0;
    const surplusUnits = Math.max(0, globalPurchased - globalNetUnits);
    const deficitUnits = Math.max(0, globalNetUnits - globalPurchased);

    const isDailyConsumptionItem = p.id === 'arroz' || p.id === 'papel' || p.id === 'azucar';
    const hasSurplusOverlap = bultoDiff > 0 || (itemPurchaseMode === 'bultos' && surplusUnits > 0 && !isDailyConsumptionItem);
    const surplusBultosCount = Math.max(0, bultoDiff);
    const hasDeficitAlert = totalGrossUnits > 0 && globalPurchased < globalNetUnits;
    const deficitBultosCount = Math.ceil(deficitUnits / p.unitsPerPkg);
    const deficitUnitsCount = deficitUnits;

    let statusMessage: string | undefined = undefined;
    if (hasDeficitAlert) {
      statusMessage = `Atención: Faltante de ${deficitUnitsCount} und para cubrir dotación`;
    } else if (surplusUnits === 0 && totalGrossUnits > 0) {
      statusMessage = itemPurchaseMode === 'mixto' ? 'Compra exacta (0 excedente)' : undefined;
    } else if (isDailyConsumptionItem && surplusUnits > 0) {
      if (p.id === 'arroz') statusMessage = `Reserva activa: +${surplusUnits} kg (absorbido en Comedor diario)`;
      else if (p.id === 'papel') statusMessage = `Reserva activa: +${surplusUnits} rollos (absorbido en Baños y Planta)`;
      else if (p.id === 'azucar') statusMessage = `Reserva activa: +${surplusUnits} kg (absorbido en Cafetería y Oficinas)`;
    } else if (isWithinTolerance && surplusUnits > 0 && surplusUnits <= maxSurplusAllowed) {
      statusMessage = `Buffer aceptable: +${surplusUnits} und (≤${surplusTolerancePercent}% del bulto; máx: ${maxSurplusAllowed} und)`;
    } else if (bultoDiff > 0) {
      statusMessage =
        surplusBultosCount === 1
          ? 'Excedente: Puedes reducir 1 bulto en PC o MA'
          : `Excedente: Puedes reducir ${surplusBultosCount} bultos en PC o MA`;
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
        if (p.pcFixedUnits > 0) fixedParts.push(`Uso del Mes PC: +${p.pcFixedBultos} bulto${p.pcFixedBultos === 1 ? '' : 's'} (${p.pcFixedUnits} kg)`);
        if (p.maFixedUnits > 0) fixedParts.push(`Uso del Mes MA: +${p.maFixedBultos} bulto${p.maFixedBultos === 1 ? '' : 's'} (${p.maFixedUnits} kg)`);
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

    const formatStockDetail = (bultos: number, loose: number): string => {
      const parts: string[] = [];
      if (bultos > 0) parts.push(`${bultos} bulto${bultos > 1 ? 's' : ''}`);
      if (loose > 0) parts.push(`${loose} ${p.id === 'azucar' || p.id === 'arroz' ? 'kg' : (p.id === 'papel' ? 'rollos' : (p.id === 'jabon' ? 'barras' : 'und'))}`);
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
      calculatedLooseUnits: pcLooseCalculated,
      manualAdjustment: pcManualAdj,
      bultosToBuy: pcBultos,
      looseUnitsToBuy: pcLooseUnitsToBuy,
      totalUnitsPurchased: pcPurchased,
      surplusUnits: pcPurchased - pcNetUnits,
      orderSummaryLabel: formatOrderSummary(pcBultos, pcLooseUnitsToBuy, p.id),
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
      calculatedLooseUnits: maLooseCalculated,
      manualAdjustment: maManualAdj,
      bultosToBuy: maBultos,
      looseUnitsToBuy: maLooseUnitsToBuy,
      totalUnitsPurchased: maPurchased,
      surplusUnits: maPurchased - maNetUnits,
      orderSummaryLabel: formatOrderSummary(maBultos, maLooseUnitsToBuy, p.id),
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
      calculatedGlobalLooseUnits,
      purchaseMode: itemPurchaseMode,
      hasSurplusOverlap,
      surplusBultosCount,
      hasDeficitAlert,
      deficitBultosCount,
      deficitUnitsCount,
      statusMessage,
      globalBultosToBuy,
      globalLooseUnitsToBuy,
      orderSummaryLabel: formatOrderSummary(globalBultosToBuy, globalLooseUnitsToBuy, p.id),
      maxSurplusAllowed,
      isWithinTolerance,
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
  const totalPcLooseUnits = pcItems.reduce((acc, it) => acc + it.looseUnitsToBuy, 0);
  const totalMaBultos = maItems.reduce((acc, it) => acc + it.bultosToBuy, 0);
  const totalMaLooseUnits = maItems.reduce((acc, it) => acc + it.looseUnitsToBuy, 0);
  const totalGlobalBultos = totalPcBultos + totalMaBultos;
  const totalGlobalLooseUnits = totalPcLooseUnits + totalMaLooseUnits;

  // Format messages matching Section 5 in specification
  const formatItemLine = (bultos: number, looseUnits: number, name: string): string => {
    let formattedName = name.toLowerCase();
    if (formattedName.includes('individual')) {
      formattedName = 'papel higiénico caricia *individual*';
    }
    const unitWord = formattedName.includes('azúcar') || formattedName.includes('arroz')
      ? 'kg'
      : (formattedName.includes('papel') ? 'rollos' : (formattedName.includes('jabón') ? 'barras' : 'und'));

    if (bultos > 0 && looseUnits > 0) {
      return `- ${bultos} bulto${bultos === 1 ? '' : 's'} y ${looseUnits} ${unitWord} de ${formattedName}`;
    } else if (bultos > 0) {
      return `- ${bultos} bulto${bultos === 1 ? '' : 's'} de ${formattedName}`;
    } else if (looseUnits > 0) {
      return `- ${looseUnits} ${unitWord} de ${formattedName}`;
    }
    return `- 0 bultos de ${formattedName}`;
  };

  const maLines = maItems
    .filter((it) => it.includedInPeriod && (it.bultosToBuy > 0 || it.looseUnitsToBuy > 0))
    .map((it) => formatItemLine(it.bultosToBuy, it.looseUnitsToBuy, it.productName));
  const maMessage = `Por Montano Antilia:\n\n${maLines.join('\n')}\n`;

  const pcLines = pcItems
    .filter((it) => it.includedInPeriod && (it.bultosToBuy > 0 || it.looseUnitsToBuy > 0))
    .map((it) => formatItemLine(it.bultosToBuy, it.looseUnitsToBuy, it.productName));
  const pcMessage = `Por Productos Carnicos:\n\n${pcLines.join('\n')}\n`;

  const globalLines = globalItems
    .filter((it) => it.includedInPeriod && (it.globalBultosToBuy > 0 || it.globalLooseUnitsToBuy > 0))
    .map((it) => formatItemLine(it.globalBultosToBuy, it.globalLooseUnitsToBuy, it.productName));
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
      totalLooseUnits: totalPcLooseUnits,
    },
    ma: {
      companyId: 'ma',
      companyName: 'Montano Antilia (MA)',
      shortName: 'MA',
      employees: employeesMA,
      items: maItems,
      totalBultos: totalMaBultos,
      totalLooseUnits: totalMaLooseUnits,
    },
    globalItems,
    totalGlobalBultos,
    totalGlobalLooseUnits,
    formattedMessages: {
      pcMessage,
      maMessage,
      globalMessage,
    },
  };
}
