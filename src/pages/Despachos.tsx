import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import {
  Upload, FileJson, AlertTriangle, CheckCircle2, Loader2,
  Search, X, Plus, Factory, ShoppingBag, ArrowRight,
  Coins, PackageOpen, Info, Trash2
} from 'lucide-react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import {
  getMaterialsInventory,
  registrarSalidaProduccion,
  registrarSalidaVenta,
} from '@/integrations/supabase/services/inventoryService';
import {
  MaterialInventory,
  ProductionOrderJSON,
  SalidaProduccionItem,
} from '@/integrations/supabase/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const DEVIATION_WARN = 0.05; // 5%

interface DespachoRow {
  materialInventory: MaterialInventory;
  cantidadTeorica: number;
  cantidadReal: string;
  isSubstitute: boolean;
  replacesName?: string;
  originalMaterialId?: string;
}

// ─── JSON Drop Zone ───────────────────────────────────────────────────────────

interface JsonDropZoneProps {
  onParsed: (json: ProductionOrderJSON) => void;
  isLoaded: boolean;
  ordenId?: string;
  onClear: () => void;
}

const JsonDropZone = ({ onParsed, isLoaded, ordenId, onClear }: JsonDropZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (!json.orden_id || !Array.isArray(json.materiales_requeridos)) {
          throw new Error('El archivo no tiene el formato esperado de Orden de Producción.');
        }
        setError('');
        onParsed(json);
      } catch (err: any) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file?.name.endsWith('.json')) parseFile(file);
    else setError('Solo se aceptan archivos .json');
  }, []);

  if (isLoaded) {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
        <FileJson className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-bold text-emerald-800">Archivo cargado</p>
          <p className="text-xs text-emerald-600 font-mono">{ordenId}</p>
        </div>
        <button onClick={onClear} className="p-1 hover:bg-emerald-100 rounded-lg transition-colors">
          <X className="h-4 w-4 text-emerald-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all',
          dragging
            ? 'border-violet-400 bg-violet-50'
            : 'border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])}
        />
        <div className={cn(
          'rounded-2xl p-4 transition-colors',
          dragging ? 'bg-violet-100' : 'bg-slate-100'
        )}>
          <FileJson className={cn('h-10 w-10', dragging ? 'text-violet-500' : 'text-slate-400')} />
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">Arrastra el archivo de Orden de Producción</p>
          <p className="text-sm text-slate-400 mt-1">Formato .json — o haz clic para seleccionar</p>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
};

// ─── Flujo: Salida a Producción ───────────────────────────────────────────────

