export type QuincenaTipo = 'primera' | 'segunda';

export interface ProductStockConsolidated {
  bultos: number; // Cantidad de bultos completos
  looseUnits: number; // Cantidad de unidades o kilos sueltos
}

export interface ConsolidatedWarehouseStock {
  arroz: ProductStockConsolidated;
  harina: ProductStockConsolidated;
  azucar: ProductStockConsolidated;
  papel: ProductStockConsolidated;
  jabon: ProductStockConsolidated;
}

export interface ComedorConfig {
  kgPerDay: number;
  days: number;
  splitPercentPC: number; // e.g. 50
  splitPercentMA: number; // e.g. 50
}

export interface FincaConfig {
  bultosHarina: number; // default 2
  splitPercentPC: number; // 50
  splitPercentMA: number; // 50
}

export interface ProductPresentationConfig {
  arrozUnitsPerPackage: number; // 24
  harinaUnitsPerPackage: number; // 20
  azucarUnitsPerPackage: number; // 20
  papelUnitsPerPackage: number; // 48
  jabonUnitsPerPackage: number; // 44
}

export interface ItemAdjustment {
  pc: number; // manual adjustment delta for PC (e.g. -1, 0, +1)
  ma: number; // manual adjustment delta for MA (e.g. -1, 0, +1)
  reason?: string;
}

export type DotacionAdjustments = Record<string, ItemAdjustment>;

export type PurchaseMode = 'bultos' | 'mixto';
export type ProductPurchaseModes = Record<'harina' | 'arroz' | 'azucar' | 'papel' | 'jabon', PurchaseMode>;

export interface DotacionItemCalculation {
  productId: 'harina' | 'arroz' | 'azucar' | 'papel' | 'jabon';
  productName: string;
  brandDetail: string;
  unitsPerPackage: number;
  unitsPerCombo: number;
  comboUnitsNeeded: number;
  fixedAdditionUnits: number;
  fixedAdditionBultos: number;
  fixedAdditionLabel: string;
  stockDeductionUnits: number;
  stockDeductionBultos: number;
  stockDeductionDetail: string;
  netUnitsNeeded: number;
  calculatedBultos: number; // Teórico del cálculo
  calculatedLooseUnits: number; // Unidades sueltas teóricas
  manualAdjustment: number; // Ajuste manual aplicado (+/-)
  bultosToBuy: number; // Bultos finales a ordenar
  looseUnitsToBuy: number; // Unidades sueltas finales a ordenar
  totalUnitsPurchased: number;
  surplusUnits: number; // positive = excess buffer, negative = deficit
  orderSummaryLabel: string; // e.g. "9 bultos + 4 und" o "10 bultos"
  optimizationNote?: string;
  includedInPeriod: boolean;
}

export interface CompanyDotacionCalculation {
  companyId: 'pc' | 'ma';
  companyName: string;
  shortName: string;
  employees: number;
  items: DotacionItemCalculation[];
  totalBultos: number;
  totalLooseUnits: number;
}

export interface GlobalItemCalculation {
  productId: 'harina' | 'arroz' | 'azucar' | 'papel' | 'jabon';
  productName: string;
  brandDetail: string;
  unitsPerPackage: number;
  totalComboUnits: number;
  totalFixedUnits: number;
  totalFixedBultos: number;
  totalFixedLabel: string; // e.g. "Comedor (PC): +12 bultos (270 kg)" or "Finca (MA): +2 bultos (40 und)"
  totalStockDeductedUnits: number;
  stockBultos: number;
  stockLooseUnits: number;
  stockSummaryLabel: string;
  globalNetUnitsNeeded: number;
  calculatedGlobalBultos: number;
  calculatedGlobalLooseUnits: number;
  purchaseMode: PurchaseMode;
  hasSurplusOverlap: boolean; // true if actual bultos ordered > calculated global bultos
  surplusBultosCount: number; // how many bultos can be reduced
  hasDeficitAlert: boolean; // true if actual bultos ordered < calculated global bultos
  deficitBultosCount: number; // how many bultos missing
  deficitUnitsCount: number; // how many units missing
  statusMessage?: string; // dynamic explanation label
  globalBultosToBuy: number;
  globalLooseUnitsToBuy: number;
  orderSummaryLabel: string; // e.g. "9 bultos + 4 und" o "10 bultos"
  maxSurplusAllowed: number; // Límite de sobrante tolerable (ej: 25% del bulto = 6 und en arroz)
  isWithinTolerance: boolean; // Si el sobrante está dentro del límite aceptable
  pcBultos: number;
  maBultos: number;
  pcAdjustment: number;
  maAdjustment: number;
  totalUnitsPurchased: number;
  netSurplusUnits: number;
  includedInPeriod: boolean;
}

export interface DotacionCalculationResult {
  quincena: QuincenaTipo;
  month: number; // 1 - 12
  year: number;
  periodLabel: string;
  totalEmployees: number;
  pc: CompanyDotacionCalculation;
  ma: CompanyDotacionCalculation;
  globalItems: GlobalItemCalculation[];
  totalGlobalBultos: number;
  totalGlobalLooseUnits: number;
  formattedMessages: {
    pcMessage: string;
    maMessage: string;
    globalMessage: string;
  };
}

export interface GeneratedPurchaseOrderLink {
  orderId: string;
  sequenceNumber?: number | string;
  companyName: string;
  companyId: string;
  supplierName: string;
  supplierId: string;
  totalBultos: number;
  currency: string;
  createdAt: string;
}

export interface DotacionSnapshot {
  id: string;
  name: string;
  month: number;
  year: number;
  quincena: QuincenaTipo;
  employeesPC: number;
  employeesMA: number;
  totalEmployees: number;
  stock: ConsolidatedWarehouseStock;
  comedor: ComedorConfig;
  finca: FincaConfig;
  papelUsoDiarioBultos?: number;
  azucarUsoMesBultos?: number;
  purchaseModes?: ProductPurchaseModes;
  globalPurchaseMode?: PurchaseMode;
  surplusTolerancePercent?: number;
  arrozMaxSurplusKg?: number;
  presentations: ProductPresentationConfig;
  adjustments?: DotacionAdjustments;
  result: DotacionCalculationResult;
  createdAt: string;
  createdBy: string;
  generatedPurchaseOrders?: GeneratedPurchaseOrderLink[];
}
