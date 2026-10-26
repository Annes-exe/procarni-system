import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DynamicBreadcrumbs } from '@/components/DynamicBreadcrumbs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Package,
  Calendar,
  Download,
  RotateCcw,
  Copy,
  Check,
  Building2,
  UtensilsCrossed,
  Trees,
  Info,
  Sparkles,
  ShoppingCart,
  Bookmark,
  History,
  Trash2,
  ExternalLink,
  Archive,
  RefreshCw,
  Plus,
  Minus,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileText,
  Coffee,
  ShieldCheck,
} from 'lucide-react';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import {
  QuincenaTipo,
  ConsolidatedWarehouseStock,
  ComedorConfig,
  FincaConfig,
  ProductPresentationConfig,
  DotacionSnapshot,
  GeneratedPurchaseOrderLink,
  DotacionAdjustments,
  PurchaseMode,
  ProductPurchaseModes,
} from '@/types/dotacion';
import {
  calculateDotacion,
  EMPTY_CONSOLIDATED_STOCK,
  EXAMPLE_CONSOLIDATED_STOCK,
  EXAMPLE_EMPLOYEES,
  EXAMPLE_ADJUSTMENTS,
  DEFAULT_COMEDOR,
  DEFAULT_FINCA,
  DEFAULT_PAPEL_USO_DIARIO_BULTOS,
  DEFAULT_AZUCAR_USO_MES_BULTOS,
  DEFAULT_PRESENTATIONS,
  DEFAULT_GLOBAL_PURCHASE_MODE,
  DEFAULT_PURCHASE_MODES,
  DEFAULT_SURPLUS_TOLERANCE_PERCENT,
  DEFAULT_ARROZ_MAX_SURPLUS_KG,
  MONTH_NAMES,
} from '@/utils/dotacionCalculator';
import { generateDotacionPDF } from '@/utils/dotacionPdfGenerator';
import { dotacionSnapshotService } from '@/services/dotacionSnapshotService';
import { DotacionGeneratePODialog } from '@/components/DotacionGeneratePODialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export default function DotacionQuincenal() {
  const { userName } = useSession();
  const navigate = useNavigate();

  // --- PERIOD STATE ---
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [quincena, setQuincena] = useState<QuincenaTipo>('primera');

  // --- EMPLOYEES PER PERIOD (VARIABLE, STARTS CLEAN IN 0 WAITING FOR USER INPUT) ---
  const [employeesPCMap, setEmployeesPCMap] = useState<Record<string, number>>({
    'primera': 0,
    'segunda': 0,
  });
  const [employeesMAMap, setEmployeesMAMap] = useState<Record<string, number>>({
    'primera': 0,
    'segunda': 0,
  });

  const employeesPC = employeesPCMap[quincena] ?? 0;
  const employeesMA = employeesMAMap[quincena] ?? 0;

  const setEmployeesPC = (val: number) => {
    setEmployeesPCMap((prev) => ({ ...prev, [quincena]: val }));
  };

  const setEmployeesMA = (val: number) => {
    setEmployeesMAMap((prev) => ({ ...prev, [quincena]: val }));
  };

  // --- CONSOLIDATED WAREHOUSE STOCK (VARIABLE, STARTS CLEAN IN 0 WAITING FOR USER INPUT) ---
  const [stock, setStock] = useState<ConsolidatedWarehouseStock>({
    arroz: { bultos: 0, looseUnits: 0 },
    harina: { bultos: 0, looseUnits: 0 },
    azucar: { bultos: 0, looseUnits: 0 },
    papel: { bultos: 0, looseUnits: 0 },
    jabon: { bultos: 0, looseUnits: 0 },
  });

  // --- DYNAMIC USER ADJUSTMENTS (+/- BULTOS PER ITEM FOR PC & MA) ---
  const [adjustments, setAdjustments] = useState<DotacionAdjustments>({});

  // --- COMEDOR, FINCA, USO DIARIO, USO MES & PRESENTATIONS ---
  const [comedor, setComedor] = useState<ComedorConfig>({ ...DEFAULT_COMEDOR });
  const [finca, setFinca] = useState<FincaConfig>({ ...DEFAULT_FINCA });
  const [papelUsoDiarioBultos, setPapelUsoDiarioBultos] = useState<number>(DEFAULT_PAPEL_USO_DIARIO_BULTOS);
  const [azucarUsoBultosMap, setAzucarUsoBultosMap] = useState<Record<string, number>>({
    primera: 1.5, // 30 kg en 1.ª quincena (1.5 bultos)
    segunda: 1.5, // 30 kg en 2.ª quincena (1.5 bultos)
  });
  const azucarUsoMesBultos = azucarUsoBultosMap[quincena] ?? 1.5;
  const setAzucarUsoMesBultos = (val: number) => {
    setAzucarUsoBultosMap((prev) => ({ ...prev, [quincena]: val }));
  };
  const [presentations, setPresentations] = useState<ProductPresentationConfig>({ ...DEFAULT_PRESENTATIONS });
  const [globalPurchaseMode, setGlobalPurchaseMode] = useState<PurchaseMode>(DEFAULT_GLOBAL_PURCHASE_MODE);
  const [purchaseModes, setPurchaseModes] = useState<Partial<ProductPurchaseModes>>({});
  const [surplusTolerancePercent, setSurplusTolerancePercent] = useState<number>(DEFAULT_SURPLUS_TOLERANCE_PERCENT);
  const [arrozMaxSurplusKg, setArrozMaxSurplusKg] = useState<number>(DEFAULT_ARROZ_MAX_SURPLUS_KG);
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);

  // --- UI DIALOGS & SNAPSHOTS ---
  const [isPODialogOpen, setIsPODialogOpen] = useState<boolean>(false);
  const [snapshots, setSnapshots] = useState<DotacionSnapshot[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState<boolean>(false);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | undefined>(undefined);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // --- LOAD SNAPSHOTS ---
  const loadSnapshots = useCallback(async () => {
    setIsLoadingSnapshots(true);
    try {
      const data = await dotacionSnapshotService.getAll();
      setSnapshots(data);
    } catch (e) {
      console.error('Error loading snapshots:', e);
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  // --- CALCULATION RESULT (RECOMPUTES IN REAL TIME) ---
  const result = useMemo(() => {
    return calculateDotacion({
      employeesPC,
      employeesMA,
      quincena,
      month: selectedMonth,
      year: selectedYear,
      stock,
      comedor,
      finca,
      papelUsoDiarioBultos,
      azucarUsoMesBultos,
      globalPurchaseMode,
      purchaseModes,
      surplusTolerancePercent,
      arrozMaxSurplusKg,
      presentations,
      adjustments,
    });
  }, [
    employeesPC,
    employeesMA,
    quincena,
    selectedMonth,
    selectedYear,
    stock,
    comedor,
    finca,
    papelUsoDiarioBultos,
    azucarUsoMesBultos,
    globalPurchaseMode,
    purchaseModes,
    surplusTolerancePercent,
    arrozMaxSurplusKg,
    presentations,
    adjustments,
  ]);

  // --- ADJUSTMENT HANDLERS ---
  const handleModifyAdjustment = (productId: string, company: 'pc' | 'ma', delta: number) => {
    // Bloquear decrementos si la cantidad de bultos a comprar ya está en 0
    const companyItems = company === 'pc' ? result.pc.items : result.ma.items;
    const currentItem = companyItems.find((x) => x.productId === productId);
    if (delta < 0 && currentItem && currentItem.bultosToBuy <= 0) {
      return;
    }

    setAdjustments((prev) => {
      const current = prev[productId] || { pc: 0, ma: 0 };
      const currentVal = current[company] || 0;
      const newVal = currentVal + delta;
      return {
        ...prev,
        [productId]: {
          ...current,
          [company]: newVal,
          reason: newVal < 0 ? 'Optimización de sobrante global' : newVal > 0 ? 'Reserva adicional manual' : undefined,
        },
      };
    });
  };

  const handleResetAdjustments = () => {
    setAdjustments({});
    showSuccess('Ajustes manuales restablecidos a los valores calculados.');
  };

  // --- RESET ALL (TO 0 IMAGINARIO) ---
  const handleResetToZero = () => {
    setEmployeesPCMap({ primera: 0, segunda: 0 });
    setEmployeesMAMap({ primera: 0, segunda: 0 });
    setStock({
      arroz: { bultos: 0, looseUnits: 0 },
      harina: { bultos: 0, looseUnits: 0 },
      azucar: { bultos: 0, looseUnits: 0 },
      papel: { bultos: 0, looseUnits: 0 },
      jabon: { bultos: 0, looseUnits: 0 },
    });
    setAdjustments({});
    setPapelUsoDiarioBultos(DEFAULT_PAPEL_USO_DIARIO_BULTOS);
    setAzucarUsoBultosMap({ primera: 1.5, segunda: 1.5 });
    setSurplusTolerancePercent(DEFAULT_SURPLUS_TOLERANCE_PERCENT);
    setArrozMaxSurplusKg(DEFAULT_ARROZ_MAX_SURPLUS_KG);
    setActiveSnapshotId(undefined);
    showSuccess('Nómina y almacén limpiados en 0. Parámetros fijos mantenidos en valores base (1 bulto papel / 1.25 bultos azúcar).');
  };

  // --- LOAD EXAMPLE VALUES (OPTIONAL SHORTCUT) ---
  const handleLoadExample = () => {
    setEmployeesPCMap({ primera: EXAMPLE_EMPLOYEES.pc, segunda: EXAMPLE_EMPLOYEES.pc });
    setEmployeesMAMap({ primera: EXAMPLE_EMPLOYEES.ma, segunda: EXAMPLE_EMPLOYEES.ma });
    setStock({
      arroz: { ...EXAMPLE_CONSOLIDATED_STOCK.arroz },
      harina: { ...EXAMPLE_CONSOLIDATED_STOCK.harina },
      azucar: { ...EXAMPLE_CONSOLIDATED_STOCK.azucar },
      papel: { ...EXAMPLE_CONSOLIDATED_STOCK.papel },
      jabon: { ...EXAMPLE_CONSOLIDATED_STOCK.jabon },
    });
    setAdjustments({ ...EXAMPLE_ADJUSTMENTS });
    setPapelUsoDiarioBultos(DEFAULT_PAPEL_USO_DIARIO_BULTOS);
    setAzucarUsoMesBultos(DEFAULT_AZUCAR_USO_MES_BULTOS);
    showSuccess('Datos de ejemplo cargados (157 PC / 83 MA, Finca, Comedor, Uso Diario y Uso Mes).');
  };

  const handleSaveSnapshot = async () => {
    try {
      const snapshotName = `Dotación ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} - ${quincena === 'primera' ? '1.ª Quincena' : '2.ª Quincena'
        }`;

      const saved = await dotacionSnapshotService.save({
        name: snapshotName,
        month: selectedMonth,
        year: selectedYear,
        quincena,
        employeesPC,
        employeesMA,
        totalEmployees: employeesPC + employeesMA,
        stock,
        comedor,
        finca,
        papelUsoDiarioBultos,
        azucarUsoMesBultos,
        presentations,
        adjustments,
        result,
        createdBy: userName || 'Usuario Almacén',
      });

      setActiveSnapshotId(saved.id);
      showSuccess(`Snapshot "${saved.name}" guardado en el historial.`);
      await loadSnapshots();
    } catch {
      showError('Error al guardar el snapshot.');
    }
  };

  const handleLoadSnapshot = (s: DotacionSnapshot) => {
    setSelectedMonth(s.month);
    setSelectedYear(s.year);
    setQuincena(s.quincena);
    setEmployeesPCMap((prev) => ({ ...prev, [s.quincena]: s.employeesPC }));
    setEmployeesMAMap((prev) => ({ ...prev, [s.quincena]: s.employeesMA }));
    setStock({ ...s.stock });
    setComedor({ ...s.comedor });
    setFinca({ ...s.finca });
    setPapelUsoDiarioBultos(s.papelUsoDiarioBultos ?? DEFAULT_PAPEL_USO_DIARIO_BULTOS);
    setAzucarUsoMesBultos(s.azucarUsoMesBultos ?? DEFAULT_AZUCAR_USO_MES_BULTOS);
    setPresentations({ ...s.presentations });
    setAdjustments(s.adjustments || {});
    setActiveSnapshotId(s.id);
    showSuccess(`Snapshot "${s.name}" cargado en la calculadora.`);
  };

  const handleDeleteSnapshot = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar snapshot "${name}" del historial?`)) return;
    try {
      await dotacionSnapshotService.delete(id);
      showSuccess('Snapshot eliminado.');
      if (activeSnapshotId === id) setActiveSnapshotId(undefined);
      await loadSnapshots();
    } catch {
      showError('Error al eliminar el snapshot.');
    }
  };

  const handleCopyText = async (text: string, label: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      showSuccess(`${label} copiado al portapapeles.`);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      showError('No se pudo copiar el texto al portapapeles.');
    }
  };

  const handleExportPDF = () => {
    try {
      generateDotacionPDF(result, userName || undefined);
      showSuccess('Relación de dotación generada en PDF con formato oficial Procarni.');
    } catch {
      showError('Error al generar el documento PDF.');
    }
  };

  const handleOrderCreated = async () => {
    await loadSnapshots();
  };

  // Helper for stock inputs
  const updateStock = (
    key: keyof ConsolidatedWarehouseStock,
    field: 'bultos' | 'looseUnits',
    value: number
  ) => {
    setStock((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: Math.max(0, value),
      },
    }));
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-0 sm:px-4 md:px-8 py-1 sm:py-4 space-y-3.5 sm:space-y-6 pb-20 min-w-0 overflow-x-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* TOP ACTIONS & BREADCRUMBS */}
      <div className="flex flex-col gap-2.5 sm:gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="hidden sm:block">
          <DynamicBreadcrumbs />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0 w-full sm:w-auto">
          {/* Secondary Actions Group (Scrollable on small mobile) */}
          <div className="w-full sm:w-auto max-w-full min-w-0 overflow-x-auto pb-0.5 sm:pb-0 no-scrollbar">
            <div className="flex items-center gap-1.5 w-max sm:w-auto">
              {/* Cargar Ejemplo */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadExample}
                title="Cargar datos de ejemplo de la especificación"
                className="h-8 sm:h-9 text-[11px] sm:text-xs font-semibold text-slate-500 hover:text-procarni-dark shrink-0 px-2 sm:px-3"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Cargar Ejemplo
              </Button>

              {/* Reset a Cero Imaginario */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToZero}
                className="h-8 sm:h-9 text-[11px] sm:text-xs border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 shrink-0 px-2 sm:px-3"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1 text-slate-500" />
                Reestablecer (0)
              </Button>

              {/* Snapshot Save */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveSnapshot}
                className="h-8 sm:h-9 text-[11px] sm:text-xs font-semibold border-slate-300 hover:bg-slate-100 text-slate-700 shrink-0 px-2 sm:px-3"
              >
                <Bookmark className="w-3.5 h-3.5 mr-1 text-procarni-blue" />
                Guardar Snapshot
              </Button>
            </div>
          </div>

          {/* Primary Mobile-First Actions */}
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              onClick={() => setIsPODialogOpen(true)}
              className="h-9 text-xs font-bold bg-procarni-secondary hover:bg-[#0b4606] text-white shadow-sm transition-transform active:scale-95 w-full sm:w-auto px-3"
            >
              <ShoppingCart className="w-3.5 h-3.5 mr-1.5" />
              Generar OC
            </Button>

            <Button
              size="sm"
              onClick={handleExportPDF}
              className="h-9 text-xs font-bold bg-procarni-primary hover:bg-[#6e0808] text-white shadow-sm transition-transform active:scale-95 w-full sm:w-auto px-3"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              PDF Procarni
            </Button>
          </div>
        </div>
      </div>

      {/* HEADER HERO SECTION */}
      <div className="relative overflow-hidden rounded-xl sm:rounded-3xl bg-gradient-to-r from-procarni-blue via-[#23355d] to-[#16223e] p-3.5 sm:p-6 md:p-8 text-white shadow-xl min-w-0">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-white text-[10px] sm:text-xs font-semibold border border-white/20">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Módulo de Compras & Dotación Quincenal</span>
            </div>
            <h1 className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight leading-tight">
              Cálculo y Distribución de Dotación Quincenal
            </h1>
            <p className="text-[11px] sm:text-sm text-slate-300 font-normal max-w-2xl leading-relaxed">
              Planificación mensual de dotación de alimentos y aseo para{' '}
              <strong className="text-white font-semibold">Productos Cárnicos</strong> y{' '}
              <strong className="text-white font-semibold">Montano Antilia</strong>. Ingresa existencias físicas y
              nómina, y ajusta dinámicamente los bultos a comprar.
            </p>
          </div>

          {/* PERÍODO SELECTOR CARD */}
          <div className="flex flex-col gap-2 bg-white/15 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl border border-white/20 w-full md:w-auto md:min-w-[280px]">
            <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-300 tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-amber-300" />
              Selección de Período y Quincena
            </span>

            {/* Mes y Año */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <Select value={selectedMonth.toString()} onValueChange={(val) => setSelectedMonth(parseInt(val))}>
                <SelectTrigger className="h-8 text-xs bg-white/90 text-slate-900 border-none font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {MONTH_NAMES.map((name, idx) => (
                    <SelectItem key={idx + 1} value={(idx + 1).toString()} className="text-xs">
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger className="h-8 text-xs bg-white/90 text-slate-900 border-none font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map((yr) => (
                    <SelectItem key={yr} value={yr.toString()} className="text-xs">
                      {yr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quincena Switcher */}
            <div className="grid grid-cols-2 gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setQuincena('primera')}
                className={`h-8 sm:h-auto py-1 sm:py-1.5 px-2 text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center ${quincena === 'primera'
                  ? 'bg-white text-procarni-dark shadow-sm'
                  : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
              >
                1.ª Qna (Día 15)
              </button>
              <button
                type="button"
                onClick={() => setQuincena('segunda')}
                className={`h-8 sm:h-auto py-1 sm:py-1.5 px-2 text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center gap-1 ${quincena === 'segunda'
                  ? 'bg-procarni-primary text-white shadow-sm ring-1 ring-white/50'
                  : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
              >
                <span>2.ª Qna (Día 30)</span>
                <span className="text-[8px] sm:text-[9px] px-1 py-0.2 rounded bg-black/30 uppercase tracking-tighter">Jabón</span>
              </button>
            </div>

            {/* Modalidad de Pedido Switcher */}
            <div className="pt-2 border-t border-white/10 space-y-1">
              <span className="text-[9px] uppercase font-bold text-slate-300 tracking-wider flex items-center justify-between">
                <span>Modalidad de Compra</span>
                <span className="text-[9px] text-amber-300 lowercase font-normal">
                  {globalPurchaseMode === 'mixto' ? '0 sobrante en almacén' : 'redondeo a bulto'}
                </span>
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setGlobalPurchaseMode('mixto');
                    setPurchaseModes({});
                  }}
                  className={`h-8 py-1 px-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center gap-1 ${globalPurchaseMode === 'mixto'
                    ? 'bg-amber-400 text-slate-900 shadow-sm font-extrabold ring-1 ring-white/40'
                    : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  title="Arroz, Papel y Azúcar en bultos (absorbido en consumo diario); Harina y Jabón con tolerancia 25%"
                >
                  <span>Mixto (Bultos+Und)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGlobalPurchaseMode('bultos');
                    setPurchaseModes({});
                  }}
                  className={`h-8 py-1 px-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all text-center flex items-center justify-center gap-1 ${globalPurchaseMode === 'bultos'
                    ? 'bg-white text-slate-900 shadow-sm font-extrabold'
                    : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                  title="Redondeo tradicional en bultos enteros"
                >
                  <span>Solo Bultos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI STAT CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 min-w-0">
        {/* Total Bultos Global */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl min-w-0">
          <CardContent className="p-2.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Total Bultos Compra
              </span>
              <div className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-red-50 text-procarni-primary shrink-0">
                <Package className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex flex-wrap items-baseline gap-1 sm:gap-2">
              <span className="text-xl sm:text-3xl font-extrabold font-mono text-procarni-primary">
                {result.totalGlobalBultos}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">bultos</span>
              {result.totalGlobalLooseUnits > 0 && (
                <span className="text-[10px] sm:text-xs font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                  +{result.totalGlobalLooseUnits} und
                </span>
              )}
            </div>
            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[11px] text-slate-400 font-medium truncate">
              {result.periodLabel}
            </p>
          </CardContent>
        </Card>

        {/* Bultos PC */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl min-w-0">
          <CardContent className="p-2.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Productos Cárnicos
              </span>
              <div className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-blue-50 text-procarni-blue shrink-0">
                <Building2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-baseline gap-1 sm:gap-2">
              <span className="text-xl sm:text-3xl font-extrabold font-mono text-procarni-dark">
                {result.pc.totalBultos}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">bultos</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[11px] text-slate-400 font-medium truncate">
              {result.pc.employees} colaboradores
            </p>
          </CardContent>
        </Card>

        {/* Bultos MA */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl min-w-0">
          <CardContent className="p-2.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Montano Antilia
              </span>
              <div className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-emerald-50 text-procarni-secondary shrink-0">
                <Building2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-baseline gap-1 sm:gap-2">
              <span className="text-xl sm:text-3xl font-extrabold font-mono text-procarni-dark">
                {result.ma.totalBultos}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">bultos</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[11px] text-slate-400 font-medium truncate">
              {result.ma.employees} colaboradores
            </p>
          </CardContent>
        </Card>

        {/* Total Combos */}
        <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl min-w-0">
          <CardContent className="p-2.5 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
                Nómina Total Quincena
              </span>
              <div className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-amber-50 text-amber-700 shrink-0">
                <Users className="w-3.5 h-3.5 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-1.5 sm:mt-3 flex items-baseline gap-1 sm:gap-2">
              <span className="text-xl sm:text-3xl font-extrabold font-mono text-procarni-dark">
                {result.totalEmployees}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-medium">combos</span>
            </div>
            <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[11px] text-slate-400 font-medium truncate">
              PC: {result.pc.employees} + MA: {result.ma.employees}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* INPUTS PANEL: COLABORADORES POR QUINCENA & STOCK CONSOLIDADO EN ALMACÉN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-6 min-w-0">
        {/* COLABORADORES POR EMPRESA (VARIABLE POR QUINCENA - 0 IMAGINARIO EN ESPERA DE INGRESO) */}
        <Card className="lg:col-span-4 bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl flex flex-col justify-between min-w-0">
          <div>
            <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Users className="w-4 h-4 text-procarni-blue" />
                  <CardTitle className="text-xs sm:text-sm font-bold text-procarni-dark uppercase tracking-wider">
                    Colaboradores por Empresa
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[9px] sm:text-[10px] text-slate-600 bg-slate-50">
                  {quincena === 'primera' ? '1.ª Qna' : '2.ª Qna'}
                </Badge>
              </div>
              <CardDescription className="text-[11px] sm:text-xs text-slate-500">
                Cantidad de combos a repartir en esta quincena. Ingresa el número de colaboradores.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0 sm:pt-1 space-y-3 sm:space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pc-emp" className="text-xs font-semibold text-slate-700">
                    Productos Cárnicos (PC)
                  </Label>
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">Combos individuales</span>
                </div>
                <Input
                  id="pc-emp"
                  type="number"
                  min={0}
                  value={employeesPC === 0 ? '' : employeesPC}
                  placeholder="0"
                  onChange={(e) => setEmployeesPC(parseInt(e.target.value) || 0)}
                  className="h-9 sm:h-10 text-sm font-mono font-medium focus-visible:ring-procarni-primary/20 placeholder:text-slate-300"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ma-emp" className="text-xs font-semibold text-slate-700">
                    Montano Antilia (MA)
                  </Label>
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-mono">Combos individuales</span>
                </div>
                <Input
                  id="ma-emp"
                  type="number"
                  min={0}
                  value={employeesMA === 0 ? '' : employeesMA}
                  placeholder="0"
                  onChange={(e) => setEmployeesMA(parseInt(e.target.value) || 0)}
                  className="h-9 sm:h-10 text-sm font-mono font-medium focus-visible:ring-procarni-primary/20 placeholder:text-slate-300"
                />
              </div>
            </CardContent>
          </div>

          <div className="p-3 pt-0 sm:p-4 sm:pt-0">
            <div className="p-2.5 sm:p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">Total Nómina Activa:</span>
              <span className="text-xs sm:text-sm font-mono font-bold text-procarni-dark">
                {employeesPC + employeesMA} colaboradores
              </span>
            </div>
          </div>
        </Card>

        {/* EXISTENCIAS EN ALMACÉN DE DOTACIÓN (CONSOLIDADO, 0 IMAGINARIO EN ESPERA DE INGRESO) */}
        <Card className="lg:col-span-8 bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl min-w-0">
          <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-3 flex flex-row items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Package className="w-4 h-4 text-procarni-primary shrink-0" />
                <CardTitle className="text-xs sm:text-sm font-bold text-procarni-dark uppercase tracking-wider truncate">
                  Existencias en Almacén (Stock)
                </CardTitle>
              </div>
              <CardDescription className="text-[11px] sm:text-xs text-slate-500 truncate">
                Inventario físico global deducible. Registra bultos y/o sueltos.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-[9px] sm:text-[10px] bg-red-50 text-procarni-primary font-bold shrink-0">
              Descuento Global
            </Badge>
          </CardHeader>
          <CardContent className="p-2.5 sm:p-6 pt-0 sm:pt-1">
            {/* MOBILE STACKED CARDS (< md) - No horizontal scroll, touch-friendly inputs */}
            <div className="block md:hidden space-y-2.5">
              {/* Harina Pan Card */}
              <div className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">Harina Pan</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-white">
                    20 und/bulto
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-procarni-blue tracking-wider">
                      Bultos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.harina.bultos === 0 ? '' : stock.harina.bultos}
                      placeholder="0"
                      onChange={(e) => updateStock('harina', 'bultos', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">
                      Kg Sueltos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.harina.looseUnits === 0 ? '' : stock.harina.looseUnits}
                      placeholder="0"
                      onChange={(e) => updateStock('harina', 'looseUnits', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">Total Deducido:</span>
                  <span className="font-mono font-bold text-procarni-primary text-xs sm:text-sm">
                    {stock.harina.bultos * presentations.harinaUnitsPerPackage + stock.harina.looseUnits} kg
                  </span>
                </div>
              </div>

              {/* Arroz Mary Card */}
              <div className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">Arroz Mary Superior</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-white">
                    24 und/bulto
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-procarni-blue tracking-wider">
                      Bultos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.arroz.bultos === 0 ? '' : stock.arroz.bultos}
                      placeholder="0"
                      onChange={(e) => updateStock('arroz', 'bultos', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">
                      Kg Sueltos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.arroz.looseUnits === 0 ? '' : stock.arroz.looseUnits}
                      placeholder="0"
                      onChange={(e) => updateStock('arroz', 'looseUnits', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">Total Deducido:</span>
                  <span className="font-mono font-bold text-procarni-primary text-xs sm:text-sm">
                    {stock.arroz.bultos * presentations.arrozUnitsPerPackage + stock.arroz.looseUnits} kg
                  </span>
                </div>
              </div>

              {/* Azúcar Konfit Card */}
              <div className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">Azúcar Konfit</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-white">
                    20 und/bulto
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-procarni-blue tracking-wider">
                      Bultos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.azucar.bultos === 0 ? '' : stock.azucar.bultos}
                      placeholder="0"
                      onChange={(e) => updateStock('azucar', 'bultos', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">
                      Kg Sueltos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.azucar.looseUnits === 0 ? '' : stock.azucar.looseUnits}
                      placeholder="0"
                      onChange={(e) => updateStock('azucar', 'looseUnits', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">Total Deducido:</span>
                  <span className="font-mono font-bold text-procarni-primary text-xs sm:text-sm">
                    {stock.azucar.bultos * presentations.azucarUnitsPerPackage + stock.azucar.looseUnits} kg
                  </span>
                </div>
              </div>

              {/* Papel Higiénico Card */}
              <div className="p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">Papel Higiénico Caricia</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-white">
                    48 und/bulto
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-procarni-blue tracking-wider">
                      Bultos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.papel.bultos === 0 ? '' : stock.papel.bultos}
                      placeholder="0"
                      onChange={(e) => updateStock('papel', 'bultos', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">
                      Rollos Sueltos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={stock.papel.looseUnits === 0 ? '' : stock.papel.looseUnits}
                      placeholder="0"
                      onChange={(e) => updateStock('papel', 'looseUnits', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">Total Deducido:</span>
                  <span className="font-mono font-bold text-procarni-primary text-xs sm:text-sm">
                    {stock.papel.bultos * presentations.papelUnitsPerPackage + stock.papel.looseUnits} rollos
                  </span>
                </div>
              </div>

              {/* Jabón en Barra Card */}
              <div className={`p-2.5 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 ${quincena === 'primera' ? 'opacity-40' : ''}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 text-xs sm:text-sm block">Jabón en Barra</span>
                    {quincena === 'primera' && (
                      <span className="text-[9px] text-slate-400 font-normal">Exclusivo 2.ª Quincena</span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-white">
                    44 und/bulto
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-procarni-blue tracking-wider">
                      Bultos
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      disabled={quincena === 'primera'}
                      value={stock.jabon.bultos === 0 ? '' : stock.jabon.bultos}
                      placeholder="0"
                      onChange={(e) => updateStock('jabon', 'bultos', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300 disabled:bg-slate-100"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[9px] uppercase font-bold text-amber-700 tracking-wider">
                      Barras Sueltas
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      disabled={quincena === 'primera'}
                      value={stock.jabon.looseUnits === 0 ? '' : stock.jabon.looseUnits}
                      placeholder="0"
                      onChange={(e) => updateStock('jabon', 'looseUnits', parseInt(e.target.value) || 0)}
                      className="h-9 text-sm text-center font-mono font-bold bg-white placeholder:text-slate-300 disabled:bg-slate-100"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/80 text-xs">
                  <span className="text-slate-500 font-medium text-[11px]">Total Deducido:</span>
                  <span className="font-mono font-bold text-procarni-primary text-xs sm:text-sm">
                    {quincena === 'segunda'
                      ? `${stock.jabon.bultos * presentations.jabonUnitsPerPackage + stock.jabon.looseUnits} barras`
                      : '0'}
                  </span>
                </div>
              </div>
            </div>

            {/* DESKTOP TABLE (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400">
                    <th className="text-left pb-2 font-semibold">Insumo</th>
                    <th className="text-center pb-2 font-semibold">Presentación</th>
                    <th className="text-center pb-2 font-semibold text-procarni-blue">Bultos Completos</th>
                    <th className="text-center pb-2 font-semibold text-amber-700">Und / Kg Sueltos</th>
                    <th className="text-center pb-2 font-semibold text-procarni-dark">Total Unidades Deducidas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {/* Harina Pan */}
                  <tr>
                    <td className="py-2.5 font-bold text-slate-800">Harina Pan</td>
                    <td className="text-center text-slate-500 font-mono">20 und/bulto</td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.harina.bultos === 0 ? '' : stock.harina.bultos}
                        placeholder="0"
                        onChange={(e) => updateStock('harina', 'bultos', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.harina.looseUnits === 0 ? '' : stock.harina.looseUnits}
                        placeholder="0"
                        onChange={(e) => updateStock('harina', 'looseUnits', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center font-mono font-bold text-procarni-primary text-sm">
                      {stock.harina.bultos * presentations.harinaUnitsPerPackage + stock.harina.looseUnits} kg
                    </td>
                  </tr>

                  {/* Arroz Mary Superior */}
                  <tr>
                    <td className="py-2.5 font-bold text-slate-800">Arroz Mary Superior</td>
                    <td className="text-center text-slate-500 font-mono">24 und/bulto</td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.arroz.bultos === 0 ? '' : stock.arroz.bultos}
                        placeholder="0"
                        onChange={(e) => updateStock('arroz', 'bultos', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.arroz.looseUnits === 0 ? '' : stock.arroz.looseUnits}
                        placeholder="0"
                        onChange={(e) => updateStock('arroz', 'looseUnits', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center font-mono font-bold text-procarni-primary text-sm">
                      {stock.arroz.bultos * presentations.arrozUnitsPerPackage + stock.arroz.looseUnits} kg
                    </td>
                  </tr>

                  {/* Azúcar Konfit */}
                  <tr>
                    <td className="py-2.5 font-bold text-slate-800">Azúcar Konfit</td>
                    <td className="text-center text-slate-500 font-mono">20 und/bulto</td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.azucar.bultos === 0 ? '' : stock.azucar.bultos}
                        placeholder="0"
                        onChange={(e) => updateStock('azucar', 'bultos', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.azucar.looseUnits === 0 ? '' : stock.azucar.looseUnits}
                        placeholder="0"
                        onChange={(e) => updateStock('azucar', 'looseUnits', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center font-mono font-bold text-procarni-primary text-sm">
                      {stock.azucar.bultos * presentations.azucarUnitsPerPackage + stock.azucar.looseUnits} kg
                    </td>
                  </tr>

                  {/* Papel Higiénico */}
                  <tr>
                    <td className="py-2.5 font-bold text-slate-800">Papel Higiénico Caricia Individual</td>
                    <td className="text-center text-slate-500 font-mono">48 und/bulto</td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.papel.bultos === 0 ? '' : stock.papel.bultos}
                        placeholder="0"
                        onChange={(e) => updateStock('papel', 'bultos', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        value={stock.papel.looseUnits === 0 ? '' : stock.papel.looseUnits}
                        placeholder="0"
                        onChange={(e) => updateStock('papel', 'looseUnits', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center font-mono font-bold text-procarni-primary text-sm">
                      {stock.papel.bultos * presentations.papelUnitsPerPackage + stock.papel.looseUnits} rollos
                    </td>
                  </tr>

                  {/* Jabón en Barra */}
                  <tr className={quincena === 'primera' ? 'opacity-40 bg-slate-50/50' : ''}>
                    <td className="py-2.5 font-bold text-slate-800">
                      Jabón en Barra
                      {quincena === 'primera' && (
                        <span className="text-[10px] text-slate-400 block font-normal">(Exclusivo 2.ª quincena)</span>
                      )}
                    </td>
                    <td className="text-center text-slate-500 font-mono">44 und/bulto</td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        disabled={quincena === 'primera'}
                        value={stock.jabon.bultos === 0 ? '' : stock.jabon.bultos}
                        placeholder="0"
                        onChange={(e) => updateStock('jabon', 'bultos', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center px-2">
                      <Input
                        type="number"
                        min={0}
                        disabled={quincena === 'primera'}
                        value={stock.jabon.looseUnits === 0 ? '' : stock.jabon.looseUnits}
                        placeholder="0"
                        onChange={(e) => updateStock('jabon', 'looseUnits', parseInt(e.target.value) || 0)}
                        className="h-8 w-24 mx-auto text-center font-mono text-xs placeholder:text-slate-300"
                      />
                    </td>
                    <td className="text-center font-mono font-bold text-procarni-primary text-sm">
                      {quincena === 'segunda'
                        ? `${stock.jabon.bultos * presentations.jabonUnitsPerPackage + stock.jabon.looseUnits} barras`
                        : '0'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ADVANCED CONFIGURATION COLLAPSIBLE */}
      <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4">
        <button
          type="button"
          onClick={() => setShowAdvancedParams(!showAdvancedParams)}
          className="w-full flex items-center justify-between text-left text-xs font-bold text-slate-700 hover:text-procarni-dark"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-procarni-blue" />
            <span>Configuración de Adiciones Fijas (Comedor, Finca, Uso Diario, Uso Mes) y Parámetros</span>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <span>{showAdvancedParams ? 'Ocultar' : 'Ajustar parámetros'}</span>
            {showAdvancedParams ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvancedParams && (
          <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-200">
            {/* Comedor Arroz */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                  <UtensilsCrossed className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Comedor (Arroz Mary)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <Label className="text-[10px] text-slate-500 font-semibold uppercase h-7 flex items-end">
                      Consumo (kg/día)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={comedor.kgPerDay}
                      onChange={(e) => setComedor({ ...comedor, kgPerDay: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                      className="h-8 font-mono text-xs mt-1 text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500 font-semibold uppercase h-7 flex items-end">
                      Días Quincena
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={comedor.days}
                      onChange={(e) => setComedor({ ...comedor, days: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                      className="h-8 font-mono text-xs mt-1 text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {comedor.kgPerDay * comedor.days} kg <span className="text-slate-400 font-normal">({Math.ceil((comedor.kgPerDay * comedor.days) / presentations.arrozUnitsPerPackage)} bultos)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Asignación:</span>
                  <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    50% PC / 50% MA
                  </span>
                </div>
              </div>
            </div>

            {/* Finca Harina */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                  <Trees className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Finca (Harina Pan)</span>
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500 font-semibold uppercase h-7 flex items-end">
                    Reserva Mínima (Bultos)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={finca.bultosHarina}
                    onChange={(e) => setFinca({ ...finca, bultosHarina: e.target.value === '' ? 0 : parseInt(e.target.value) || 0 })}
                    className="h-8 font-mono text-xs mt-1 text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {finca.bultosHarina * presentations.harinaUnitsPerPackage} und <span className="text-slate-400 font-normal">({finca.bultosHarina} {finca.bultosHarina === 1 ? 'bulto' : 'bultos'})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Asignación:</span>
                  <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    {Math.round(finca.bultosHarina * 0.5)} b PC / {finca.bultosHarina - Math.round(finca.bultosHarina * 0.5)} b MA (Cada Q)
                  </span>
                </div>
              </div>
            </div>

            {/* Uso Interno Planta y Baños Papel */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                  <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Uso Planta y Baños (Papel Caricia)</span>
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500 font-semibold uppercase h-7 flex items-end">
                    Excedente Quincenal (Bultos)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={papelUsoDiarioBultos}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPapelUsoDiarioBultos(v === '' ? 0 : parseInt(v) || 0);
                    }}
                    className="h-8 font-mono text-xs mt-1 text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {papelUsoDiarioBultos * presentations.papelUnitsPerPackage} und <span className="text-slate-400 font-normal">({papelUsoDiarioBultos} {papelUsoDiarioBultos === 1 ? 'bulto' : 'bultos'})</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Asignación:</span>
                  <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    Empresa menor ({employeesMA <= employeesPC ? 'MA' : 'PC'})
                  </span>
                </div>
              </div>
            </div>

            {/* Uso Quincenal Cafetería y Planta Azúcar */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                  <Coffee className="w-4 h-4 text-amber-700 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Uso Cafetería y Planta (Azúcar Konfit)</span>
                </div>
                <div>
                  <Label className="text-[10px] text-slate-500 font-semibold uppercase h-7 flex items-end">
                    Excedente Quincenal (Bultos)
                  </Label>
                  <Input
                    type="number"
                    step="0.05"
                    min={0}
                    value={azucarUsoMesBultos}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAzucarUsoMesBultos(v === '' ? 0 : parseFloat(v) || 0);
                    }}
                    className="h-8 font-mono text-xs mt-1 text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Total:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {Math.round(azucarUsoMesBultos * presentations.azucarUnitsPerPackage)} kg <span className="text-slate-400 font-normal">({azucarUsoMesBultos} {azucarUsoMesBultos === 1 ? 'bulto' : 'bultos'} · ~1.5 bultos quincenales)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-slate-400">Asignación:</span>
                  <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                    Empresa menor ({employeesMA <= employeesPC ? 'MA' : 'PC'}) · {quincena === 'primera' ? '1.ª Q' : '2.ª Q'}
                  </span>
                </div>
              </div>
            </div>

            {/* Tolerancia de Sobrante Aceptable en Bulto */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2 min-h-[24px]">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Tolerancia de Sobrante en Bulto</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div>
                    <Label className="text-[10px] text-slate-500 font-semibold uppercase block truncate">
                      Arroz (Día Comedor)
                    </Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        value={arrozMaxSurplusKg}
                        onChange={(e) => setArrozMaxSurplusKg(Math.max(0, parseInt(e.target.value) || 0))}
                        className="h-8 font-mono text-xs text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                      />
                      <span className="text-[11px] font-bold text-slate-600">kg</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-slate-500 font-semibold uppercase block truncate">
                      Otros Insumos (%)
                    </Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={surplusTolerancePercent}
                        onChange={(e) => setSurplusTolerancePercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                        className="h-8 font-mono text-xs text-slate-800 font-bold focus-visible:ring-procarni-primary/20"
                      />
                      <span className="text-[11px] font-bold text-slate-600">%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px]">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-medium">Límites activos:</span>
                  <span className="font-mono text-slate-700 font-semibold">
                    Arroz: ≤{arrozMaxSurplusKg} kg (1 día comedor) · Harina: ≤{Math.floor(presentations.harinaUnitsPerPackage * surplusTolerancePercent / 100)} kg
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Papel: ≤{Math.floor(presentations.papelUnitsPerPackage * surplusTolerancePercent / 100)} rollos · Jabón: ≤{Math.floor(presentations.jabonUnitsPerPackage * surplusTolerancePercent / 100)} barras</span>
                  <span className="text-emerald-700 font-medium">Sobrante ≤ límite no se fracciona</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RESULTS TABS VIEW WITH DYNAMIC MANUAL ADJUSTMENT CONTROLS */}
      <Tabs defaultValue="consolidado" className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-200 pb-2 min-w-0">
          {/* Scrollable TabsList for Mobile */}
          <div className="w-full max-w-full min-w-0 overflow-x-auto no-scrollbar">
            <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex min-w-max h-auto min-h-[38px]">
              <TabsTrigger value="consolidado" className="text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0">
                Consolidado ({result.totalGlobalBultos} b)
              </TabsTrigger>
              <TabsTrigger value="pc" className="text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0">
                PC ({result.pc.totalBultos} b)
              </TabsTrigger>
              <TabsTrigger value="ma" className="text-xs font-bold px-2.5 py-1.5 rounded-lg shrink-0">
                MA ({result.ma.totalBultos} b)
              </TabsTrigger>
              <TabsTrigger value="mensajes" className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0">
                <span>Mensajes</span>
                <Badge variant="secondary" className="px-1 py-0 text-[9px] bg-procarni-primary/10 text-procarni-primary font-bold">
                  WhatsApp
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="historial" className="text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shrink-0">
                <History className="w-3 h-3" />
                <span>Historial</span>
                {snapshots.length > 0 && (
                  <Badge variant="secondary" className="px-1 py-0 text-[9px] bg-slate-200 text-slate-800 font-bold">
                    {snapshots.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {Object.keys(adjustments).some((k) => adjustments[k].pc !== 0 || adjustments[k].ma !== 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetAdjustments}
              className="h-8 sm:h-7 text-xs text-amber-700 hover:bg-amber-50 font-semibold self-start sm:self-auto shrink-0"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              Restablecer Ajustes Manuales
            </Button>
          )}
        </div>

        {/* TAB 1: CONSOLIDADO GLOBAL WITH DYNAMIC ADJUSTMENT CONTROLS */}
        <TabsContent value="consolidado" className="space-y-4 mt-0 min-w-0">
          <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl overflow-hidden min-w-0">
            <div className="p-3 sm:p-4 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-procarni-dark flex items-center gap-1.5 flex-wrap">
                  <span>Resumen Consolidado de Compra</span>
                  <Badge variant="outline" className="text-[9px] sm:text-[10px] text-slate-600 font-normal">
                    Ajustable (+ / -)
                  </Badge>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  Ajusta libremente los bultos a comprar para cada empresa.
                </p>
              </div>
              <Badge className="bg-procarni-primary text-white font-mono font-bold text-[11px] sm:text-xs shrink-0">
                {result.totalGlobalBultos} Bultos
              </Badge>
            </div>

            {/* Banner Informativo Adiciones Fijas en Consolidado */}
            <div className="m-2.5 sm:mx-4 sm:mt-3 p-2.5 sm:p-3 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-wrap items-center justify-between gap-2.5 text-xs min-w-0">
              <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 flex-1 text-[11px] sm:text-xs">
                  <span className="font-bold text-slate-900 block sm:inline">Adiciones Fijas Operativas:</span>
                  <span className="text-slate-600 sm:ml-1.5 leading-relaxed break-words">
                    <strong>Comedor:</strong> +{comedor.kgPerDay * comedor.days} kg Arroz &nbsp;|&nbsp;
                    <strong>Finca:</strong> +{finca.bultosHarina} bulto{finca.bultosHarina > 1 ? 's' : ''} Harina ({finca.bultosHarina * presentations.harinaUnitsPerPackage} und) &nbsp;|&nbsp;
                    <strong>Papel Planta:</strong> +{papelUsoDiarioBultos} bulto ({papelUsoDiarioBultos * presentations.papelUnitsPerPackage} und) &nbsp;|&nbsp;
                    <strong>Cafetería:</strong> +${azucarUsoMesBultos} bulto${azucarUsoMesBultos === 1 ? '' : 's'} Azúcar (${Math.round(azucarUsoMesBultos * presentations.azucarUnitsPerPackage)} kg).
                  </span>
                </div>
              </div>
              <Badge variant="outline" className="bg-white text-slate-600 border-slate-200 font-mono font-medium text-[10px] sm:text-[11px] shrink-0">
                Total Adiciones: +{
                  (employeesPC + employeesMA > 0)
                    ? result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalFixedUnits, 0)
                    : (comedor.kgPerDay * comedor.days + finca.bultosHarina * presentations.harinaUnitsPerPackage + papelUsoDiarioBultos * presentations.papelUnitsPerPackage + Math.round(azucarUsoMesBultos * presentations.azucarUnitsPerPackage))
                } und/kg
              </Badge>
            </div>

            {/* MOBILE STACKED CARDS (< md) - No horizontal scroll, touch-friendly inputs */}
            <div className="block md:hidden p-2.5 sm:p-4 space-y-3 sm:space-y-4">
              {result.globalItems.map((item) => {
                if (!item.includedInPeriod) {
                  return (
                    <div key={item.productId} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 opacity-40">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-500 text-xs sm:text-sm">{item.productName}</span>
                        <span className="text-[9px] sm:text-[10px] font-mono text-slate-400">{item.unitsPerPackage} und/bulto</span>
                      </div>
                      <p className="text-[11px] italic text-slate-400 mt-1">Exclusivo para la 2.ª Quincena (Día 30)</p>
                    </div>
                  );
                }

                const pcCalcItem = result.pc.items.find((x) => x.productId === item.productId);
                const maCalcItem = result.ma.items.find((x) => x.productId === item.productId);

                return (
                  <div
                    key={item.productId}
                    className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 bg-white shadow-xs space-y-2.5 sm:space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-slate-900 text-xs sm:text-sm truncate">{item.productName}</h4>
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">{item.brandDetail}</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono text-slate-600 bg-slate-50 shrink-0">
                        {item.unitsPerPackage} und/bulto
                      </Badge>
                    </div>

                    {/* Dynamic Status Badges */}
                    {item.hasSurplusOverlap && (
                      <div className="p-2 rounded-lg bg-amber-50 text-amber-900 text-[11px] font-semibold border border-amber-200/80 flex items-center gap-1.5">
                        <span>💡</span>
                        <span className="leading-tight">{item.statusMessage || `Excedente: Puedes reducir ${item.surplusBultosCount} bulto en PC o MA`}</span>
                      </div>
                    )}
                    {item.hasDeficitAlert && (
                      <div className="p-2 rounded-lg bg-red-50 text-procarni-primary text-[11px] font-bold border border-red-200/80 flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span className="leading-tight">{item.statusMessage || `Atención: Faltante de ${item.deficitBultosCount} bulto(s)`}</span>
                      </div>
                    )}
                    {!item.hasSurplusOverlap && !item.hasDeficitAlert && (item.pcAdjustment !== 0 || item.maAdjustment !== 0) && (
                      <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-medium border border-emerald-200/60 flex items-center gap-1.5">
                        <span>✓</span>
                        <span>Dotación balanceada exacta</span>
                      </div>
                    )}

                    {/* Breakdown row: Combos | Adición Fija | Stock */}
                    <div className="grid grid-cols-3 gap-1.5 py-1.5 px-2.5 bg-slate-50 rounded-lg text-center text-xs">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Combos</span>
                        <span className="font-mono font-semibold text-slate-800 text-[11px] sm:text-xs">{item.totalComboUnits} und</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-emerald-700 block">Fijo</span>
                        <span className="font-mono font-semibold text-emerald-800 text-[11px] sm:text-xs">
                          {item.totalFixedUnits > 0 ? `+${item.totalFixedUnits} ${item.productId === 'arroz' ? 'kg' : 'und'}` : '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-amber-700 block">Stock</span>
                        <span className="font-mono font-semibold text-amber-800 text-[11px] sm:text-xs">
                          {item.totalStockDeductedUnits > 0 ? `-${item.totalStockDeductedUnits}` : '0'}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Steppers: PC & MA */}
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      {/* Bultos PC Stepper */}
                      <div className="p-2 rounded-lg sm:rounded-xl bg-blue-50/60 border border-blue-200/80 flex flex-col items-center justify-between space-y-1.5">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-procarni-blue tracking-wider">
                          Bultos PC
                        </span>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            disabled={item.pcBultos <= 0}
                            onClick={() => handleModifyAdjustment(item.productId, 'pc', -1)}
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-white hover:bg-blue-100 text-procarni-blue font-bold shadow-xs active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Restar 1 bulto a PC"
                          >
                            <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <span className="font-mono font-extrabold text-procarni-blue text-base sm:text-lg min-w-[22px] sm:min-w-[28px] text-center">
                            {item.pcBultos}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleModifyAdjustment(item.productId, 'pc', +1)}
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-white hover:bg-blue-100 text-procarni-blue font-bold shadow-xs active:scale-95"
                            title="Sumar 1 bulto a PC"
                          >
                            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 text-center min-h-[14px]">
                          {item.pcAdjustment !== 0 ? (
                            <span className="text-amber-700 font-semibold">
                              {item.pcAdjustment > 0 ? `+${item.pcAdjustment}` : item.pcAdjustment} aj.
                            </span>
                          ) : (
                            <span className="text-slate-400">calc: {pcCalcItem?.calculatedBultos}</span>
                          )}
                        </div>
                      </div>

                      {/* Bultos MA Stepper */}
                      <div className="p-2 rounded-lg sm:rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex flex-col items-center justify-between space-y-1.5">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-procarni-secondary tracking-wider">
                          Bultos MA
                        </span>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <button
                            type="button"
                            disabled={item.maBultos <= 0}
                            onClick={() => handleModifyAdjustment(item.productId, 'ma', -1)}
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-white hover:bg-emerald-100 text-procarni-secondary font-bold shadow-xs active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Restar 1 bulto a MA"
                          >
                            <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                          <span className="font-mono font-extrabold text-procarni-secondary text-base sm:text-lg min-w-[22px] sm:min-w-[28px] text-center">
                            {item.maBultos}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleModifyAdjustment(item.productId, 'ma', +1)}
                            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg bg-white hover:bg-emerald-100 text-procarni-secondary font-bold shadow-xs active:scale-95"
                            title="Sumar 1 bulto a MA"
                          >
                            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </button>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-mono text-slate-500 text-center min-h-[14px]">
                          {item.maAdjustment !== 0 ? (
                            <span className="text-amber-700 font-semibold">
                              {item.maAdjustment > 0 ? `+${item.maAdjustment}` : item.maAdjustment} aj.
                            </span>
                          ) : (
                            <span className="text-slate-400">calc: {maCalcItem?.calculatedBultos}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Total a Comprar & Buffer Row */}
                    <div className="flex items-center justify-between p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-red-50/80 border border-red-200/80">
                      <div>
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-procarni-primary block tracking-wider">
                          Total a Comprar {item.purchaseMode === 'mixto' ? '(Mixto)' : ''}
                        </span>
                        <span className="font-mono font-extrabold text-procarni-primary text-base sm:text-lg leading-tight">
                          {item.orderSummaryLabel}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                          Buffer Sobrante
                        </span>
                        <span className={`font-mono font-bold text-[10px] sm:text-xs px-2 py-0.5 rounded ${
                          item.netSurplusUnits === 0
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : (item.productId === 'arroz' || item.productId === 'papel' || item.productId === 'azucar'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : (item.isWithinTolerance && item.netSurplusUnits > 0
                                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                    : (item.hasDeficitAlert ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700')))
                        }`}>
                          {item.netSurplusUnits === 0
                            ? '0 und (Exacto)'
                            : (item.productId === 'arroz'
                                ? `+${item.netSurplusUnits} kg (Comedor)`
                                : (item.productId === 'papel'
                                    ? `+${item.netSurplusUnits} rollos (Planta)`
                                    : (item.productId === 'azucar'
                                        ? `+${item.netSurplusUnits} kg (Cafetería)`
                                        : (item.isWithinTolerance
                                            ? `+${item.netSurplusUnits} und (≤${item.maxSurplusAllowed} tol.)`
                                            : `+${item.netSurplusUnits} und`))))}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Mobile Totals Summary Card */}
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-900 text-white space-y-2.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-slate-300">
                    Totales Consolidados
                  </span>
                  <Badge className="bg-procarni-primary text-white font-mono text-xs">
                    {result.totalGlobalBultos} Bultos Totales
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Combos:</span>
                    <span className="font-mono font-bold text-slate-200">
                      {result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalComboUnits, 0)} und
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Fijo:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalFixedUnits, 0)} und
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Bultos PC:</span>
                    <span className="font-mono font-bold text-blue-300">{result.pc.totalBultos} b</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Bultos MA:</span>
                    <span className="font-mono font-bold text-emerald-300">{result.ma.totalBultos} b</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DESKTOP TABLE (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500">
                    <TableHead className="font-bold">Insumo</TableHead>
                    <TableHead className="text-center font-bold">Presentación</TableHead>
                    <TableHead className="text-center font-bold">Total Combos</TableHead>
                    <TableHead className="text-center font-bold text-emerald-800">Fijo (Comedor / Finca)</TableHead>
                    <TableHead className="text-center font-bold text-amber-600">Stock Almacén</TableHead>
                    <TableHead className="text-center font-bold text-procarni-blue">Bultos PC (Ajuste)</TableHead>
                    <TableHead className="text-center font-bold text-procarni-secondary">Bultos MA (Ajuste)</TableHead>
                    <TableHead className="text-center font-bold text-procarni-primary bg-red-50/50">
                      Total a Comprar
                    </TableHead>
                    <TableHead className="text-center font-bold">Buffer Sobrante</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs divide-y divide-slate-100">
                  {result.globalItems.map((item) => {
                    if (!item.includedInPeriod) {
                      return (
                        <TableRow key={item.productId} className="opacity-40 bg-slate-50/40">
                          <TableCell className="font-semibold text-slate-500">{item.productName}</TableCell>
                          <TableCell className="text-center text-slate-400 font-mono">{item.unitsPerPackage} und/bulto</TableCell>
                          <TableCell colSpan={7} className="text-center italic text-slate-400">
                            Exclusivo para la 2.ª Quincena (Día 30)
                          </TableCell>
                        </TableRow>
                      );
                    }

                    const pcCalcItem = result.pc.items.find((x) => x.productId === item.productId);
                    const maCalcItem = result.ma.items.find((x) => x.productId === item.productId);

                    return (
                      <TableRow key={item.productId} className="hover:bg-blue-50/20 transition-colors">
                        <TableCell className="font-bold text-slate-900">
                          {item.productName}
                          <span className="block text-[11px] text-slate-400 font-normal">{item.brandDetail}</span>
                          {item.hasSurplusOverlap && (
                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-semibold border border-amber-200/80 animate-in fade-in">
                              💡 {item.statusMessage || `Excedente: Puedes reducir ${item.surplusBultosCount} bulto en PC o MA`}
                            </span>
                          )}
                          {item.hasDeficitAlert && (
                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-red-50 text-procarni-primary text-[10px] font-bold border border-red-200/80 animate-in fade-in">
                              ⚠️ {item.statusMessage || `Atención: Faltante de ${item.deficitBultosCount} bulto(s)`}
                            </span>
                          )}
                          {!item.hasSurplusOverlap && !item.hasDeficitAlert && (item.pcAdjustment !== 0 || item.maAdjustment !== 0) && (
                            <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium border border-emerald-200/60 animate-in fade-in">
                              ✓ Dotación balanceada exacta
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono text-slate-600">
                          {item.unitsPerPackage} und/bulto
                        </TableCell>
                        <TableCell className="text-center font-mono font-medium">
                          {item.totalComboUnits} und
                        </TableCell>
                        <TableCell className="text-center font-mono">
                          {item.totalFixedUnits > 0 ? (
                            <div className="py-0.5">
                              <span className="text-emerald-700 font-extrabold text-xs block">
                                +{item.totalFixedUnits} {item.productId === 'arroz' ? 'kg' : 'und'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-medium font-sans block leading-tight">
                                {item.totalFixedLabel}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-mono text-amber-700 font-medium">
                          {item.totalStockDeductedUnits > 0 ? (
                            <span>
                              -{item.totalStockDeductedUnits} {item.productId === 'arroz' || item.productId === 'azucar' || item.productId === 'harina' ? 'kg' : (item.productId === 'papel' ? 'rollos' : (item.productId === 'jabon' ? 'barras' : 'und'))}
                              <span className="block text-[10px] text-slate-400">({item.stockSummaryLabel})</span>
                            </span>
                          ) : (
                            '0'
                          )}
                        </TableCell>

                        {/* Bultos PC con Ajuste Manual */}
                        <TableCell className="text-center align-middle py-2">
                          <div className="flex flex-col items-center justify-center min-h-[48px]">
                            <div className="inline-flex items-center gap-1 bg-blue-50/80 px-2 py-1 rounded-xl border border-blue-200/80 shrink-0">
                              <button
                                type="button"
                                disabled={item.pcBultos <= 0}
                                onClick={() => handleModifyAdjustment(item.productId, 'pc', -1)}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-blue-100 text-procarni-blue font-bold shadow-xs active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
                                title={item.pcBultos <= 0 ? 'No se puede reducir por debajo de 0' : 'Restar 1 bulto a PC'}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-mono font-extrabold text-procarni-blue text-sm min-w-[20px] text-center">
                                {item.pcBultos}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleModifyAdjustment(item.productId, 'pc', +1)}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-blue-100 text-procarni-blue font-bold shadow-xs active:scale-90"
                                title="Sumar 1 bulto a PC"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="h-4 flex items-center justify-center mt-0.5">
                              {item.pcAdjustment !== 0 ? (
                                <span className="text-[10px] font-mono text-amber-700 font-semibold leading-none whitespace-nowrap">
                                  {item.pcAdjustment > 0 ? `+${item.pcAdjustment}` : item.pcAdjustment} aj. (calc: {pcCalcItem?.calculatedBultos})
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-transparent select-none leading-none opacity-0 pointer-events-none" aria-hidden="true">
                                  0 aj. (calc: 0)
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Bultos MA con Ajuste Manual */}
                        <TableCell className="text-center align-middle py-2">
                          <div className="flex flex-col items-center justify-center min-h-[48px]">
                            <div className="inline-flex items-center gap-1 bg-emerald-50/80 px-2 py-1 rounded-xl border border-emerald-200/80 shrink-0">
                              <button
                                type="button"
                                disabled={item.maBultos <= 0}
                                onClick={() => handleModifyAdjustment(item.productId, 'ma', -1)}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-emerald-100 text-procarni-secondary font-bold shadow-xs active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white"
                                title={item.maBultos <= 0 ? 'No se puede reducir por debajo de 0' : 'Restar 1 bulto a MA'}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-mono font-extrabold text-procarni-secondary text-sm min-w-[20px] text-center">
                                {item.maBultos}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleModifyAdjustment(item.productId, 'ma', +1)}
                                className="w-5 h-5 flex items-center justify-center rounded bg-white hover:bg-emerald-100 text-procarni-secondary font-bold shadow-xs active:scale-90"
                                title="Sumar 1 bulto a MA"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="h-4 flex items-center justify-center mt-0.5">
                              {item.maAdjustment !== 0 ? (
                                <span className="text-[10px] font-mono text-amber-700 font-semibold leading-none whitespace-nowrap">
                                  {item.maAdjustment > 0 ? `+${item.maAdjustment}` : item.maAdjustment} aj. (calc: {maCalcItem?.calculatedBultos})
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-transparent select-none leading-none opacity-0 pointer-events-none" aria-hidden="true">
                                  0 aj. (calc: 0)
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Total a Comprar Global */}
                        <TableCell className="text-center font-mono font-extrabold text-procarni-primary text-sm sm:text-base bg-red-50/40 whitespace-nowrap">
                          {item.orderSummaryLabel}
                        </TableCell>

                        {/* Buffer Sobrante */}
                        <TableCell className="text-center font-mono">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            item.netSurplusUnits === 0
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : (item.productId === 'arroz' || item.productId === 'papel' || item.productId === 'azucar'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : (item.isWithinTolerance && item.netSurplusUnits > 0
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : (item.hasDeficitAlert ? 'bg-red-50 text-red-700 border border-red-200' : 'text-slate-600')))
                          }`}>
                            {item.netSurplusUnits === 0
                              ? '0 und (Exacto)'
                              : (item.productId === 'arroz'
                                  ? `+${item.netSurplusUnits} kg (Comedor)`
                                  : (item.productId === 'papel'
                                      ? `+${item.netSurplusUnits} rollos (Planta)`
                                      : (item.productId === 'azucar'
                                          ? `+${item.netSurplusUnits} kg (Cafetería)`
                                          : (item.isWithinTolerance
                                              ? `+${item.netSurplusUnits} und (≤${item.maxSurplusAllowed} tol.)`
                                              : `+${item.netSurplusUnits} und`))))}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-slate-100/90 font-bold border-t-2 border-slate-300">
                    <TableCell className="font-extrabold text-procarni-dark uppercase text-[11px]">
                      Totales Consolidados
                    </TableCell>
                    <TableCell className="text-center font-mono text-slate-400 text-xs">-</TableCell>
                    <TableCell className="text-center font-mono font-bold text-slate-700 text-xs">
                      {result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalComboUnits, 0)} und
                    </TableCell>
                    <TableCell className="text-center font-mono">
                      <span className="text-emerald-800 font-extrabold text-xs block">
                        +{result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalFixedUnits, 0)} und
                      </span>
                      <span className="text-[10px] text-slate-500 font-sans block font-medium leading-tight">
                        Fijo (Comedor + Finca + Diario + Mes)
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono font-medium text-amber-700 text-xs">
                      -{result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.totalStockDeductedUnits, 0)} und
                    </TableCell>
                    <TableCell className="text-center font-mono font-extrabold text-procarni-blue text-base">
                      {result.pc.totalBultos} bultos
                    </TableCell>
                    <TableCell className="text-center font-mono font-extrabold text-procarni-secondary text-base">
                      {result.ma.totalBultos} bultos
                    </TableCell>
                    <TableCell className="text-center font-mono font-extrabold text-procarni-primary text-lg bg-red-100/60">
                      {result.totalGlobalBultos} bultos
                    </TableCell>
                    <TableCell className="text-center font-mono text-slate-600 text-xs">
                      {result.globalItems.filter((x) => x.includedInPeriod).reduce((acc, x) => acc + x.netSurplusUnits, 0)} und
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 2: PRODUCTOS CÁRNICOS (PC) */}
        <TabsContent value="pc" className="space-y-4 mt-0 min-w-0">
          <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl overflow-hidden min-w-0">
            <div className="p-3 sm:p-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-procarni-blue truncate">
                  Empresa Productos Cárnicos (PC) — {result.pc.employees} combos
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  Desglose analítico paso a paso de los requerimientos individuales.
                </p>
              </div>
              <Badge className="bg-procarni-blue text-white font-mono font-bold text-xs shrink-0">
                {result.pc.totalBultos} Bultos{result.pc.totalLooseUnits > 0 ? ` + ${result.pc.totalLooseUnits} Und` : ''}
              </Badge>
            </div>
            <div className="p-2.5 sm:p-4 space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
                {result.pc.items
                  .filter((item) => item.includedInPeriod)
                  .map((item) => (
                    <div
                      key={item.productId}
                      className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm block truncate">{item.productName}</span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">{item.brandDetail}</span>
                        </div>
                        <div className="text-right flex items-center gap-1.5 shrink-0">
                          <div className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                            <button
                              type="button"
                              disabled={item.bultosToBuy <= 0}
                              onClick={() => handleModifyAdjustment(item.productId, 'pc', -1)}
                              className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-slate-50 hover:bg-blue-100 text-slate-700 hover:text-procarni-blue font-bold active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={item.bultosToBuy <= 0 ? 'No se puede reducir por debajo de 0' : 'Restar 1 bulto a PC'}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm sm:text-base font-mono font-extrabold text-procarni-blue min-w-[20px] sm:min-w-[24px] text-center">
                              {item.bultosToBuy}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleModifyAdjustment(item.productId, 'pc', +1)}
                              className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-slate-50 hover:bg-blue-100 text-slate-700 hover:text-procarni-blue font-bold active:scale-95"
                              title="Sumar 1 bulto a PC"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 font-mono hidden sm:inline">bultos</span>
                        </div>
                      </div>

                      <div className="text-[11px] sm:text-xs space-y-1 text-slate-600 pt-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Combos ({result.pc.employees} × {item.unitsPerCombo}):</span>
                          <span className="font-mono font-medium">{item.comboUnitsNeeded} und</span>
                        </div>
                        {item.fixedAdditionUnits > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>Adición Fija ({item.fixedAdditionLabel}):</span>
                            <span className="font-mono font-semibold">+{item.fixedAdditionUnits} und</span>
                          </div>
                        )}
                        {item.stockDeductionUnits > 0 && (
                          <div className="flex justify-between text-amber-700">
                            <span>Deducción Stock ({item.stockDeductionDetail}):</span>
                            <span className="font-mono font-semibold">-{item.stockDeductionUnits} und</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                          <span>Necesidad Neta:</span>
                          <span className="font-mono">{item.netUnitsNeeded} und (calc: {item.calculatedBultos} b)</span>
                        </div>
                        {item.optimizationNote && (
                          <div className="p-2 bg-amber-50 text-amber-800 rounded-lg text-[10px] sm:text-[11px] font-medium border border-amber-200/60 mt-2">
                            {item.optimizationNote}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 3: MONTANO ANTILIA (MA) */}
        <TabsContent value="ma" className="space-y-4 mt-0 min-w-0">
          <Card className="bg-white border-slate-200 shadow-sm rounded-xl sm:rounded-2xl overflow-hidden min-w-0">
            <div className="p-3 sm:p-4 bg-emerald-50/50 border-b border-emerald-100 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-extrabold text-procarni-secondary truncate">
                  Empresa Montano Antilia (MA) — {result.ma.employees} combos
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                  Desglose analítico paso a paso de los requerimientos individuales.
                </p>
              </div>
              <Badge className="bg-procarni-secondary text-white font-mono font-bold text-xs shrink-0">
                {result.ma.totalBultos} Bultos{result.ma.totalLooseUnits > 0 ? ` + ${result.ma.totalLooseUnits} Und` : ''}
              </Badge>
            </div>
            <div className="p-2.5 sm:p-4 space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-4">
                {result.ma.items
                  .filter((item) => item.includedInPeriod)
                  .map((item) => (
                    <div
                      key={item.productId}
                      className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm block truncate">{item.productName}</span>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 block truncate">{item.brandDetail}</span>
                        </div>
                        <div className="text-right flex items-center gap-1.5 shrink-0">
                          <div className="inline-flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                            <button
                              type="button"
                              disabled={item.bultosToBuy <= 0}
                              onClick={() => handleModifyAdjustment(item.productId, 'ma', -1)}
                              className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-slate-50 hover:bg-emerald-100 text-slate-700 hover:text-procarni-secondary font-bold active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                              title={item.bultosToBuy <= 0 ? 'No se puede reducir por debajo de 0' : 'Restar 1 bulto a MA'}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-sm sm:text-base font-mono font-extrabold text-procarni-secondary min-w-[20px] sm:min-w-[24px] text-center">
                              {item.bultosToBuy}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleModifyAdjustment(item.productId, 'ma', +1)}
                              className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center rounded-md bg-slate-50 hover:bg-emerald-100 text-slate-700 hover:text-procarni-secondary font-bold active:scale-95"
                              title="Sumar 1 bulto a MA"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-600 font-mono hidden sm:inline">bultos</span>
                        </div>
                      </div>

                      <div className="text-[11px] sm:text-xs space-y-1 text-slate-600 pt-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Combos ({result.ma.employees} × {item.unitsPerCombo}):</span>
                          <span className="font-mono font-medium">{item.comboUnitsNeeded} und</span>
                        </div>
                        {item.fixedAdditionUnits > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>Adición Fija ({item.fixedAdditionLabel}):</span>
                            <span className="font-mono font-semibold">+{item.fixedAdditionUnits} und</span>
                          </div>
                        )}
                        {item.stockDeductionUnits > 0 && (
                          <div className="flex justify-between text-amber-700">
                            <span>Deducción Stock ({item.stockDeductionDetail}):</span>
                            <span className="font-mono font-semibold">-{item.stockDeductionUnits} und</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1">
                          <span>Necesidad Neta:</span>
                          <span className="font-mono">{item.netUnitsNeeded} und (calc: {item.calculatedBultos} b)</span>
                        </div>
                        {item.optimizationNote && (
                          <div className="p-2 bg-amber-50 text-amber-800 rounded-lg text-[10px] sm:text-[11px] font-medium border border-amber-200/60 mt-2">
                            {item.optimizationNote}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 4: MENSAJES PARA PEDIDO (WHATSAPP / SLACK) */}
        <TabsContent value="mensajes" className="space-y-6 mt-0">
          <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <span className="font-bold block">Formato listo para WhatsApp y Órdenes de Pedido</span>
              <p>
                Los siguientes bloques de texto reflejan con exactitud los bultos finales calculados y ajustados para ser enviados al departamento de compras o a los proveedores.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mensaje Montano Antilia */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-4 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-procarni-secondary" />
                    <h4 className="text-xs font-bold text-procarni-secondary uppercase tracking-wider">
                      Mensaje: Montano Antilia
                    </h4>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-800 border-emerald-300">
                    {result.ma.totalBultos} bultos
                  </Badge>
                </div>
                <div className="p-4">
                  <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner">
                    {result.formattedMessages.maMessage}
                  </pre>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <Button
                  size="sm"
                  onClick={() =>
                    handleCopyText(result.formattedMessages.maMessage, 'Mensaje Montano Antilia', 'ma')
                  }
                  className="w-full sm:w-auto h-11 sm:h-9 text-xs font-semibold bg-procarni-secondary hover:bg-[#0b4606] text-white"
                >
                  {copiedKey === 'ma' ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copiar Mensaje
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* Mensaje Productos Cárnicos */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col justify-between">
              <div>
                <div className="p-4 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-procarni-blue" />
                    <h4 className="text-xs font-bold text-procarni-blue uppercase tracking-wider">
                      Mensaje: Productos Cárnicos
                    </h4>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-blue-800 border-blue-300">
                    {result.pc.totalBultos} bultos
                  </Badge>
                </div>
                <div className="p-4">
                  <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner">
                    {result.formattedMessages.pcMessage}
                  </pre>
                </div>
              </div>
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <Button
                  size="sm"
                  onClick={() =>
                    handleCopyText(result.formattedMessages.pcMessage, 'Mensaje Productos Cárnicos', 'pc')
                  }
                  className="w-full sm:w-auto h-11 sm:h-9 text-xs font-semibold bg-procarni-blue hover:bg-[#141f38] text-white"
                >
                  {copiedKey === 'pc' ? (
                    <>
                      <Check className="w-3.5 h-3.5 mr-1.5" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      Copiar Mensaje
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>

          {/* Mensaje Consolidado Global */}
          <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-4 bg-red-50/60 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-procarni-primary" />
                <h4 className="text-xs font-bold text-procarni-primary uppercase tracking-wider">
                  Mensaje: Total Global Consolidado
                </h4>
              </div>
              <Badge variant="outline" className="text-[10px] text-red-800 border-red-300">
                {result.totalGlobalBultos} bultos a comprar
              </Badge>
            </div>
            <div className="p-4">
              <pre className="p-4 rounded-xl bg-slate-900 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner">
                {result.formattedMessages.globalMessage}
              </pre>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  handleCopyText(result.formattedMessages.globalMessage, 'Mensaje Consolidado Global', 'global')
                }
                className="w-full sm:w-auto h-11 sm:h-9 text-xs font-semibold bg-procarni-primary hover:bg-[#6e0808] text-white"
              >
                {copiedKey === 'global' ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copiar Mensaje Consolidado
                  </>
                )}
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* TAB 5: HISTORIAL DE SNAPSHOTS */}
        <TabsContent value="historial" className="space-y-4 mt-0">
          <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-4 bg-slate-50/60 border-b border-slate-200/80 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-procarni-dark">
                  Historial de Snapshots y Cálculos Guardados
                </h3>
                <p className="text-xs text-slate-500">
                  Registros históricos de dotación mensual por quincena con sus Órdenes de Compra vinculadas.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadSnapshots}
                className="h-10 sm:h-8 text-xs text-slate-600 shrink-0"
              >
                <RefreshCw className="w-3 h-3 mr-1.5" />
                Actualizar
              </Button>
            </div>

            {snapshots.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <Archive className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No hay snapshots guardados aún.</p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  Guarda un snapshot del cálculo actual utilizando el botón "Guardar Snapshot" en la parte superior para consultar o auditar en el futuro.
                </p>
              </div>
            ) : (
              <>
                {/* MOBILE STACKED SNAPSHOT CARDS (< md) */}
                <div className="block md:hidden p-2.5 sm:p-4 space-y-2.5 sm:space-y-3">
                  {snapshots.map((s) => (
                    <div
                      key={s.id}
                      className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border space-y-2.5 transition-colors ${activeSnapshotId === s.id
                        ? 'bg-blue-50/60 border-blue-300 ring-1 ring-blue-400/30'
                        : 'bg-white border-slate-200'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {activeSnapshotId === s.id && (
                              <Badge className="bg-blue-600 text-white text-[8px] sm:text-[9px] px-1.5 py-0 shrink-0">
                                Activo
                              </Badge>
                            )}
                            <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">{s.name}</span>
                          </div>
                          <span className="text-[10px] sm:text-[11px] text-slate-400 font-mono block mt-0.5">
                            PC: {s.employeesPC} | MA: {s.employeesMA} combos
                          </span>
                        </div>
                        <Badge className="bg-procarni-primary text-white font-mono text-[11px] sm:text-xs shrink-0">
                          {s.result.totalGlobalBultos} bultos
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs py-1.5 px-2.5 bg-slate-50 rounded-lg">
                        <div>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Guardado</span>
                          <span className="font-mono text-slate-700 text-[11px] sm:text-xs">
                            {format(new Date(s.createdAt), "dd/MM/yy HH:mm", { locale: es })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Nómina</span>
                          <span className="font-mono text-slate-700 text-[11px] sm:text-xs">
                            {s.totalEmployees} colab.
                          </span>
                        </div>
                        <div>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Creador</span>
                          <span className="text-slate-700 truncate block text-[11px] sm:text-xs">{s.createdBy}</span>
                        </div>
                        <div>
                          <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400 block">Órdenes OC</span>
                          {s.generatedPurchaseOrders && s.generatedPurchaseOrders.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {s.generatedPurchaseOrders.map((po, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => navigate(`/purchase-orders/${po.orderId}`)}
                                  className="inline-flex items-center gap-1 text-[10px] text-procarni-blue hover:underline font-mono"
                                >
                                  <span>OC {po.sequenceNumber || po.orderId.slice(0, 5)}</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px] sm:text-[11px]">Ninguna</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 pt-1 border-t border-slate-100">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadSnapshot(s)}
                          className="h-9 text-xs text-procarni-blue hover:bg-blue-50 font-semibold flex-1 border-blue-200"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Cargar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateDotacionPDF(s.result, s.createdBy)}
                          className="h-9 text-xs text-procarni-primary hover:bg-red-50 font-semibold flex-1 border-red-200"
                        >
                          <Download className="w-3.5 h-3.5 mr-1" />
                          PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSnapshot(s.id, s.name)}
                          className="h-9 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 px-2.5 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* DESKTOP TABLE (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500">
                        <TableHead>Nombre / Período</TableHead>
                        <TableHead className="text-center">Fecha Guardado</TableHead>
                        <TableHead className="text-center">Nómina (Combos)</TableHead>
                        <TableHead className="text-center">Total Bultos</TableHead>
                        <TableHead className="text-center">Órdenes de Compra</TableHead>
                        <TableHead className="text-center">Creado Por</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y divide-slate-100">
                      {snapshots.map((s) => (
                        <TableRow
                          key={s.id}
                          className={activeSnapshotId === s.id ? 'bg-blue-50/40' : 'hover:bg-slate-50/60'}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {activeSnapshotId === s.id && (
                                <Badge className="bg-blue-600 text-white text-[9px] px-1.5 py-0">Activo</Badge>
                              )}
                              <span className="font-bold text-slate-900">{s.name}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 block font-mono">
                              PC: {s.employeesPC} | MA: {s.employeesMA} combos
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-mono text-slate-600">
                            {format(new Date(s.createdAt), "dd/MM/yyyy HH:mm", { locale: es })}
                          </TableCell>
                          <TableCell className="text-center font-mono font-medium">
                            {s.totalEmployees} colaboradores
                          </TableCell>
                          <TableCell className="text-center font-mono font-extrabold text-procarni-primary">
                            {s.result.totalGlobalBultos} bultos
                          </TableCell>
                          <TableCell className="text-center">
                            {s.generatedPurchaseOrders && s.generatedPurchaseOrders.length > 0 ? (
                              <div className="flex flex-col gap-1 items-center">
                                {s.generatedPurchaseOrders.map((po, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => navigate(`/purchase-orders/${po.orderId}`)}
                                    className="inline-flex items-center gap-1 text-[11px] text-procarni-blue hover:underline font-mono"
                                  >
                                    <span>OC {po.sequenceNumber || po.orderId.slice(0, 6)} ({po.companyName.split(' ')[0]})</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Ninguna</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-slate-600">
                            {s.createdBy}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLoadSnapshot(s)}
                                title="Cargar snapshot en la calculadora"
                                className="h-8 text-xs text-procarni-blue hover:bg-blue-50 font-semibold"
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                Cargar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => generateDotacionPDF(s.result, s.createdBy)}
                                title="Descargar PDF de este snapshot"
                                className="h-8 text-xs text-procarni-primary hover:bg-red-50"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSnapshot(s.id, s.name)}
                                title="Eliminar snapshot"
                                className="h-8 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* GENERATE PO MODAL DIALOG */}
      <DotacionGeneratePODialog
        open={isPODialogOpen}
        onOpenChange={setIsPODialogOpen}
        result={result}
        snapshotId={activeSnapshotId}
        onOrderCreated={handleOrderCreated}
      />
    </div>
  );
}
