import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import {
  Lock, Unlock, PlusCircle, TrendingDown, Loader2,
  Search, X, AlertTriangle, CheckCircle2, CalendarCheck,
  ClipboardList, Archive, History
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import {
  getInventoryPeriods,
  getAdjustmentReasons,
  getMaterialsInventory,
  crearPeriodoInventario,
  cerrarPeriodoInventario,
  registrarAjusteInventario,
  getKardex,
} from '@/integrations/supabase/services/inventoryService';
import { InventoryPeriod, MaterialInventory, InventoryTransaction, InventoryAdjustmentReason } from '@/integrations/supabase/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ─── Nuevo Periodo Modal ───────────────────────────────────────────────────────

interface NuevoPeriodoModalProps {
  open: boolean;
  onClose: () => void;
}

const NuevoPeriodoModal = ({ open, onClose }: NuevoPeriodoModalProps) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const { mutate, isPending } = useMutation({
    mutationFn: crearPeriodoInventario,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventoryPeriods'] });
      toast.success(`Periodo "${data.period_name}" creado correctamente.`);
      onClose();
      setName(''); setStartDate(''); setEndDate(''); setNotes('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startDate || !endDate) return;
    if (new Date(endDate) < new Date(startDate)) {
      toast.error('La fecha de fin debe ser posterior a la fecha de inicio.');
      return;
    }
    mutate({ period_name: name, start_date: startDate, end_date: endDate, notes: notes || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-emerald-600" />
            Crear Nuevo Periodo Contable
          </DialogTitle>
          <DialogDescription>
            Solo se pueden registrar transacciones dentro de un periodo ABIERTO.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="periodo-name">Nombre del Periodo *</Label>
            <Input
              id="periodo-name"
              placeholder="Ej: Junio 2025"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="periodo-start">Fecha Inicio *</Label>
              <Input id="periodo-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="periodo-end">Fecha Fin *</Label>
              <Input id="periodo-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="periodo-notes">Notas (opcional)</Label>
            <Textarea id="periodo-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <PlusCircle className="h-4 w-4 mr-2" />}
            Crear Periodo
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ─── Cierre de Periodo Modal ───────────────────────────────────────────────────

interface CierrePeriodoModalProps {
  period: InventoryPeriod | null;
  onClose: () => void;
}

const CierrePeriodoModal = ({ period, onClose }: CierrePeriodoModalProps) => {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: (id: string) => cerrarPeriodoInventario(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventoryPeriods'] });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success(`Periodo "${data.period_name}" cerrado. Snapshot generado.`);
      onClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!period) return null;

  return (
    <Dialog open={!!period} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <Lock className="h-5 w-5" />
            Cerrar Periodo Contable
          </DialogTitle>
          <DialogDescription>
            Una vez cerrado, no se podrán registrar transacciones con fecha dentro de este periodo.
            Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-bold mb-1">¿Confirmas el cierre del periodo?</p>
              <p className="font-semibold">{period.period_name}</p>
              <p className="text-red-600 text-xs mt-1">
                {format(new Date(period.start_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })} —{' '}
                {format(new Date(period.end_date + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}
              </p>
              <p className="text-red-600 text-xs mt-2">
                El sistema generará un snapshot del inventario al momento del cierre.
              </p>
            </div>
          </div>
          {!confirming ? (
            <Button
              id="btn-confirmar-cierre-periodo"
              onClick={() => setConfirming(true)}
              className="w-full h-9 bg-red-100 hover:bg-red-200 text-red-700 font-bold text-sm"
            >
              Entiendo, quiero proceder al cierre
            </Button>
          ) : (
            <Button
              id="btn-ejecutar-cierre-periodo"
              onClick={() => mutate(period.id)}
              disabled={isPending}
              className="w-full h-9 bg-red-600 hover:bg-red-700 text-white font-bold text-sm"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
              {isPending ? 'Cerrando periodo...' : 'Cerrar Definitivamente'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Tab: Periodos Contables ───────────────────────────────────────────────────

const TabPeriodos = () => {
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [periodToClose, setPeriodToClose] = useState<InventoryPeriod | null>(null);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['inventoryPeriods'],
    queryFn: getInventoryPeriods,
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          id="btn-nuevo-periodo"
          onClick={() => setNewModalOpen(true)}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
        >
          <PlusCircle className="h-4 w-4" />
          Nuevo Periodo
        </Button>
      </div>

      {/* Table Container (Desktop Only) */}
      <div className="hidden md:block border border-slate-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="pl-5 py-3 font-bold text-xs uppercase text-slate-500">Periodo</TableHead>
              <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Inicio</TableHead>
              <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Fin</TableHead>
              <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Estado</TableHead>
              <TableHead className="py-3 font-bold text-xs uppercase text-slate-500">Cerrado El</TableHead>
              <TableHead className="pr-5 py-3 font-bold text-xs uppercase text-slate-500">Notas</TableHead>
              <TableHead className="py-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : periods.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-slate-400 text-sm">
                  No hay periodos contables. Crea el primero.
                </TableCell>
              </TableRow>
            ) : periods.map(p => (
              <TableRow key={p.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-50">
                <TableCell className="pl-5 py-3 font-bold text-slate-800">{p.period_name}</TableCell>
                <TableCell className="py-3 text-sm font-mono text-slate-500">
                  {format(new Date(p.start_date + 'T12:00:00'), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="py-3 text-sm font-mono text-slate-500">
                  {format(new Date(p.end_date + 'T12:00:00'), 'dd/MM/yyyy')}
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-bold text-xs',
                      p.status === 'ABIERTO'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-300'
                    )}
                  >
                    {p.status === 'ABIERTO' ? <Unlock className="h-3 w-3 mr-1 inline" /> : <Lock className="h-3 w-3 mr-1 inline" />}
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-sm font-mono text-slate-400">
                  {p.closed_at
                    ? format(new Date(p.closed_at), 'dd/MM/yyyy HH:mm')
                    : '—'}
                </TableCell>
                <TableCell className="pr-5 py-3 text-xs text-slate-400 max-w-[180px] truncate">
                  {p.notes ?? '—'}
                </TableCell>
                <TableCell className="py-3">
                  {p.status === 'ABIERTO' && (
                    <Button
                      id={`btn-cerrar-periodo-${p.id}`}
                      variant="outline"
                      size="sm"
                      onClick={() => setPeriodToClose(p)}
                      className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Lock className="h-3 w-3" />
                      Cerrar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards Container (Mobile Only) */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 rounded-2xl border-slate-200"><Skeleton className="h-20 w-full" /></Card>
          ))
        ) : periods.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50/50 rounded-2xl border border-slate-100 text-slate-400">
            <ClipboardList className="h-8 w-8 opacity-30 mb-2" />
            <span className="text-sm">No hay periodos contables.</span>
          </div>
        ) : periods.map(p => (
          <Card key={p.id} className="relative overflow-hidden rounded-[1.25rem] border p-4 shadow-sm bg-white">
            <div className="flex justify-between items-start mb-3 gap-2">
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-bold text-[14px] text-procarni-blue line-clamp-1 leading-tight">
                  {p.period_name}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                    {format(new Date(p.start_date + 'T12:00:00'), 'dd/MM/yy')}
                  </span>
                  <span className="text-slate-400 text-[10px]">al</span>
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                    {format(new Date(p.end_date + 'T12:00:00'), 'dd/MM/yy')}
                  </span>
                </div>
              </div>
              <div className="flex-shrink-0">
                <Badge
                  variant="outline"
                  className={cn(
                    'font-bold text-[10px] px-1.5 py-0',
                    p.status === 'ABIERTO'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-500 border-slate-300'
                  )}
                >
                  {p.status === 'ABIERTO' ? <Unlock className="h-2.5 w-2.5 mr-1 inline" /> : <Lock className="h-2.5 w-2.5 mr-1 inline" />}
                  {p.status}
                </Badge>
              </div>
            </div>

            {p.notes && (
              <div className="text-[10px] text-slate-500 italic line-clamp-2 leading-tight bg-slate-50 p-1.5 rounded-lg border border-slate-100 mt-2">
                "{p.notes}"
              </div>
            )}

            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
              {p.status === 'ABIERTO' ? (
                <Button
                  id={`btn-cerrar-periodo-mob-${p.id}`}
                  variant="outline"
                  size="sm"
                  onClick={() => setPeriodToClose(p)}
                  className="h-8 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 w-full justify-center"
                >
                  <Lock className="h-3.5 w-3.5" /> Cerrar Periodo
                </Button>
              ) : (
                <div className="h-8 flex items-center justify-center w-full bg-slate-50 rounded-lg border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Cerrado el {p.closed_at ? format(new Date(p.closed_at), 'dd/MM/yy HH:mm') : '—'}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <NuevoPeriodoModal open={newModalOpen} onClose={() => setNewModalOpen(false)} />
      <CierrePeriodoModal period={periodToClose} onClose={() => setPeriodToClose(null)} />
    </div>
  );
};

// ─── Tab: Ajuste de Inventario (Pérdida) ─────────────────────────────────────

const TabAjusteNegativo = () => {
  const queryClient = useQueryClient();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [observacion, setObservacion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: inventory = [] } = useQuery<MaterialInventory[], Error>({
    queryKey: ['materialsInventory'],
    queryFn: () => getMaterialsInventory(),
  });

  const { data: reasons = [] } = useQuery<InventoryAdjustmentReason[], Error>({
    queryKey: ['adjustmentReasons', 'LOSS'],
    queryFn: () => getAdjustmentReasons('LOSS'),
  });

  const filtered = inventory.filter(m => {
    const q = materialSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 20);

  const qty = parseFloat(cantidad) || 0;
  const impacto = selectedMaterial ? qty * selectedMaterial.average_unit_cost : 0;
  const stockSuficiente = !selectedMaterial || qty <= selectedMaterial.current_stock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial || qty <= 0 || !reasonCode || !observacion.trim()) {
      toast.error('Completa todos los campos obligatorios.');
      return;
    }
    if (!stockSuficiente) {
      toast.error(`No puedes ajustar más del stock disponible: ${fmt(selectedMaterial.current_stock)} ${selectedMaterial.unit}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await registrarAjusteInventario({
        p_material_id: selectedMaterial.material_id,
        p_transaction_type: 'ADJUSTMENT_LOSS',
        p_cantidad: qty,
        p_reason_code: reasonCode,
        p_observacion: observacion.trim(),
        p_reference_doc: referencia.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['kardexEntries'] });
      toast.success(`Ajuste de pérdida registrado — Impacto: -$${fmt(Math.abs(res.impacto_financiero))}`);
      setSelectedMaterial(null);
      setMaterialSearch('');
      setCantidad('');
      setReasonCode('');
      setObservacion('');
      setReferencia('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar el ajuste.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
        <strong>Ajuste de Pérdida:</strong> Úsalo para deshidratación, deterioro/daño o faltantes de conteo físico.
        El impacto financiero se valoriza al CPP del material.
      </div>

      {/* Material */}
      <div className="space-y-1.5">
        <Label>Material *</Label>
        {!selectedMaterial ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por SKU o nombre..."
                value={materialSearch}
                onChange={e => setMaterialSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {materialSearch && (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto bg-white">
                {filtered.map(m => (
                  <button key={m.material_id} type="button"
                    onClick={() => { setSelectedMaterial(m); setMaterialSearch(''); }}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-500 mr-2">{m.sku}</span>
                      <span className="text-sm font-semibold text-slate-800">{m.materials?.name}</span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <p className="text-xs text-slate-400">Stock: {fmt(m.current_stock)} {m.unit}</p>
                      <p className="text-xs text-slate-400 font-mono">CPP: ${fmt(m.average_unit_cost, 4)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-red-600 font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-red-800 flex-1">{selectedMaterial.materials?.name}</span>
            <span className="text-xs text-red-500">Stock: {fmt(selectedMaterial.current_stock)} {selectedMaterial.unit}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-red-400 hover:text-red-700" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="loss-cantidad">Cantidad a Restar *</Label>
          <Input
            id="loss-cantidad"
            type="number" min="0" step="0.01"
            placeholder="0.00"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            className={cn(!stockSuficiente && 'border-red-400 bg-red-50')}
          />
          {selectedMaterial && qty > 0 && !stockSuficiente && (
            <p className="text-xs text-red-600">Stock insuficiente (máx. {fmt(selectedMaterial.current_stock)})</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loss-motivo">Motivo *</Label>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger id="loss-motivo">
              <SelectValue placeholder="Selecciona motivo..." />
            </SelectTrigger>
            <SelectContent>
              {(reasons as any[]).map((r: any) => (
                <SelectItem key={r.code} value={r.code}>{r.description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loss-referencia">Referencia (opcional)</Label>
        <Input id="loss-referencia" placeholder="Nro. acta, informe..." value={referencia} onChange={e => setReferencia(e.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="loss-obs">Observación detallada *</Label>
        <Textarea
          id="loss-obs"
          placeholder="Describe con detalle qué ocurrió, cuándo y por qué..."
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          rows={3}
          required
        />
      </div>

      {/* Financial impact preview */}
      {selectedMaterial && qty > 0 && (
        <m.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-red-900 rounded-xl px-5 py-4 flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-red-300 uppercase tracking-wider">Impacto Financiero Estimado</p>
            <p className="text-xs text-red-400 mt-0.5">{fmt(qty)} {selectedMaterial.unit} × ${fmt(selectedMaterial.average_unit_cost, 4)} CPP</p>
          </div>
          <p className="font-mono text-2xl font-black text-red-200">-${fmt(impacto)}</p>
        </m.div>
      )}

      <Button
        id="btn-confirmar-ajuste-negativo"
        type="submit"
        disabled={submitting || !selectedMaterial || !cantidad || !reasonCode || !observacion.trim() || !stockSuficiente}
        className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
        {submitting ? 'Registrando...' : 'Confirmar Ajuste de Pérdida'}
      </Button>
    </form>
  );
};

// ─── Historial de Ajustes Recientes (Kardex) ──────────────────────────────────

interface ProfileData {
  id: string;
  username: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

const RecentLossAdjustmentsCard = () => {
  const { data: recentEntries = [], isLoading: loadingEntries } = useQuery<InventoryTransaction[]>({
    queryKey: ['kardexEntries'],
    queryFn: () => getKardex({ types: ['ADJUSTMENT_LOSS', 'ADJUSTMENT_MANUAL'], limit: 10 }),
  });

  const { data: profiles = [] } = useQuery<ProfileData[]>({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email, first_name, last_name');
      if (error) throw error;
      return (data ?? []) as ProfileData[];
    }
  });

  const { data: reasons = [] } = useQuery<InventoryAdjustmentReason[]>({
    queryKey: ['adjustmentReasons', 'LOSS'],
    queryFn: () => getAdjustmentReasons('LOSS'),
  });

  const reasonMap = useMemo(() => {
    const map = new Map<string, string>();
    reasons.forEach((r) => {
      map.set(r.code, r.description);
    });
    return map;
  }, [reasons]);

  const profileMap = useMemo(() => {
    const map = new Map<string, string>();
    profiles.forEach((p) => {
      let name = p.username;
      if (!name) {
        if (p.first_name || p.last_name) {
          name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        } else if (p.email) {
          name = p.email.split('@')[0];
          name = name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
      map.set(p.id, name || 'Desconocido');
    });
    return map;
  }, [profiles]);

  return (
    <m.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/80 backdrop-blur-sm px-7 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <History className="h-5 w-5 text-procarni-blue" />
            <div>
              <CardTitle className="text-slate-800 font-extrabold text-base leading-tight">
                Ajustes de Pérdida Recientes
              </CardTitle>
              <CardDescription className="text-slate-500 text-xs mt-0.5">
                Historial de los últimos 10 ajustes de pérdida y manuales registrados en Kardex
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingEntries ? (
            <div className="p-8 space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : recentEntries.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No se han registrado ajustes de pérdida recientemente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 pl-6 py-3 whitespace-nowrap">Fecha</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3">Material / SKU</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3">Motivo</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3">Referencia</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3 text-right">Cantidad</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3 text-right">Impacto Financiero</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3">Usuario</TableHead>
                    <TableHead className="font-bold text-xs uppercase text-slate-500 py-3 pr-6">Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEntries.map((tx: InventoryTransaction) => {
                    const name = tx.materials_inventory?.materials?.name ?? '—';
                    const sku = tx.materials_inventory?.sku ?? '—';
                    const unit = tx.materials_inventory?.unit ?? '';
                    const reasonDesc = tx.reason_code ? (reasonMap.get(tx.reason_code) ?? tx.reason_code) : '—';
                    const userDisplay = tx.created_by ? (profileMap.get(tx.created_by) ?? 'Usuario') : 'Sistema';

                    return (
                      <TableRow key={tx.id} className="hover:bg-slate-50/30 transition-colors border-b border-slate-50">
                        <TableCell className="pl-6 text-sm text-slate-600 font-mono whitespace-nowrap">
                          {format(new Date(tx.transaction_date), 'dd/MM/yyyy HH:mm', { locale: es })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{name}</p>
                            <span className="font-mono text-xs text-slate-500 font-bold bg-slate-100 rounded px-1.5 py-0.5">
                              {sku}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-slate-700">
                          {reasonDesc}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-slate-600 font-bold">
                          {tx.reference_doc ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm font-bold text-red-650 whitespace-nowrap">
                            -{fmt(Math.abs(tx.quantity))} {unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-sm font-black text-red-600 whitespace-nowrap">
                            -${fmt(Math.abs(tx.total_cost), 2)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-xs font-semibold text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 whitespace-nowrap">
                            {userDisplay}
                          </span>
                        </TableCell>
                        <TableCell className="pr-6 max-w-[200px] text-xs text-slate-500 truncate" title={tx.audit_note ?? ''}>
                          {tx.audit_note ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </m.div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const CierresYAjustes = () => {
  const [activeTab, setActiveTab] = useState<'periodos' | 'ajuste-negativo'>('periodos');

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
      <div className="container mx-auto space-y-6 pb-20">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 leading-none">
            <Archive className="h-6 w-6 text-slate-700" />
            <h1 className="text-[30px] font-black text-slate-800 tracking-tighter">
              Cierres y Ajustes
            </h1>
          </div>
          <p className="text-[13px] text-gray-500 font-medium italic ml-8">
            Gestión de periodos contables y ajustes manuales de inventario
          </p>
        </div>

        <m.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            {/* Top Bar with integrated tab toggle */}
            <div className="bg-slate-50/80 backdrop-blur-sm px-7 py-5 border-b border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {activeTab === 'periodos' && <CalendarCheck className="h-5 w-5 text-slate-600 flex-shrink-0" />}
                  {activeTab === 'ajuste-negativo' && <TrendingDown className="h-5 w-5 text-red-600 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-slate-800 font-extrabold text-base leading-tight">
                      {activeTab === 'periodos' && 'Periodos Contables de Inventario'}
                      {activeTab === 'ajuste-negativo' && 'Ajuste de Pérdida Operativa'}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5 truncate">
                      {activeTab === 'periodos' && 'Apertura y cierre de periodos para control de inventario y snapshot de costos'}
                      {activeTab === 'ajuste-negativo' && 'Disminuye el stock de un material por merma, daño, pérdida u obsolescencia'}
                    </p>
                  </div>
                </div>
                {/* Toggle tabs inside top-bar */}
                <div className="flex gap-1 bg-slate-200/50 p-1 rounded-xl flex-shrink-0 border border-slate-200/20">
                  <button
                    id="tab-periodos"
                    onClick={() => setActiveTab('periodos')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                      activeTab === 'periodos'
                        ? 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
                    )}
                  >
                    <CalendarCheck className="h-4 w-4" />
                    Periodos
                  </button>
                  <button
                    id="tab-ajuste-negativo"
                    onClick={() => setActiveTab('ajuste-negativo')}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                      activeTab === 'ajuste-negativo'
                        ? 'bg-white text-red-700 shadow-sm border border-red-200/40'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-white/40'
                    )}
                  >
                    <TrendingDown className="h-4 w-4" />
                    Ajuste de Pérdida
                  </button>
                </div>
              </div>
            </div>

            <CardContent className="p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'periodos' && (
                  <m.div key="periodos" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    <TabPeriodos />
                  </m.div>
                )}
                {activeTab === 'ajuste-negativo' && (
                  <m.div key="ajuste-negativo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                    <TabAjusteNegativo />
                  </m.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </m.div>

        {activeTab === 'ajuste-negativo' && <RecentLossAdjustmentsCard />}
      </div>
    </div>
  );
};

export default CierresYAjustes;
