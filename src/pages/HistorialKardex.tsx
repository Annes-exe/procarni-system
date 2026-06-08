import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { m, AnimatePresence } from 'framer-motion';
import {
  ScrollText, Search, Filter,
  RotateCcw, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  getMaterialsInventory,
  getKardex,
  registrarReversoInventario,
} from '@/integrations/supabase/services/inventoryService';
import { InventoryTransaction, InventoryTransactionType } from '@/integrations/supabase/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const TX_CONFIG: Record<InventoryTransactionType, { label: string; bg: string; text: string; border: string }> = {
  IN_PURCHASE:      { label: 'Entrada OC',      bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200' },
  IN_DIRECT:        { label: 'Entrada Directa',  bg: 'bg-teal-50',     text: 'text-teal-700',     border: 'border-teal-200' },
  OUT_PRODUCTION:   { label: 'Producción',        bg: 'bg-violet-50',   text: 'text-violet-700',   border: 'border-violet-200' },
  ADJUSTMENT_LOSS:  { label: 'Merma / Pérdida',  bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200' },
  ADJUSTMENT_ADD:   { label: 'Ajuste Positivo',  bg: 'bg-sky-50',      text: 'text-sky-700',      border: 'border-sky-200' },
  ADJUSTMENT_MANUAL:{ label: 'Ajuste Manual',    bg: 'bg-orange-50',   text: 'text-orange-700',   border: 'border-orange-200' },
  OUT_SALE:         { label: 'Venta Directa',    bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200' },
  REVERSAL:         { label: 'REVERSO',           bg: 'bg-slate-100',   text: 'text-slate-600',    border: 'border-slate-300' },
};

const TxBadge = ({ type }: { type: InventoryTransactionType }) => {
  const cfg = TX_CONFIG[type] ?? TX_CONFIG.ADJUSTMENT_MANUAL;
  return (
    <Badge variant="outline" className={cn('font-bold text-xs border', cfg.bg, cfg.text, cfg.border)}>
      {cfg.label}
    </Badge>
  );
};

// ─── Reverso Modal ─────────────────────────────────────────────────────────────

interface ReversoModalProps {
  transaction: InventoryTransaction | null;
  onClose: () => void;
}

const ReversoModal = ({ transaction, onClose }: ReversoModalProps) => {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction || !motivo.trim()) return;
    setSubmitting(true);
    try {
      await registrarReversoInventario(transaction.id, motivo.trim());
      queryClient.invalidateQueries({ queryKey: ['kardex'] });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success('✅ Reverso de auditoría emitido correctamente.');
      setMotivo('');
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al emitir el reverso.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!transaction) return null;

  const cfg = TX_CONFIG[transaction.transaction_type];

  return (
    <Dialog open={!!transaction} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <RotateCcw className="h-5 w-5" />
            Emitir Reverso de Auditoría
          </DialogTitle>
          <DialogDescription>
            Esta acción crea una transacción compensatoria que anula el efecto de la transacción original.
            No se modifica ni elimina el registro original — el Kardex es inmutable.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Tipo</span>
            <TxBadge type={transaction.transaction_type} />
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Material</span>
            <span className="font-semibold text-slate-800">{transaction.materials_inventory?.materials?.name ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Cantidad</span>
            <span className={cn('font-mono font-bold', transaction.quantity > 0 ? 'text-emerald-700' : 'text-red-700')}>
              {transaction.quantity > 0 ? '+' : ''}{fmt(transaction.quantity)} {transaction.materials_inventory?.unit}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Fecha</span>
            <span className="font-mono text-slate-700">{format(new Date(transaction.transaction_date), 'dd/MM/yyyy HH:mm')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Referencia</span>
            <span className="font-mono text-xs text-slate-600">{transaction.reference_doc ?? '—'}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reverso-motivo" className="text-red-700 font-semibold">
              Justificación del Reverso *
            </Label>
            <Textarea
              id="reverso-motivo"
              placeholder="Describe el motivo exacto por el que se está reversando esta transacción..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={4}
              required
              className="border-red-200 focus:ring-red-300"
            />
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || !motivo.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {submitting ? 'Emitiendo...' : 'Emitir Reverso'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const HistorialKardex = () => {
  const [searchParams] = useSearchParams();
  const initialMaterialId = searchParams.get('materialId') ?? '';

  const [materialFilter, setMaterialFilter] = useState(initialMaterialId);
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [txToReverse, setTxToReverse] = useState<InventoryTransaction | null>(null);
  const [materialSearch, setMaterialSearch] = useState('');

  const { data: inventory = [] } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: getMaterialsInventory,
  });

  const filters = useMemo(() => ({
    materialId: materialFilter || undefined,
    type: typeFilter !== 'ALL' ? typeFilter : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: 200,
  }), [materialFilter, typeFilter, startDate, endDate]);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['kardex', filters],
    queryFn: () => getKardex(filters),
  });

  // Reverse lookup: which tx IDs have a reversal
  const reversedTxIds = useMemo(() => {
    const s = new Set<string>();
    transactions.forEach(tx => { if (tx.reverses_id) s.add(tx.reverses_id); });
    return s;
  }, [transactions]);

  const filteredInventory = inventory.filter(m => {
    const q = materialSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 20);

  const selectedMaterialName = inventory.find(m => m.material_id === materialFilter)?.materials?.name ?? '';

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      <div className="container mx-auto space-y-6 pb-20">
        {/* ── Page Header ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1">
          <h1 className="text-[30px] font-black text-procarni-blue tracking-tighter leading-none">
            Historial Kardex
          </h1>
          <p className="text-[13px] text-gray-500 font-medium italic">
            Auditoría completa e inmutable de todas las transacciones de inventario
          </p>
        </div>

      {/* Filters */}
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-700">Filtros</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Material filter with search */}
          <div className="relative space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label>Material</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                id="kardex-material-search"
                placeholder="Buscar material..."
                value={materialSearch || selectedMaterialName}
                onChange={e => {
                  setMaterialSearch(e.target.value);
                  if (!e.target.value) setMaterialFilter('');
                }}
                className="pl-9"
              />
            </div>
            {materialSearch && (
              <div className="absolute z-10 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto w-64">
                <button
                  type="button"
                  onClick={() => { setMaterialFilter(''); setMaterialSearch(''); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
                >
                  Todos los materiales
                </button>
                {filteredInventory.map(m => (
                  <button
                    key={m.material_id}
                    type="button"
                    onClick={() => {
                      setMaterialFilter(m.material_id);
                      setMaterialSearch('');
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <span className="font-mono text-xs text-slate-400">{m.sku}</span>
                    <span className="text-sm text-slate-800">{m.materials?.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type filter */}
          <div className="space-y-1.5">
            <Label>Tipo de Transacción</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="kardex-type-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los tipos</SelectItem>
                {(Object.keys(TX_CONFIG) as InventoryTransactionType[]).map(t => (
                  <SelectItem key={t} value={t}>{TX_CONFIG[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="space-y-1.5">
            <Label htmlFor="kardex-start">Desde</Label>
            <Input id="kardex-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kardex-end">Hasta</Label>
            <Input id="kardex-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </m.div>

      {/* Table */}
      <m.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">
            {isLoading ? 'Cargando...' : `${transactions.length} transacción(es)`}
          </p>
          {materialFilter && (
            <Badge variant="outline" className="text-xs font-semibold">
              {selectedMaterialName}
            </Badge>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="pl-5 py-3 font-bold text-xs uppercase text-slate-500 whitespace-nowrap">Fecha</TableHead>
                <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">SKU</TableHead>
                <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Material</TableHead>
                <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Tipo</TableHead>
                <TableHead className="py-3 text-right font-bold text-xs uppercase text-slate-500">Cantidad</TableHead>
                <TableHead className="py-3 text-right font-bold text-xs uppercase text-slate-500">Costo Unit.</TableHead>
                <TableHead className="py-3 text-right font-bold text-xs uppercase text-slate-500">Costo Total</TableHead>
                <TableHead className="py-3 text-right font-bold text-xs uppercase text-slate-500 whitespace-nowrap">Stock Post-TX</TableHead>
                <TableHead className="py-3 text-right font-bold text-xs uppercase text-slate-500">CPP Post-TX</TableHead>
                <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Referencia</TableHead>
                <TableHead className="pr-5 py-3 font-bold text-xs uppercase text-slate-500">Nota</TableHead>
                <TableHead className="py-3" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <ScrollText className="h-8 w-8 opacity-30" />
                      <p className="text-sm">Sin transacciones para los filtros seleccionados.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map(tx => {
                  const isReversed = reversedTxIds.has(tx.id);
                  const isReversal = tx.transaction_type === 'REVERSAL';
                  const canReverse = !isReversal && !isReversed;

                  return (
                    <TableRow
                      key={tx.id}
                      className={cn(
                        'border-b border-slate-50 transition-colors hover:bg-slate-50/60',
                        isReversed && 'opacity-50 line-through',
                        isReversal && 'bg-slate-50/80 italic'
                      )}
                    >
                      <TableCell className="pl-5 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                        {format(new Date(tx.transaction_date), 'dd/MM/yy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="font-mono text-xs text-slate-500">
                          {tx.materials_inventory?.sku ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-semibold text-slate-800 max-w-[160px] truncate">
                        {tx.materials_inventory?.materials?.name ?? '—'}
                      </TableCell>
                      <TableCell className="py-3">
                        <TxBadge type={tx.transaction_type} />
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <span className={cn(
                          'font-mono text-sm font-bold',
                          tx.quantity > 0 ? 'text-emerald-700' : 'text-red-600'
                        )}>
                          {tx.quantity > 0 ? '+' : ''}{fmt(tx.quantity)} {tx.materials_inventory?.unit}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-xs text-slate-500">
                        ${fmt(tx.unit_cost, 4)}
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm font-bold text-slate-700">
                        ${fmt(Math.abs(tx.total_cost))}
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm text-slate-700">
                        {tx.stock_after != null ? fmt(tx.stock_after) : '—'}
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-xs text-slate-500">
                        {tx.avg_cost_after != null ? `$${fmt(tx.avg_cost_after, 4)}` : '—'}
                      </TableCell>
                      <TableCell className="py-3 max-w-[120px]">
                        <span className="text-xs font-mono text-slate-500 truncate block" title={tx.reference_doc ?? ''}>
                          {tx.reference_doc ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="pr-5 py-3 max-w-[200px]">
                        <span className="text-xs text-slate-500 line-clamp-2" title={tx.audit_note ?? ''}>
                          {tx.audit_note ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        {canReverse && (
                          <Button
                            id={`btn-reversar-${tx.id}`}
                            variant="ghost"
                            size="sm"
                            onClick={() => setTxToReverse(tx)}
                            className="h-7 text-xs gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 whitespace-nowrap"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reversar
                          </Button>
                        )}
                        {isReversed && (
                          <span className="text-xs text-slate-400 italic">Reversado</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </m.div>

      {/* Reverso Modal */}
      <AnimatePresence>
        {txToReverse && (
          <ReversoModal
            transaction={txToReverse}
            onClose={() => setTxToReverse(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default HistorialKardex;