const SalidaProduccion = ({ inventory }: { inventory: MaterialInventory[] }) => {
  const queryClient = useQueryClient();
  const [orden, setOrden] = useState<ProductionOrderJSON | null>(null);
  const [rows, setRows] = useState<DespachoRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSubstitutePicker, setShowSubstitutePicker] = useState(false);
  const [substituteSearch, setSubstituteSearch] = useState('');

  const inventoryMap = useMemo(() => {
    const map = new Map<string, MaterialInventory>();
    inventory.forEach(m => map.set(m.material_id, m));
    return map;
  }, [inventory]);

  const handleOrdenParsed = (json: ProductionOrderJSON) => {
    setOrden(json);
    const newRows: DespachoRow[] = json.materiales_requeridos.map(item => {
      // Try to find by material_id first, fallback to name matching
      let mat = item.material_id ? inventoryMap.get(item.material_id) : undefined;
      if (!mat) {
        mat = inventory.find(m =>
          (m.materials?.name ?? '').toLowerCase().includes(item.nombre_material.toLowerCase())
        );
      }
      if (!mat) return null;
      return {
        materialInventory: mat,
        cantidadTeorica: item.cantidad_teorica,
        cantidadReal: String(item.cantidad_teorica),
        isSubstitute: false,
      };
    }).filter(Boolean) as DespachoRow[];
    setRows(newRows);
  };

  const totalDespachado = rows.reduce((a, r) => a + (parseFloat(r.cantidadReal) || 0), 0);
  const pesoTotal = orden?.peso_crudo_total_kg ?? 0;
  const deviationPct = pesoTotal > 0 ? Math.abs(totalDespachado - pesoTotal) / pesoTotal : 0;
  const isDeviationHigh = deviationPct > 0.10;

  const costTotal = rows.reduce((a, r) => {
    const qty = parseFloat(r.cantidadReal) || 0;
    return a + qty * r.materialInventory.average_unit_cost;
  }, 0);

  const setRowCantidad = (idx: number, val: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, cantidadReal: val } : r));
  };

  const addSubstitute = (mat: MaterialInventory) => {
    setRows(prev => [...prev, {
      materialInventory: mat,
      cantidadTeorica: 0,
      cantidadReal: '',
      isSubstitute: true,
    }]);
    setShowSubstitutePicker(false);
    setSubstituteSearch('');
  };

  const filteredForSubstitute = inventory.filter(m => {
    const q = substituteSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 15);

  const handleSubmit = async () => {
    if (!orden) return;
    const items: SalidaProduccionItem[] = rows
      .filter(r => parseFloat(r.cantidadReal) > 0)
      .map(r => ({
        material_id: r.materialInventory.material_id,
        cantidad_real: parseFloat(r.cantidadReal),
        cantidad_teorica: r.cantidadTeorica || undefined,
        material_original_id: r.originalMaterialId ?? null,
      }));

    if (items.length === 0) {
      toast.error('Ingresa las cantidades reales para al menos un material.');
      return;
    }

    setSubmitting(true);
    try {
      await registrarSalidaProduccion({
        p_orden_id: orden.orden_id,
        p_destination_data: {
          producto_fabricado: orden.producto_fabricado,
          presentacion: orden.presentacion,
          lotes_planificados: orden.lotes_planificados,
          peso_crudo_total_kg: orden.peso_crudo_total_kg,
        },
        p_items: items,
      });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success(`✅ Salida a producción registrada — Orden ${orden.orden_id} | Costo total: $${fmt(costTotal)}`);
      setOrden(null);
      setRows([]);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la salida de producción.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <JsonDropZone
        onParsed={handleOrdenParsed}
        isLoaded={!!orden}
        ordenId={orden?.orden_id}
        onClear={() => { setOrden(null); setRows([]); }}
      />

      {orden && (
        <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Capsule header */}
          <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl px-5 py-4 text-white">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Producto</p>
                <p className="font-bold">{orden.producto_fabricado}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Presentación</p>
                <p className="font-bold">{orden.presentacion}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Lotes</p>
                <p className="font-bold">{orden.lotes_planificados}</p>
              </div>
              <div>
                <p className="text-white/60 text-xs uppercase tracking-wider">Peso Crudo Total</p>
                <p className="font-bold">{fmt(pesoTotal)} kg</p>
              </div>
            </div>
          </div>

          {/* Deviation bar */}
          {pesoTotal > 0 && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-slate-500">Kg Despachados / Kg Planificados</span>
                <span className={isDeviationHigh ? 'text-red-600' : 'text-emerald-600'}>
                  {fmt(totalDespachado)} / {fmt(pesoTotal)} kg ({fmt(deviationPct * 100, 1)}%)
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    isDeviationHigh ? 'bg-red-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min((totalDespachado / pesoTotal) * 100, 100)}%` }}
                />
              </div>
              {isDeviationHigh && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  La desviación supera el 10%. Verifica las cantidades antes de confirmar.
                </p>
              )}
            </div>
          )}

          {/* Materials table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="pl-4 font-bold text-xs uppercase text-slate-500">Material</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500">SKU</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Teórico</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Real</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">CPP</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right pr-4">Costo Salida</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-slate-400 text-sm">
                      No se encontraron materiales del JSON en el inventario habilitado.
                    </TableCell>
                  </TableRow>
                ) : rows.map((row, idx) => {
                  const real = parseFloat(row.cantidadReal) || 0;
                  const teorico = row.cantidadTeorica;
                  const deviation = teorico > 0 ? Math.abs(real - teorico) / teorico : 0;
                  const isWarning = deviation > DEVIATION_WARN && !row.isSubstitute;
                  const costRow = real * row.materialInventory.average_unit_cost;

                  return (
                    <TableRow key={idx} className={cn(isWarning && 'bg-amber-50/60')}>
                      <TableCell className="pl-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{row.materialInventory.materials?.name}</p>
                          {row.isSubstitute && (
                            <Badge variant="outline" className="text-xs mt-0.5 text-violet-700 border-violet-200 bg-violet-50">
                              Sustituto
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="font-mono text-xs text-slate-500">{row.materialInventory.sku}</span>
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm text-slate-500">
                        {row.isSubstitute ? '—' : fmt(teorico)}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        <Input
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={row.cantidadReal}
                          onChange={e => setRowCantidad(idx, e.target.value)}
                          className={cn(
                            'w-24 h-8 text-right text-sm ml-auto',
                            isWarning && 'border-amber-400 bg-amber-50'
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-3 text-right font-mono text-sm text-slate-600">
                        ${fmt(row.materialInventory.average_unit_cost, 4)}
                      </TableCell>
                      <TableCell className="pr-4 py-3 text-right font-mono text-sm font-bold text-slate-800">
                        ${fmt(costRow)}
                      </TableCell>
                      <TableCell className="py-3">
                        {row.isSubstitute && (
                          <button onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 hover:bg-red-50 rounded transition-colors">
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Total cost + add substitute */}
          <div className="flex items-center justify-between">
            <Button
              id="btn-agregar-sustituto"
              variant="outline"
              size="sm"
              onClick={() => setShowSubstitutePicker(true)}
              className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
            >
              <Plus className="h-4 w-4" />
              Agregar Sustituto
            </Button>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Costo Total de Salida</p>
              <p className="font-black text-2xl text-slate-800 font-mono">${fmt(costTotal)}</p>
            </div>
          </div>

          {/* Substitute picker */}
          <AnimatePresence>
            {showSubstitutePicker && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="border border-violet-200 rounded-xl overflow-hidden bg-violet-50/50"
              >
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-violet-800 font-bold">Seleccionar material sustituto</Label>
                    <button onClick={() => setShowSubstitutePicker(false)}>
                      <X className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por SKU o nombre..."
                      value={substituteSearch}
                      onChange={e => setSubstituteSearch(e.target.value)}
                      className="pl-9 bg-white"
                      autoFocus
                    />
                  </div>
                  {substituteSearch && (
                    <div className="border rounded-lg divide-y bg-white max-h-40 overflow-y-auto">
                      {filteredForSubstitute.map(m => (
                        <button key={m.material_id} type="button"
                          onClick={() => addSubstitute(m)}
                          className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-bold text-xs text-slate-500 mr-2">{m.sku}</span>
                            <span className="text-sm font-semibold text-slate-800">{m.materials?.name}</span>
                          </div>
                          <span className="text-xs text-slate-400">Stock: {fmt(m.current_stock)} {m.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>

          <Button
            id="btn-confirmar-salida-produccion"
            onClick={handleSubmit}
            disabled={submitting || isDeviationHigh}
            className="w-full h-12 bg-violet-600 hover:bg-violet-700 text-white font-bold text-base"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Registrando salida...</>
              : <><Factory className="h-5 w-5 mr-2" />Confirmar Salida a Producción — Orden {orden.orden_id}</>
            }
          </Button>
        </m.div>
      )}
    </div>
  );
};

// ─── Flujo: Salida por Venta ──────────────────────────────────────────────────

const SalidaVenta = ({ inventory }: { inventory: MaterialInventory[] }) => {
  const queryClient = useQueryClient();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [cliente, setCliente] = useState('');
  const [saleReference, setSaleReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = inventory.filter(m => {
    const q = materialSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 20);

  const qty = parseFloat(cantidad) || 0;
  const costoSalida = selectedMaterial ? qty * selectedMaterial.average_unit_cost : 0;
  const stockSuficiente = !selectedMaterial || qty <= selectedMaterial.current_stock;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial || qty <= 0 || !cliente.trim() || !saleReference.trim()) {
      toast.error('Todos los campos son obligatorios para una salida por venta.');
      return;
    }
    if (!stockSuficiente) {
      toast.error(`Stock insuficiente. Disponible: ${fmt(selectedMaterial.current_stock)} ${selectedMaterial.unit}`);
      return;
    }
    setSubmitting(true);
    try {
      await registrarSalidaVenta({
        p_material_id: selectedMaterial.material_id,
        p_cantidad: qty,
        p_sale_reference: saleReference.trim(),
        p_cliente: cliente.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success(`✅ Salida por venta registrada — ${fmt(qty)} ${selectedMaterial.unit} de ${selectedMaterial.materials?.name}`);
      setSelectedMaterial(null);
      setMaterialSearch('');
      setCantidad('');
      setCliente('');
      setSaleReference('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la salida por venta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          <strong>Nota Contable:</strong> Se registra el <strong>Costo de Salida (CPP)</strong>, no el precio de venta al cliente.
          El precio de venta pertenece al módulo de facturación.
        </p>
      </div>

      {/* Material */}
      <div className="space-y-1.5">
        <Label>Material</Label>
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
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {filtered.map(m => (
                  <button key={m.material_id} type="button"
                    onClick={() => { setSelectedMaterial(m); setMaterialSearch(''); }}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-500 mr-2">{m.sku}</span>
                      <span className="text-sm font-semibold text-slate-800">{m.materials?.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">Stock: {fmt(m.current_stock)} {m.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-slate-500 font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-slate-800 flex-1">{selectedMaterial.materials?.name}</span>
            <span className="text-xs text-slate-500">Stock: {fmt(selectedMaterial.current_stock)} {selectedMaterial.unit}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="venta-cantidad">Cantidad *</Label>
          <Input
            id="venta-cantidad"
            type="number" min="0" step="0.01"
            placeholder="0.00"
            value={cantidad}
            onChange={e => setCantidad(e.target.value)}
            className={cn(!stockSuficiente && 'border-red-400 bg-red-50')}
          />
          {selectedMaterial && qty > 0 && (
            <p className={cn('text-xs', stockSuficiente ? 'text-emerald-600' : 'text-red-600')}>
              {stockSuficiente ? `✓ Stock suficiente` : `✗ Máx. ${fmt(selectedMaterial.current_stock)} ${selectedMaterial.unit}`}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="venta-referencia">Nro. Factura / Nota de Entrega *</Label>
          <Input id="venta-referencia" placeholder="FAC-0001" value={saleReference} onChange={e => setSaleReference(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="venta-cliente">Cliente *</Label>
        <Input id="venta-cliente" placeholder="Nombre del cliente..." value={cliente} onChange={e => setCliente(e.target.value)} />
      </div>

      {/* Financial indicator */}
      {selectedMaterial && qty > 0 && (
        <m.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900 rounded-xl px-5 py-4 flex items-center justify-between"
        >
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Costo de Salida (CPP)</p>
            <p className="text-xs text-slate-500 mt-0.5">≠ Precio de venta al cliente</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-black text-white">${fmt(costoSalida)}</p>
            <p className="text-xs text-slate-400 font-mono">{fmt(qty)} × ${fmt(selectedMaterial.average_unit_cost, 4)}</p>
          </div>
        </m.div>
      )}

      <Button
        id="btn-confirmar-salida-venta"
        type="submit"
        disabled={submitting || !selectedMaterial || !cantidad || !cliente || !saleReference || !stockSuficiente}
        className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold text-base"
      >
        {submitting
          ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Registrando venta...</>
          : <><ShoppingBag className="h-5 w-5 mr-2" />Confirmar Salida por Venta</>
        }
      </Button>
    </form>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type DespachoMode = 'produccion' | 'venta';

const Despachos = () => {
  const [mode, setMode] = useState<DespachoMode>('produccion');

  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: getMaterialsInventory,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <PackageOpen className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Despachos</h1>
        </div>
        <p className="text-sm text-slate-500 ml-8">Centro de operaciones de salidas del almacén</p>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-slate-100 border border-slate-200 rounded-xl p-1 flex gap-1">
          <button
            id="toggle-produccion"
            onClick={() => setMode('produccion')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all',
              mode === 'produccion'
                ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Factory className="h-4 w-4" />
            Salida a Producción
          </button>
          <button
            id="toggle-venta"
            onClick={() => setMode('venta')}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all',
              mode === 'venta'
                ? 'bg-amber-500 text-white shadow-md shadow-amber-200'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <ShoppingBag className="h-4 w-4" />
            Salida por Venta
          </button>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-300" />
        <Badge
          variant="outline"
          className={cn(
            'font-bold px-3 py-1',
            mode === 'produccion' ? 'border-violet-200 text-violet-700 bg-violet-50' : 'border-amber-200 text-amber-700 bg-amber-50'
          )}
        >
          {mode === 'produccion' ? 'Carga Mágica JSON' : 'Venta Directa'}
        </Badge>
      </div>

      <m.div
        key={mode}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl"
      >
        <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className={cn(
            'text-white px-6 py-5',
            mode === 'produccion'
              ? 'bg-gradient-to-r from-violet-700 to-indigo-600'
              : 'bg-gradient-to-r from-amber-600 to-orange-500'
          )}>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              {mode === 'produccion' ? <Factory className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
              {mode === 'produccion' ? 'Salida a Producción — Carga Mágica' : 'Salida por Venta Directa'}
            </CardTitle>
            <CardDescription className="text-white/70 text-sm">
              {mode === 'produccion'
                ? 'Carga el archivo JSON de la Orden de Producción para autocompletar la tabla'
                : 'Registra la salida valorizada al Costo Promedio Ponderado (CPP)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                {mode === 'produccion'
                  ? <SalidaProduccion key="produccion" inventory={inventory} />
                  : <SalidaVenta key="venta" inventory={inventory} />
                }
              </AnimatePresence>
            )}
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
};

export default Despachos;
