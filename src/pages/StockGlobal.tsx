import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
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
  MPF: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200' },
  MPS: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
  EMP: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  ETQ: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
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
  gradientClass: string;
  delay?: number;
}

const KpiCard = ({ title, value, subtitle, icon, gradientClass, delay = 0 }: KpiCardProps) => (
  <m.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: 'easeOut' }}
  >
    <Card className={cn('relative overflow-hidden border-0 shadow-lg', gradientClass)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/70">{title}</p>
            <div className="text-3xl font-black text-white leading-none truncate">{value}</div>
            {subtitle && <p className="text-xs text-white/60 mt-1">{subtitle}</p>}
          </div>
          <div className="flex-shrink-0 ml-3 bg-white/20 rounded-xl p-3">
            {React.cloneElement(icon as React.ReactElement, { className: 'h-6 w-6 text-white' })}
          </div>
        </div>
        {/* Decorative circle */}
        <div className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full bg-white/10" />
      </CardContent>
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
    queryKey: ['materialsNotInInventory'],
    queryFn: getMaterialsNotInInventory,
    enabled: open,
  });

  const filteredCandidates = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return candidates.slice(0, 30);
    return candidates.filter(
      m => m.name.toLowerCase().includes(q) || (m.code ?? '').toLowerCase().includes(q)
    ).slice(0, 30);
  }, [candidates, search]);

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
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <BadgeCheck className="h-5 w-5 text-emerald-600" />
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
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <Package className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <span className="text-sm font-bold text-emerald-800 flex-1">{selectedMaterial.name}</span>
              <button type="button" onClick={() => setSelectedMaterial(null)}>
                <X className="h-4 w-4 text-emerald-500 hover:text-emerald-700" />
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
                className="bg-gray-900 rounded-lg px-4 py-3 flex items-center justify-between"
              >
                <span className="text-xs text-gray-400 uppercase tracking-wider">SKU que se asignará</span>
                <span className="font-mono font-black text-xl text-emerald-400">{nextSku}</span>
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
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-11 font-bold text-sm"
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
      {Array.from({ length: 8 }).map((_, i) => (
        <TableCell key={i}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6 pb-24">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Warehouse className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
              Stock Global
            </h1>
          </div>
          <p className="text-sm text-slate-500 ml-8">
            Centro de mando del inventario Procarni
          </p>
        </div>
        <Button
          id="btn-habilitar-material"
          onClick={() => setModalOpen(true)}
          className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-lg shadow-emerald-200 gap-2 h-11 font-bold"
        >
          <Plus className="h-4 w-4" />
          Habilitar Material
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <KpiCard
          title="Valor Total del Inventario"
          value={`$${fmt(kpis.totalValue)}`}
          subtitle={`${inventory.length} materiales habilitados`}
          icon={<DollarSign />}
          gradientClass="bg-gradient-to-br from-slate-800 to-slate-700"
          delay={0}
        />
        <KpiCard
          title="Alertas de Stock Crítico"
          value={kpis.criticalCount}
          subtitle={kpis.criticalCount === 0 ? 'Sin alertas activas' : 'materiales bajo mínimo'}
          icon={<AlertTriangle />}
          gradientClass={kpis.criticalCount > 0
            ? 'bg-gradient-to-br from-red-600 to-rose-500'
            : 'bg-gradient-to-br from-emerald-600 to-emerald-500'}
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
          gradientClass="bg-gradient-to-br from-violet-600 to-indigo-600"
          delay={0.2}
        />
      </div>

      {/* Table Section */}
      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        {/* Table Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              id="stock-search"
              placeholder="Buscar por SKU o nombre..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 h-9"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'MPF', 'MPS', 'EMP', 'ETQ'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                  categoryFilter === cat
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                )}
              >
                {cat === 'ALL' ? 'Todos' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 pl-5 py-3">SKU</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Material</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Categoría</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">Último Costo</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">CPP</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right py-3">Stock Actual</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 py-3">Unidad</TableHead>
                <TableHead className="font-bold text-xs uppercase tracking-wider text-slate-500 text-right pr-5 py-3">Valor Stock</TableHead>
                <TableHead className="py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="h-8 w-8 opacity-30" />
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
                        isLow && 'bg-red-50/40'
                      )}
                    >
                      <TableCell className="pl-5 py-3">
                        <span className="font-mono font-bold text-sm text-slate-700">{m.sku}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          {isLow && (
                            <span title="Stock bajo mínimo">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                            </span>
                          )}
                          <span className="text-sm font-semibold text-slate-800">
                            {m.materials?.name ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <CategoryBadge category={m.inventory_category} />
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm text-slate-600">
                        ${fmt(m.last_purchase_price, 4)}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className="font-mono text-sm font-bold text-slate-800">
                          ${fmt(m.average_unit_cost, 4)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className={cn(
                          'font-mono text-sm font-bold',
                          isLow ? 'text-red-600' : 'text-emerald-700'
                        )}>
                          {fmt(m.current_stock, 2)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-500">{m.unit}</TableCell>
                      <TableCell className="pr-5 py-3 text-right">
                        <span className="font-mono text-sm font-semibold text-slate-700">
                          ${fmt(m.total_value)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Button
                          id={`btn-kardex-${m.material_id}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/inventory/kardex?materialId=${m.material_id}`)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs gap-1 text-slate-500"
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
          <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center">
            <p className="text-xs text-slate-400">
              {filtered.length} de {inventory.length} materiales
            </p>
            <p className="text-xs font-bold text-slate-700">
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
  );
};

export default StockGlobal;
