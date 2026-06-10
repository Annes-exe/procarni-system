import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import {
  Warehouse, Plus, Search, AlertTriangle, TrendingUp,
  DollarSign, Package, ChevronRight, X, Loader2,
  BadgeCheck, Eye, MoreVertical, Edit, History, Archive, Download, FileSpreadsheet, FileText, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  getMaterialsInventory,
  getMaterialsNotInInventory,
  enableMaterialForInventory,
  getInventoryFamilies,
  getInventoryPeriods,
  toggleMaterialActiveStatus,
} from '@/integrations/supabase/services/inventoryService';
import { InventoryCategory, MaterialInventory } from '@/integrations/supabase/types';
import { getAllUnits } from '@/integrations/supabase/data';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<InventoryCategory, { bg: string; text: string; border: string }> = {
  MPF: { bg: 'bg-red-50', text: 'text-procarni-primary', border: 'border-procarni-primary/20' },
  MPS: { bg: 'bg-amber-50', text: 'text-procarni-alert', border: 'border-procarni-alert/20' },
  EMP: { bg: 'bg-blue-50', text: 'text-procarni-blue', border: 'border-procarni-blue/20' },
  ETQ: { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-procarni-dark/20' },
};

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  MPF: 'Materia Prima Fresca',
  MPS: 'Materia Prima Seca',
  EMP: 'Empaques',
  ETQ: 'Etiquetas',
};

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  subtitle?: string;
  icon: React.ReactNode;
  iconColorClass: string;
  delay?: number;
}

