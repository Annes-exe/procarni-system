import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import { useDebounce } from 'use-debounce';
import {
  Warehouse, Plus, Search, AlertTriangle, TrendingUp,
  DollarSign, Package, ChevronRight, X, Loader2,
  BadgeCheck, Eye
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
  getMaterialsInventory,
  getMaterialsNotInInventory,
  enableMaterialForInventory,
  getInventoryFamilies,
  getInventoryPeriods,
} from '@/integrations/supabase/services/inventoryService';
import { InventoryCategory, MaterialInventory } from '@/integrations/supabase/types';

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
  const [selectedMaterial, setSelectedMaterial] = useState<{ id: string; name: string; code: string | null } | null>(null);
  const [category, setCategory] = useState<InventoryCategory | ''>('');
  const [unit, setUnit] = useState('kg');
  const [minStock, setMinStock] = useState('0');
  const [initialCost, setInitialCost] = useState('0');
  const [notes, setNotes] = useState('');

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
      toast.success(`✅ Material habilitado con SKU ${data.sku}`);
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleClose = () => {
    setSearch('');
    setSelectedMaterial(null);
    setCategory('');
    setUnit('kg');
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
                  onClick={() => setSelectedMaterial(m)}
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
                <Input id="inv-unit" value={unit} onChange={e => setUnit(e.target.value)} placeholder="kg" />
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
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | 'ALL'>('ALL');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: getMaterialsInventory,
  });

  const { data: periods = [] } = useQuery({
    queryKey: ['inventoryPeriods'],
    queryFn: getInventoryPeriods,
  });

  // KPIs
  const kpis = useMemo(() => {
    const totalValue = inventory.reduce((acc, m) => acc + m.total_value, 0);
    const criticalCount = inventory.filter(m => m.current_stock <= m.min_stock_alert && m.min_stock_alert > 0).length;
    const lastClosed = periods.find(p => p.status === 'CERRADO');
    return { totalValue, criticalCount, lastClosed };
  }, [inventory, periods]);

  // Filtered table
  const filtered = useMemo(() => {
    let result = inventory;
    if (categoryFilter !== 'ALL') result = result.filter(m => m.inventory_category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.sku.toLowerCase().includes(q) ||
        (m.materials?.name ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [inventory, categoryFilter, searchQuery]);

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
          <Button
            id="btn-habilitar-material"
            onClick={() => setModalOpen(true)}
            className="bg-procarni-secondary hover:bg-procarni-secondary/90 text-white shadow-lg shadow-procarni-secondary/20 gap-2 h-10 px-5 font-bold transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            Habilitar Material
          </Button>
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
          <div className="bg-slate-50/80 backdrop-blur-sm px-7 py-5 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Package className="h-4 w-4 text-slate-600 flex-shrink-0" />
                <span className="text-sm font-extrabold text-slate-800 tracking-tight">Materiales en Inventario</span>
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
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/70">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 pl-6 py-3">SKU</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Material</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Categoría</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">Último Costo</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">CPP</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">Stock Actual</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Unidad</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right pr-6 py-3">Valor Stock</TableHead>
                  <TableHead className="py-3" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-36 text-center text-slate-400">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Package className="h-7 w-7 opacity-30" />
                        </div>
                        <p className="text-sm">
                          {inventory.length === 0
                            ? 'Aún no hay materiales habilitados. ¡Habilita el primero!'
                            : 'Sin resultados para esa búsqueda.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((m: MaterialInventory, i) => {
                    const isLow = m.min_stock_alert > 0 && m.current_stock <= m.min_stock_alert;
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
                        <TableCell className="pl-6 py-4">
                          <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-2 py-0.5 rounded-md">{m.sku}</span>
                        </TableCell>
                        <TableCell className="py-4">
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
                        <TableCell className="py-4">
                          <CategoryBadge category={m.inventory_category} />
                        </TableCell>
                        <TableCell className="py-4 text-right font-mono text-sm text-slate-500">
                          ${fmt(m.last_purchase_price, 4)}
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <span className="font-mono text-sm font-bold text-slate-800">
                            ${fmt(m.average_unit_cost, 4)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-right">
                          <span className={cn(
                            'font-mono text-sm font-bold',
                            isLow ? 'text-procarni-alert' : 'text-procarni-secondary'
                          )}>
                            {fmt(m.current_stock, 2)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-slate-500">{m.unit}</TableCell>
                        <TableCell className="pr-6 py-4 text-right">
                          <span className="font-mono text-sm font-semibold text-slate-700">
                            ${fmt(m.total_value)}
                          </span>
                        </TableCell>
                        <TableCell className="py-4">
                          <Button
                            id={`btn-kardex-${m.material_id}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/inventory/kardex?materialId=${m.material_id}`)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 text-xs gap-1 text-procarni-blue hover:bg-procarni-blue/10 font-semibold"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Kardex
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 flex justify-between items-center bg-slate-50/50">
              <p className="text-xs text-slate-400">
                {filtered.length} de {inventory.length} materiales
              </p>
              <p className="text-xs font-bold text-procarni-dark">
                Valor filtrado: ${fmt(filtered.reduce((a, m) => a + m.total_value, 0))}
              </p>
            </div>
          )}
        </m.div>

        {/* Modal */}
        <AnimatePresence>
          {modalOpen && (
            <HabilitarMaterialModal open={modalOpen} onClose={() => setModalOpen(false)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default StockGlobal;