const KpiCard = ({ title, value, subtitle, icon, iconColorClass, delay = 0 }: KpiCardProps) => (
  <m.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
  >
    <Card className="group relative overflow-hidden border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem] transition-all duration-500">
      <m.div whileHover={{ y: -6 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn('p-3 rounded-2xl transition-all duration-500', iconColorClass)}>
            {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5' })}
          </div>
        </div>

        <div>
          <div className="text-[28px] font-black text-gray-900 tracking-tighter mb-1 leading-tight truncate">{value}</div>
          <div className="text-sm font-bold text-procarni-blue mb-0.5">{title}</div>
          {subtitle && <p className="text-[12px] text-gray-500 font-medium">{subtitle}</p>}
        </div>
      </m.div>
      {/* Background icon decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        {React.cloneElement(icon as React.ReactElement, { className: 'h-24 w-24 -mr-8 -mt-8 rotate-12' })}
      </div>
    </Card>
  </m.div>
);

// ─── Category Badge ───────────────────────────────────────────────────────────

const CategoryBadge = ({ category }: { category: InventoryCategory }) => {
  const c = CATEGORY_COLORS[category];
  return (
    <Badge
      variant="outline"
      className={cn('font-bold text-xs border', c.bg, c.text, c.border)}
    >
      {category}
    </Badge>
  );
};

// ─── Habilitar Material Modal ─────────────────────────────────────────────────

interface HabilitarModalProps {
  open: boolean;
  onClose: () => void;
}

const HabilitarMaterialModal = ({ open, onClose }: HabilitarModalProps) => {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 300);
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string; code: string | null; category: string | null; unit: string | null } | null>(null);
  const [category, setCategory] = useState<InventoryCategory | ''>('');
  const [unit, setUnit] = useState('KG');
  const [minStock, setMinStock] = useState('0');
  const [initialCost, setInitialCost] = useState('0');
  const [notes, setNotes] = useState('');

  const { data: units = [], isLoading: isLoadingUnits } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
    enabled: open,
  });

  const { data: families = [] } = useQuery({
    queryKey: ['inventoryFamilies'],
    queryFn: getInventoryFamilies,
    enabled: open,
  });

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ['materialsNotInInventory', debouncedSearch],
    queryFn: () => getMaterialsNotInInventory(debouncedSearch),
    enabled: open,
  });

  const filteredCandidates = useMemo(() => {
    return candidates.slice(0, 30);
  }, [candidates]);

  const nextSku = useMemo(() => {
    if (!category) return '—';
    const fam = families.find(f => f.category === category);
    if (!fam) return '—';
    return `${fam.prefix}-${String(fam.current_sequence + 1).padStart(3, '0')}`;
  }, [category, families]);

  const { mutate: enable, isPending } = useMutation({
    mutationFn: enableMaterialForInventory,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['materialsNotInInventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryFamilies'] });
      toast.success(`Material habilitado con SKU ${data.sku}`);
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleClose = () => {
    setSearch('');
    setSelectedMaterial(null);
    setCategory('');
    setUnit('KG');
    setMinStock('0');
    setInitialCost('0');
    setNotes('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial || !category) return;
    enable({
      material_id: selectedMaterial.id,
      inventory_category: category,
      unit: unit.trim() || 'kg',
      min_stock_alert: parseFloat(minStock) || 0,
      last_purchase_price: parseFloat(initialCost) || 0,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-procarni-dark">
            <BadgeCheck className="h-5 w-5 text-procarni-secondary" />
            Habilitar Material para Inventario
          </DialogTitle>
          <DialogDescription>
            Solo los materiales habilitados pueden recibir transacciones en el almacén.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Select material */}
        {!selectedMaterial ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="habilitar-search"
                placeholder="Buscar por nombre o código..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {loadingCandidates ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3"><Skeleton className="h-4 w-full" /></div>
                ))
              ) : filteredCandidates.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-400">
                  {candidates.length === 0 ? 'Todos los materiales ya están habilitados' : 'Sin resultados'}
                </p>
              ) : filteredCandidates.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMaterial(m);
                    const matchedUnit = units.find(u => u.name.toUpperCase() === (m.unit || '').toUpperCase());
                    if (matchedUnit) {
                      setUnit(matchedUnit.name);
                    } else if (m.unit) {
                      setUnit(m.unit);
                    } else if (units.length > 0) {
                      setUnit(units[0].name);
                    } else {
                      setUnit('KG');
                    }
                  }}
                  className="w-full text-left p-3 hover:bg-gray-50 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{m.name}</p>
                    {m.code && <p className="text-xs text-gray-400 font-mono">{m.code}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Step 2: Configure */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Selected material pill */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Package className="h-4 w-4 text-slate-500 flex-shrink-0" />
              <span className="text-sm font-bold text-slate-800 flex-1">{selectedMaterial.name}</span>
              <button type="button" onClick={() => setSelectedMaterial(null)}>
                <X className="h-4 w-4 text-slate-400 hover:text-procarni-primary transition-colors" />
              </button>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-category">Categoría de Inventario *</Label>
              <Select value={category} onValueChange={v => setCategory(v as InventoryCategory)}>
                <SelectTrigger id="inv-category">
                  <SelectValue placeholder="Selecciona una categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map(c => (
                    <SelectItem key={c} value={c}>
                      <span className="font-mono font-bold mr-2">{c}</span>
                      <span className="text-gray-600">{CATEGORY_LABELS[c]}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SKU Preview */}
            {category && (
              <m.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-procarni-dark rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <span className="text-xs text-gray-400 uppercase tracking-wider">SKU que se asignará</span>
                <span className="font-mono font-black text-xl text-procarni-secondary">{nextSku}</span>
              </m.div>
            )}

            {/* Unit and stocks in two columns */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-unit">Unidad *</Label>
                <Select value={unit} onValueChange={setUnit} disabled={isLoadingUnits}>
                  <SelectTrigger id="inv-unit">
                    <SelectValue placeholder={isLoadingUnits ? "Cargando..." : "Unidad"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.name}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-min-stock">Alerta mínima</Label>
                <Input id="inv-min-stock" type="number" min="0" value={minStock} onChange={e => setMinStock(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-cost">Costo inicial</Label>
                <Input id="inv-cost" type="number" min="0" step="0.000001" value={initialCost} onChange={e => setInitialCost(e.target.value)} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="inv-notes">Notas (opcional)</Label>
              <Textarea id="inv-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Condiciones de almacenamiento, proveedor habitual..." />
            </div>

            <Button
              type="submit"
              disabled={!category || isPending}
              className="w-full bg-procarni-secondary hover:bg-procarni-secondary/90 text-white h-11 font-bold text-sm"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BadgeCheck className="h-4 w-4 mr-2" />}
              {isPending ? 'Habilitando...' : `Habilitar con SKU ${nextSku}`}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const StockGlobal = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | 'ALL'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  // New filters and pagination states
  const [verArchivados, setVerArchivados] = useState(false);
  const [stockFilter, setStockFilter] = useState<'ALL' | 'WITH_STOCK' | 'LOW_STOCK' | 'NO_STOCK'>('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // History modal states
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedHistoryMaterial, setSelectedHistoryMaterial] = useState<MaterialInventory | null>(null);

  // Always fetch both active and inactive so client-side filters run instantly
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: () => getMaterialsInventory(true),
  });

  const { data: periods = [] } = useQuery({
    queryKey: ['inventoryPeriods'],
    queryFn: getInventoryPeriods,
  });

  // Toggle Archive Mutation
  const toggleArchiveMutation = useMutation({
    mutationFn: ({ materialId, isActive }: { materialId: string; isActive: boolean }) =>
      toggleMaterialActiveStatus(materialId, isActive),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success(variables.isActive ? 'Material restaurado con éxito' : 'Material archivado con éxito');
    },
    onError: (err: Error) => {
      toast.error(`Error al actualizar estado del material: ${err.message}`);
    }
  });

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [categoryFilter, searchQuery, verArchivados, stockFilter]);

  // KPIs (Only count active inventory for dashboard figures)
  const kpis = useMemo(() => {
    const activeInv = inventory.filter(m => m.is_active);
    const totalValue = activeInv.reduce((acc, m) => acc + m.total_value, 0);
    const criticalCount = activeInv.filter(m => m.current_stock <= m.min_stock_alert && m.min_stock_alert > 0).length;
    const lastClosed = periods.find(p => p.status === 'CERRADO');
    return { totalValue, criticalCount, lastClosed };
  }, [inventory, periods]);

  // Filtered table
  const filtered = useMemo(() => {
    let result = inventory;
    
    // Category filter
    if (categoryFilter !== 'ALL') {
      result = result.filter(m => m.inventory_category === categoryFilter);
    }
    
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.sku.toLowerCase().includes(q) ||
        (m.materials?.name ?? '').toLowerCase().includes(q)
      );
    }

    // Active/Archived filter (show archived if verArchivados is true)
    result = result.filter(m => m.is_active === !verArchivados);

    // Stock level filter
    if (stockFilter !== 'ALL') {
      result = result.filter(m => {
        const hasAlert = m.min_stock_alert > 0;
        const isLow = hasAlert && m.current_stock <= m.min_stock_alert && m.current_stock > 0;
        const isNoStock = m.current_stock === 0;

        if (stockFilter === 'WITH_STOCK') {
          return m.current_stock > 0 && !isLow;
        } else if (stockFilter === 'LOW_STOCK') {
          return isLow;
        } else if (stockFilter === 'NO_STOCK') {
          return isNoStock;
        }
        return true;
      });
    }

    return result;
  }, [inventory, categoryFilter, searchQuery, verArchivados, stockFilter]);

  // Paginated items
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * 7;
    return filtered.slice(start, start + 7);
  }, [filtered, currentPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / 7));

  // Export handlers
  const exportToExcel = () => {
    const dataToExport = filtered.map(m => ({
      SKU: m.sku,
      Material: m.materials?.name ?? '—',
      Categoría: m.inventory_category,
      'Último Costo': `$${fmt(m.last_purchase_price, 4)} / ${m.unit}`,
      CPP: `$${fmt(m.average_unit_cost, 4)} / ${m.unit}`,
      'Stock Actual': m.current_stock,
      Unidad: m.unit,
      'Valor Stock (USD)': m.total_value,
      Estado: m.is_active ? 'Activo' : 'Archivado'
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Global');
    XLSX.writeFile(wb, `Reporte_Stock_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Reporte de Excel descargado.');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    // Header styling
    doc.setFontSize(18);
    doc.setTextColor(27, 41, 74); // Procarni Blue (#1B294A)
    doc.text('Reporte de Stock General', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Fecha de generación: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 26);
    doc.text(`Total materiales exp.: ${filtered.length}`, 14, 31);

    const tableBody = filtered.map(m => [
      m.sku,
      m.materials?.name ?? '—',
      m.inventory_category,
      `$${fmt(m.last_purchase_price, 4)} / ${m.unit}`,
      `$${fmt(m.average_unit_cost, 4)} / ${m.unit}`,
      `${fmt(m.current_stock, 2)} ${m.unit}`,
      `$${fmt(m.total_value, 2)}`
    ]);

    autoTable(doc, {
      startY: 36,
      head: [['SKU', 'Material', 'Cat.', 'Últ. Costo', 'CPP', 'Stock', 'Valor Stock']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [27, 41, 74] }, // Procarni Blue
      styles: { fontSize: 8 }
    });

    doc.save(`Reporte_Stock_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    toast.success('Reporte de PDF descargado.');
  };

  const handleOpenHistory = (m: MaterialInventory) => {
    setSelectedHistoryMaterial(m);
    setHistoryModalOpen(true);
  };

  const handleToggleArchive = (m: MaterialInventory) => {
    toggleArchiveMutation.mutate({
      materialId: m.material_id,
      isActive: !m.is_active
    });
  };

  const SkeletonRow = () => (
    <TableRow>
      {Array.from({ length: 9 }).map((_, i) => (
        <TableCell key={i}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  );

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      <div className="container mx-auto space-y-6 pb-20">
        <style>{`
          @keyframes fadeSlideIn {
            from { opacity: 0; transform: translateX(-8px); }
            to   { opacity: 1; transform: translateX(0); }
          }
        `}</style>

        {/* ── Page Header ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-[30px] font-black text-procarni-blue tracking-tighter leading-none">
              Stock Global
            </h1>
            <p className="text-[13px] text-gray-500 font-medium italic">
              Centro de mando del inventario Procarni
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={exportToExcel}
              disabled={filtered.length === 0}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm gap-2 h-10 px-4 font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <FileSpreadsheet className="h-4 w-4 text-procarni-secondary" />
              Exportar Excel
            </Button>
            <Button
              onClick={exportToPDF}
              disabled={filtered.length === 0}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm gap-2 h-10 px-4 font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <FileText className="h-4 w-4 text-procarni-primary" />
              Exportar PDF
            </Button>
            <Button
              id="btn-habilitar-material"
              onClick={() => setModalOpen(true)}
              className="bg-procarni-secondary hover:bg-procarni-secondary/90 text-white shadow-lg shadow-procarni-secondary/20 gap-2 h-10 px-5 font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Plus className="h-4 w-4" />
              Habilitar Material
            </Button>
          </div>
        </div>

        {/* ── KPI Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="Valor Total del Inventario"
            value={`$${fmt(kpis.totalValue)}`}
            subtitle={`${inventory.length} materiales habilitados`}
            icon={<DollarSign />}
            iconColorClass="bg-procarni-blue/10 text-procarni-blue"
            delay={0}
          />
          <KpiCard
            title="Alertas de Stock Crítico"
            value={kpis.criticalCount}
            subtitle={kpis.criticalCount === 0 ? 'Sin alertas activas' : 'materiales bajo mínimo'}
            icon={<AlertTriangle />}
            iconColorClass={kpis.criticalCount > 0
              ? 'bg-procarni-primary/10 text-procarni-primary'
              : 'bg-procarni-secondary/10 text-procarni-secondary'}
            delay={0.1}
          />
          <KpiCard
            title="Último Cierre Contable"
            value={kpis.lastClosed
              ? kpis.lastClosed.period_name
              : 'Sin cierres'}
            subtitle={kpis.lastClosed
              ? format(new Date(kpis.lastClosed.closed_at ?? kpis.lastClosed.end_date), 'dd MMM yyyy', { locale: es })
              : 'Ningún periodo cerrado aún'}
            icon={<TrendingUp />}
            iconColorClass="bg-slate-100 text-slate-500"
            delay={0.2}
          />
        </div>

        {/* ── Main Card ────────────────────────────────────────────── */}
        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden"
        >
          {/* Subtle Light Top Bar */}
          <div className="bg-slate-50/80 backdrop-blur-sm px-7 py-5 border-b border-slate-100 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Package className="h-4 w-4 text-slate-600 flex-shrink-0" />
                <span className="text-sm font-extrabold text-slate-800 tracking-tight">
                  {verArchivados ? 'Materiales Archivados' : 'Materiales en Inventario'}
                </span>
                <span className="text-xs bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-full font-mono font-bold flex-shrink-0">
                  {filtered.length}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    id="stock-search"
                    placeholder="Buscar por SKU o nombre..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 h-9 text-sm w-56 focus-visible:ring-slate-200 focus-visible:border-slate-300"
                  />
                </div>
                <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl border border-slate-200/20">
                  {(['ALL', 'MPF', 'MPS', 'EMP', 'ETQ'] as const).map(cat => (
                    <button
                      key={cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200',
                        categoryFilter === cat
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
                      )}
                    >
                      {cat === 'ALL' ? 'Todos' : cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Second row: Archivados Switch & Stock Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <Switch
                  id="ver-archivados"
                  checked={verArchivados}
                  onCheckedChange={setVerArchivados}
                />
                <Label htmlFor="ver-archivados" className="text-xs font-bold uppercase tracking-widest text-gray-500 cursor-pointer">
                  Ver Archivados
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">Filtrar Stock:</span>
                <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl border border-slate-200/20">
                  {[
                    { value: 'ALL', label: 'Todos' },
                    { value: 'WITH_STOCK', label: 'Con Stock' },
                    { value: 'LOW_STOCK', label: 'Poco Stock' },
                    { value: 'NO_STOCK', label: 'Sin Stock' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setStockFilter(opt.value as 'ALL' | 'WITH_STOCK' | 'LOW_STOCK' | 'NO_STOCK')}
                      className={cn(
                        'px-3 py-1 rounded-lg text-xs font-bold transition-all duration-200',
                        stockFilter === opt.value
                          ? 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                          : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Table Container with Sticky Headers */}
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
            <Table>
              <TableHeader className="bg-slate-50/90 backdrop-blur-sm sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 pl-6 py-3 sticky top-0 bg-slate-50/90">SKU</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3 sticky top-0 bg-slate-50/90">Material</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3 sticky top-0 bg-slate-50/90">Categoría</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3 sticky top-0 bg-slate-50/90">Último Costo</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3 sticky top-0 bg-slate-50/90">CPP</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3 sticky top-0 bg-slate-50/90">Stock Actual</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3 sticky top-0 bg-slate-50/90">Unidad</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right pr-6 py-3 sticky top-0 bg-slate-50/90">Valor Stock</TableHead>
                  <TableHead className="py-3 sticky top-0 bg-slate-50/90" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-36 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Package className="h-7 w-7 opacity-30" />
                        </div>
                        <p className="text-sm">
                          {inventory.length === 0
                            ? 'Aún no hay materiales habilitados. ¡Habilita el primero!'
                            : 'Sin resultados para esa búsqueda o filtro.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((m: MaterialInventory, i) => {
                    const isLow = m.min_stock_alert > 0 && m.current_stock <= m.min_stock_alert;
                    const handleRowClick = () => navigate(`/inventory/material/${m.material_id}`);
                    
                    return (
                      <TableRow
                        key={m.material_id}
                        style={{
                          opacity: 0,
                          animation: `fadeSlideIn 0.35s ease forwards ${i * 0.03}s`,
                        }}
                        className={cn(
                          'group border-b border-slate-50 hover:bg-slate-50/80 transition-colors',
                          isLow && 'bg-amber-50/20 hover:bg-amber-50/40'
                        )}
                      >
                        <TableCell className="pl-6 py-4 cursor-pointer" onClick={handleRowClick}>
                          <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-2 py-0.5 rounded-md">{m.sku}</span>
                        </TableCell>
                        <TableCell className="py-4 cursor-pointer" onClick={handleRowClick}>
                          <div className="flex items-center gap-2">
                            {isLow && (
                              <span title="Stock bajo mínimo">
                                <AlertTriangle className="h-3.5 w-3.5 text-procarni-alert flex-shrink-0" />
                              </span>
                            )}
                            <span className="text-sm font-semibold text-slate-800">
                              {m.materials?.name ?? '—'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 cursor-pointer" onClick={handleRowClick}>
                          <CategoryBadge category={m.inventory_category} />
                        </TableCell>
                        <TableCell className="py-4 text-right font-mono text-sm text-slate-500 cursor-pointer" onClick={handleRowClick}>
                          ${fmt(m.last_purchase_price, 4)} / {m.unit}
                        </TableCell>
                        <TableCell className="py-4 text-right cursor-pointer" onClick={handleRowClick}>
                          <span className="font-mono text-sm font-bold text-slate-800">
                            ${fmt(m.average_unit_cost, 4)} / {m.unit}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right cursor-pointer" onClick={handleRowClick}>
                          <span className={cn(
                            'font-mono text-sm font-bold',
                            isLow ? 'text-procarni-alert' : 'text-procarni-secondary'
                          )}>
                            {fmt(m.current_stock, 2)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-500 cursor-pointer" onClick={handleRowClick}>{m.unit}</TableCell>
                        <TableCell className="pr-6 py-4 text-right cursor-pointer" onClick={handleRowClick}>
                          <span className="font-mono text-sm font-semibold text-slate-700">
                            ${fmt(m.total_value)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right pr-6">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-slate-100 rounded-lg">
                                <MoreVertical className="h-4 w-4 text-slate-500" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-100 shadow-xl rounded-xl p-1 z-50">
                              <DropdownMenuItem
                                onClick={handleRowClick}
                                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2 text-xs font-semibold"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                Ver Perfil
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={handleRowClick}
                                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2 text-xs font-semibold"
                              >
                                <Edit className="h-3.5 w-3.5 text-slate-500" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleOpenHistory(m)}
                                className="flex items-center gap-2 cursor-pointer text-slate-700 hover:bg-slate-50 rounded-lg px-3 py-2 text-xs font-semibold"
                              >
                                <History className="h-3.5 w-3.5 text-slate-500" />
                                Historial
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleToggleArchive(m)}
                                className="flex items-center gap-2 cursor-pointer text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-600 rounded-lg px-3 py-2 text-xs font-semibold border-t border-slate-100/50 mt-1"
                              >
                                <Archive className="h-3.5 w-3.5" />
                                {m.is_active ? 'Archivar' : 'Desarchivar'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Premium Footer with Pagination */}
          {filtered.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-slate-50/50 gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-2 text-xs text-slate-500 font-medium">
                <span>
                  Mostrando <span className="font-bold text-slate-700">{Math.min(filtered.length, (currentPage - 1) * 7 + 1)}</span> a{' '}
                  <span className="font-bold text-slate-700">{Math.min(filtered.length, currentPage * 7)}</span> de{' '}
                  <span className="font-bold text-slate-700">{filtered.length}</span> materiales
                </span>
                <span className="hidden sm:inline text-slate-300">|</span>
                <span className="font-bold text-procarni-dark">
                  Valor total en vista: ${fmt(filtered.reduce((a, m) => a + m.total_value, 0))}
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 text-xs font-semibold px-3 rounded-lg border-slate-200 hover:bg-white transition-colors"
                >
                  Anterior
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <Button
                      key={idx}
                      variant={currentPage === idx + 1 ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(idx + 1)}
                      className={cn(
                        "h-8 w-8 text-xs p-0 rounded-lg font-bold transition-all",
                        currentPage === idx + 1
                          ? "bg-procarni-blue hover:bg-procarni-blue/90 text-white shadow-md shadow-procarni-blue/10"
                          : "text-slate-600 hover:bg-white border-slate-200"
                      )}
                    >
                      {idx + 1}
                    </Button>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 text-xs font-semibold px-3 rounded-lg border-slate-200 hover:bg-white transition-colors"
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </m.div>

        {/* Modales */}
        <AnimatePresence>
          {modalOpen && (
            <HabilitarMaterialModal open={modalOpen} onClose={() => setModalOpen(false)} />
          )}
        </AnimatePresence>

        {/* Modal Historial (Placeholder Visual Premium) */}
        <Dialog open={historyModalOpen} onOpenChange={(v) => !v && setHistoryModalOpen(false)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border-none bg-white/95 backdrop-blur-xl shadow-2xl ring-1 ring-white p-6">
            <DialogHeader className="pb-4 border-b border-slate-100">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-procarni-blue">
                <History className="h-5 w-5 text-procarni-primary" />
                Historial de Transacciones: {selectedHistoryMaterial?.materials?.name ?? 'Material'}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 font-medium italic">
                Últimos movimientos del almacén para el SKU {selectedHistoryMaterial?.sku} (Prototipo Visual)
              </DialogDescription>
            </DialogHeader>

            {selectedHistoryMaterial && (
              <div className="space-y-5 mt-4">
                {/* Material Summary Header inside Modal */}
                <div className="grid grid-cols-3 gap-4 bg-slate-50 border border-slate-200/50 p-4 rounded-2xl text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">SKU</span>
                    <p className="font-mono font-bold text-procarni-dark mt-0.5">{selectedHistoryMaterial.sku}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stock Actual</span>
                    <p className="font-bold text-procarni-secondary mt-0.5">{fmt(selectedHistoryMaterial.current_stock, 2)} {selectedHistoryMaterial.unit}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">CPP</span>
                    <p className="font-mono font-bold text-slate-800 mt-0.5">${fmt(selectedHistoryMaterial.average_unit_cost, 4)}</p>
                  </div>
                </div>

                {/* Simulated Transactions Table */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50/50">
                      <TableRow>
                        <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3 pl-4">Fecha</TableHead>
                        <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">Tipo</TableHead>
                        <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3">Referencia</TableHead>
                        <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3 text-right">Cantidad</TableHead>
                        <TableHead className="font-bold text-[10px] uppercase tracking-wider text-slate-500 py-3 text-right pr-4">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[
                        { date: '2026-06-08T10:30:00Z', type: 'Entrada (Compra)', doc: 'OC-00452', qty: 500, balance: selectedHistoryMaterial.current_stock, user: 'Admin' },
                        { date: '2026-06-05T14:15:00Z', type: 'Salida (Producción)', doc: 'OP-02910', qty: -150, balance: selectedHistoryMaterial.current_stock - 500, user: 'Operador' },
                        { date: '2026-06-03T09:00:00Z', type: 'Ajuste (Merma)', doc: 'AJ-00102', qty: -2.5, balance: selectedHistoryMaterial.current_stock - 350, user: 'Supervisor' },
                        { date: '2026-05-28T16:45:00Z', type: 'Entrada Directa', doc: 'ED-00087', qty: 200, balance: selectedHistoryMaterial.current_stock - 347.5, user: 'Admin' },
                      ].map((tx, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/50 transition-colors border-b border-slate-50">
                          <TableCell className="py-3 text-[11px] text-slate-500 pl-4">{format(new Date(tx.date), 'dd/MM/yyyy HH:mm')}</TableCell>
                          <TableCell className="py-3 text-[11px] font-bold text-slate-700">{tx.type}</TableCell>
                          <TableCell className="py-3 text-[11px] font-mono text-slate-500">{tx.doc}</TableCell>
                          <TableCell className={cn("py-3 text-[11px] font-mono font-bold text-right", tx.qty > 0 ? "text-procarni-secondary" : "text-procarni-primary")}>
                            {tx.qty > 0 ? `+${fmt(tx.qty, 2)}` : fmt(tx.qty, 2)}
                          </TableCell>
                          <TableCell className="py-3 text-[11px] font-mono text-slate-700 text-right pr-4">{fmt(Math.max(0, tx.balance), 2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default StockGlobal;
