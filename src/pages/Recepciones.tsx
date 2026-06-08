import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  PackagePlus, Download, Clipboard, AlertTriangle, CheckCircle2,
  Upload, X, Image as ImageIcon, Loader2, Search, Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import {
  getMaterialsInventory,
  getPurchaseOrdersAprobadas,
  getPurchaseOrderItemsHabilitados,
  getAdjustmentReasons,
  registrarRecepcion,
  registrarAjusteInventario,
  getRegisteredOCReferences,
  enableMaterialForInventory,
  getInventoryFamilies,
} from '@/integrations/supabase/services/inventoryService';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { OrderDocumentService } from '@/integrations/supabase/services/orderDocumentService';
import { MaterialInventory } from '@/integrations/supabase/types';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

interface MermaIndicatorProps {
  guia: number;
  recibido: number;
}
const MermaIndicator = ({ guia, recibido }: MermaIndicatorProps) => {
  const merma = guia - recibido;
  const pct = guia > 0 ? (merma / guia) * 100 : 0;
  if (merma <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
      <AlertTriangle className="h-3 w-3" />
      Merma: {fmt(merma, 2)} ({fmt(pct, 1)}%)
    </span>
  );
};

// ─── Zona de Evidencia ────────────────────────────────────────────────────────

interface EvidenceZoneProps {
  file: File | null;
  previewUrl: string | null;
  onFileSelected: (f: File | null) => void;
  label?: string;
}

const EvidenceZone = ({ file, previewUrl, onFileSelected, label = 'Foto de factura o nota de entrega' }: EvidenceZoneProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFileSelected(f);
  }, [onFileSelected]);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-xl transition-all cursor-pointer min-h-[90px]',
          'flex items-center justify-center overflow-hidden',
          dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white',
          file ? 'cursor-default' : 'cursor-pointer'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={e => onFileSelected(e.target.files?.[0] ?? null)}
        />
        {!file ? (
          <div className="flex flex-col items-center gap-1 py-4 px-6 text-center">
            <Upload className="h-7 w-7 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Arrastra o haz clic para subir</p>
            <p className="text-xs text-slate-400">JPG, PNG o PDF</p>
          </div>
        ) : previewUrl ? (
          <img src={previewUrl} alt="preview" className="h-24 object-contain rounded" />
        ) : (
          <div className="flex items-center gap-2 py-4 px-6">
            <ImageIcon className="h-6 w-6 text-slate-500" />
            <span className="text-sm font-medium text-slate-700 truncate max-w-[200px]">{file.name}</span>
          </div>
        )}
        {file && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onFileSelected(null); }}
            className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-red-50 transition-colors"
          >
            <X className="h-3.5 w-3.5 text-slate-500 hover:text-red-600" />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Tab 1: Desde OC ──────────────────────────────────────────────────────────

interface LocalHabilitarModalProps {
  material: {
    id: string;
    name: string;
    unit: string;
    unit_price: number;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const LocalHabilitarModal = ({ material, onClose, onSuccess }: LocalHabilitarModalProps) => {
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<'MPF' | 'MPS' | 'EMP' | 'ETQ' | ''>('');
  const [unit, setUnit] = useState(material?.unit ?? 'kg');
  const [minStock, setMinStock] = useState('0');
  const [initialCost, setInitialCost] = useState(String(material?.unit_price ?? 0));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: families = [] } = useQuery({
    queryKey: ['inventoryFamilies'],
    queryFn: getInventoryFamilies,
    enabled: !!material,
  });

  const nextSku = React.useMemo(() => {
    if (!category) return '—';
    const fam = families.find((f: any) => f.category === category);
    if (!fam) return '—';
    return `${fam.prefix}-${String(fam.current_sequence + 1).padStart(3, '0')}`;
  }, [category, families]);

  React.useEffect(() => {
    if (material) {
      setUnit(material.unit);
      setInitialCost(String(material.unit_price));
    }
  }, [material]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material || !category) return;
    setLoading(false); // standard loading state
    setLoading(true);
    try {
      await enableMaterialForInventory({
        material_id: material.id,
        inventory_category: category,
        unit: unit.trim() || 'kg',
        min_stock_alert: parseFloat(minStock) || 0,
        last_purchase_price: parseFloat(initialCost) || 0,
        notes: notes.trim() || undefined,
      });
      toast.success(`✅ Material habilitado en inventario.`);
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventoryFamilies'] });
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al habilitar el material.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!material} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <PackagePlus className="h-5 w-5 text-emerald-600" />
            Habilitar para Almacén
          </DialogTitle>
          <DialogDescription>
            Configura los parámetros del material para poder recibirlo en inventario.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Material Name info */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <span className="text-xs text-slate-500 uppercase tracking-wider block font-semibold mb-0.5">Material</span>
            <span className="text-sm font-bold text-slate-800">{material?.name}</span>
          </div>

          {/* Category selection */}
          <div className="space-y-1.5">
            <Label htmlFor="local-inv-category">Categoría de Inventario *</Label>
            <Select value={category} onValueChange={(v: any) => setCategory(v)}>
              <SelectTrigger id="local-inv-category">
                <SelectValue placeholder="Selecciona una categoría..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MPF">
                  <span className="font-mono font-bold mr-2 text-red-600">MPF</span>
                  <span className="text-slate-600">Materia Prima Fresca</span>
                </SelectItem>
                <SelectItem value="MPS">
                  <span className="font-mono font-bold mr-2 text-amber-600">MPS</span>
                  <span className="text-slate-600">Materia Prima Seca</span>
                </SelectItem>
                <SelectItem value="EMP">
                  <span className="font-mono font-bold mr-2 text-blue-600">EMP</span>
                  <span className="text-slate-600">Empaques</span>
                </SelectItem>
                <SelectItem value="ETQ">
                  <span className="font-mono font-bold mr-2 text-violet-600">ETQ</span>
                  <span className="text-slate-600">Etiquetas</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SKU preview if category selected */}
          {category && (
            <div className="bg-procarni-dark rounded-lg px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">SKU Asignado</span>
              <span className="font-mono font-black text-lg text-procarni-secondary">{nextSku}</span>
            </div>
          )}

          {/* Unit, min stock, unit cost */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="local-inv-unit">Unidad *</Label>
              <Input id="local-inv-unit" value={unit} onChange={e => setUnit(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="local-inv-min-stock">Alerta mín.</Label>
              <Input id="local-inv-min-stock" type="number" min="0" value={minStock} onChange={e => setMinStock(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="local-inv-cost">Costo *</Label>
              <Input id="local-inv-cost" type="number" min="0" step="0.000001" value={initialCost} onChange={e => setInitialCost(e.target.value)} required />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="local-inv-notes">Notas (opcional)</Label>
            <Textarea
              id="local-inv-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Detalles sobre almacenamiento o proveedor..."
            />
          </div>

          <Button
            type="submit"
            disabled={!category || loading}
            className="w-full bg-procarni-secondary hover:bg-procarni-secondary/90 text-white font-bold h-10 mt-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {loading ? 'Habilitando...' : 'Habilitar y Guardar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const EMPTY_ITEMS_ARRAY: any[] = [];

const TabDesdeOC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('orderId') || '';
  const [selectedOrderId, setSelectedOrderId] = useState(orderIdParam);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, { pesoGuia: string; pesoRecibido: string; precio: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [materialToEnable, setMaterialToEnable] = useState<{
    id: string;
    name: string;
    unit: string;
    unit_price: number;
  } | null>(null);

  React.useEffect(() => {
    if (orderIdParam) {
      setSelectedOrderId(orderIdParam);
    }
  }, [orderIdParam]);

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['purchaseOrdersAprobadas'],
    queryFn: getPurchaseOrdersAprobadas,
  });

  const { data: items = EMPTY_ITEMS_ARRAY, isLoading: loadingItems } = useQuery({
    queryKey: ['poItems', selectedOrderId],
    queryFn: () => getPurchaseOrderItemsHabilitados(selectedOrderId),
    enabled: !!selectedOrderId,
  });

  const { data: registeredOCs = [] } = useQuery({
    queryKey: ['registeredOCReferences'],
    queryFn: getRegisteredOCReferences,
  });

  // Prefill rows with PO quantity and unit price when items load
  React.useEffect(() => {
    if (items && items.length > 0) {
      setRows(prev => {
        // If the keys in prev match the new items exactly, we keep the user's edits
        const itemIds = (items as any[]).map(item => item.id);
        const hasAllKeys = itemIds.every(id => id in prev);
        if (hasAllKeys && Object.keys(prev).length === itemIds.length) {
          return prev;
        }

        const initialRows: Record<string, { pesoGuia: string; pesoRecibido: string; precio: string }> = {};
        (items as any[]).forEach(item => {
          initialRows[item.id] = {
            pesoGuia: String(item.quantity),
            pesoRecibido: '',
            precio: String(item.unit_price),
          };
        });
        return initialRows;
      });
    } else {
      setRows(prev => {
        if (Object.keys(prev).length === 0) return prev;
        return {};
      });
    }
  }, [items]);

  const handleFileChange = (f: File | null) => {
    setEvidenceFile(f);
    if (f && f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

  const getRow = (itemId: string, defaultPrice: number, defaultQuantity = 0) =>
    rows[itemId] ?? {
      pesoGuia: defaultQuantity > 0 ? String(defaultQuantity) : '',
      pesoRecibido: '',
      precio: String(defaultPrice)
    };

  const setRowField = (itemId: string, field: string, value: string, defaultPrice = 0, defaultQuantity = 0) => {
    setRows(prev => ({ ...prev, [itemId]: { ...getRow(itemId, defaultPrice, defaultQuantity), [field]: value } }));
  };

  const handleEnableSuccess = () => {
    setMaterialToEnable(null);
    queryClient.invalidateQueries({ queryKey: ['poItems', selectedOrderId] });
  };

  const handleSubmit = async () => {
    if (!selectedOrderId || items.length === 0) return;
    const validItems = (items as any[]).filter(item => {
      const r = getRow(item.id, item.unit_price);
      return item.materials_inventory && parseFloat(r.pesoGuia) > 0;
    });
    if (validItems.length === 0) {
      toast.error('Ingresa el Peso Guía de al menos un ítem habilitado.');
      return;
    }

    setSubmitting(true);
    try {
      // Upload evidence to order document (if provided)
      if (evidenceFile) {
        const cloudinaryRes = await uploadToCloudinary(evidenceFile, 'procarni_system/evidencias_recepciones');
        await OrderDocumentService.saveDocument({
          purchase_order_id: selectedOrderId,
          document_type: 'Nota de Entrega',
          file_url: cloudinaryRes.secure_url,
          cloudinary_public_id: cloudinaryRes.public_id,
        });
      }

      // Register each item reception
      const results = await Promise.all(
        validItems.map(item => {
          const r = getRow(item.id, item.unit_price);
          const guia = parseFloat(r.pesoGuia);
          const recibido = parseFloat(r.pesoRecibido) || guia;
          return registrarRecepcion({
            p_material_id: item.materials_inventory.material_id,
            p_transaction_type: 'IN_PURCHASE',
            p_peso_guia: guia,
            p_peso_recibido: recibido,
            p_unit_cost: parseFloat(r.precio) || item.unit_price,
            p_reference_doc: `OC-${orders.find(o => o.id === selectedOrderId)?.sequence_number ?? selectedOrderId}`,
          });
        })
      );

      // Update Purchase Order status to 'Received'
      await purchaseOrderService.updateStatus(selectedOrderId, 'Received' as any);

      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['registeredOCReferences'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrdersAprobadas'] });
      const totalMerma = results.reduce((a, r) => a + (r.merma_kg ?? 0), 0);
      toast.success(`✅ ${validItems.length} recepción(es) registrada(s). Estado de OC actualizado a Recibido. Merma total: ${fmt(totalMerma)} kg`);
      setSelectedOrderId('');
      setRows({});
      setEvidenceFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la recepción.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* OC selector */}
      <div className="space-y-1.5">
        <Label htmlFor="oc-select">Orden de Compra Aprobada</Label>
        <Select value={selectedOrderId} onValueChange={setSelectedOrderId} disabled={loadingOrders}>
          <SelectTrigger id="oc-select" className="h-10">
            <SelectValue placeholder={loadingOrders ? 'Cargando órdenes...' : 'Selecciona una OC aprobada...'} />
          </SelectTrigger>
          <SelectContent>
            {(orders as any[]).map(o => {
              const alreadyEntered = (registeredOCs as string[]).includes(`OC-${o.sequence_number}`);
              return (
                <SelectItem key={o.id} value={o.id} className={alreadyEntered ? "bg-amber-50/50 hover:bg-amber-50" : ""}>
                  <div className="flex items-center justify-between w-full gap-2">
                    <span>
                      <span className={cn("font-mono font-bold mr-2", alreadyEntered ? "line-through text-slate-400" : "text-slate-900")}>
                        OC-{o.sequence_number}
                      </span>
                      <span className={alreadyEntered ? "text-slate-400/80" : "text-slate-500"}>
                        {o.suppliers?.name} — {format(new Date(o.created_at), 'dd/MM/yyyy')}
                      </span>
                    </span>
                    {alreadyEntered && (
                      <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300 text-[10px] py-0 px-1.5 h-4.5 font-bold uppercase tracking-wider">
                        Ingresada
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Items table */}
      {selectedOrderId && (
        <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 pl-4">Material</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500">SKU</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Cant. OC</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Peso Guía</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Peso Real</TableHead>
                  <TableHead className="font-bold text-xs uppercase text-slate-500 text-right">Precio/u</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingItems ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                      Esta OC no tiene materiales asociados.
                    </TableCell>
                  </TableRow>
                ) : (
                  (items as any[]).map(item => {
                    const hasInventory = !!item.materials_inventory;
                    const r = getRow(item.id, item.unit_price, item.quantity);
                    const g = parseFloat(r.pesoGuia) || 0;
                    const rv = parseFloat(r.pesoRecibido) || 0;
                    return (
                      <TableRow key={item.id} className={cn("group transition-colors", !hasInventory && "bg-amber-50/20 hover:bg-amber-50/30")}>
                        <TableCell className="pl-4 font-semibold text-sm text-slate-700">
                          {item.material_name}
                        </TableCell>
                        <TableCell>
                          {hasInventory ? (
                            <span className="font-mono text-xs text-slate-500 font-bold bg-slate-100 rounded px-2 py-0.5">
                              {item.materials_inventory.sku}
                            </span>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-750 border-amber-200 text-[10px] py-0 px-1.5 h-4.5 font-bold uppercase tracking-wider">
                              No habilitado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono text-slate-500">
                          {fmt(item.quantity)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasInventory ? (
                            <Input
                              type="number" min="0" step="0.01"
                              placeholder="0.00"
                              value={r.pesoGuia}
                              onChange={e => setRowField(item.id, 'pesoGuia', e.target.value, item.unit_price, item.quantity)}
                              className="w-24 h-8 text-right text-sm ml-auto"
                            />
                          ) : (
                            <span className="text-xs text-slate-450 font-mono select-none block text-right pr-2">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasInventory ? (
                            <Input
                              type="number" min="0" step="0.01"
                              placeholder="= Guía"
                              value={r.pesoRecibido}
                              onChange={e => setRowField(item.id, 'pesoRecibido', e.target.value, item.unit_price, item.quantity)}
                              className="w-24 h-8 text-right text-sm ml-auto"
                            />
                          ) : (
                            <span className="text-xs text-slate-450 font-mono select-none block text-right pr-2">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasInventory ? (
                            <Input
                              type="number" min="0" step="0.000001"
                              value={r.precio}
                              onChange={e => setRowField(item.id, 'precio', e.target.value, item.unit_price, item.quantity)}
                              className="w-28 h-8 text-right text-sm ml-auto"
                            />
                          ) : (
                            <span className="text-xs text-slate-450 font-mono select-none block text-right pr-2">—</span>
                          )}
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          {hasInventory ? (
                            g > 0 && rv > 0 && <MermaIndicator guia={g} recibido={rv} />
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setMaterialToEnable({
                                id: item.material_id,
                                name: item.material_name,
                                unit: item.unit ?? 'kg',
                                unit_price: item.unit_price ?? 0
                              })}
                              className="h-7 text-xs font-bold border-amber-250 text-amber-700 bg-white hover:bg-amber-50 hover:text-amber-800"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Habilitar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <EvidenceZone
            file={evidenceFile}
            previewUrl={previewUrl}
            onFileSelected={handleFileChange}
            label="Documento de Evidencia (adjunto a la OC)"
          />

          <Button
            id="btn-confirmar-recepcion-oc"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-11 bg-procarni-secondary hover:bg-procarni-secondary/90 text-white font-bold shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {submitting ? 'Registrando...' : 'Confirmar Recepción'}
          </Button>
        </m.div>
      )}

      <LocalHabilitarModal
        material={materialToEnable}
        onClose={() => setMaterialToEnable(null)}
        onSuccess={handleEnableSuccess}
      />
    </div>
  );
};

// ─── Tab 2: Entrada Directa ───────────────────────────────────────────────────

const TabEntradaDirecta = () => {
  const queryClient = useQueryClient();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [referencia, setReferencia] = useState('');
  const [pesoGuia, setPesoGuia] = useState('');
  const [pesoRecibido, setPesoRecibido] = useState('');
  const [precio, setPrecio] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: inventory = [] } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: getMaterialsInventory,
  });

  const filtered = inventory.filter(m => {
    const q = materialSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 20);

  const guia = parseFloat(pesoGuia) || 0;
  const recibido = parseFloat(pesoRecibido) || 0;

  const handleFileChange = (f: File | null) => {
    setEvidenceFile(f);
    setPreviewUrl(f && f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial || guia <= 0) {
      toast.error('Selecciona un material y el Peso Guía es obligatorio.');
      return;
    }

    setSubmitting(true);
    try {
      // Upload evidence to Cloudinary
      let evidenceData: Record<string, unknown> = {};
      if (evidenceFile) {
        const res = await uploadToCloudinary(evidenceFile, 'procarni_system/evidencias_inventario');
        evidenceData = {
          tipo: 'EVIDENCIA_ENTRADA_DIRECTA',
          secure_url: res.secure_url,
          public_id: res.public_id,
          format: res.format,
          bytes: res.bytes,
        };
      }

      const result = await registrarRecepcion({
        p_material_id: selectedMaterial.material_id,
        p_transaction_type: 'IN_DIRECT',
        p_peso_guia: guia,
        p_peso_recibido: recibido || guia,
        p_unit_cost: parseFloat(precio) || selectedMaterial.last_purchase_price,
        p_reference_doc: referencia.trim() || 'ENTRADA-DIRECTA',
      });

      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      const mermaMsg = result.merma_kg > 0 ? ` | Merma: ${fmt(result.merma_kg)} kg` : '';
      toast.success(`✅ Entrada registrada para ${selectedMaterial.materials?.name}${mermaMsg}`);

      setSelectedMaterial(null);
      setMaterialSearch('');
      setReferencia('');
      setPesoGuia('');
      setPesoRecibido('');
      setPrecio('');
      setEvidenceFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar la entrada.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Material selector */}
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
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-slate-400 text-center">Sin resultados</p>
                ) : filtered.map(m => (
                  <button
                    key={m.material_id}
                    type="button"
                    onClick={() => {
                      setSelectedMaterial(m);
                      setPrecio(String(m.last_purchase_price));
                      setMaterialSearch('');
                    }}
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-500 mr-2">{m.sku}</span>
                      <span className="text-sm font-semibold text-slate-800">{m.materials?.name}</span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">Stock: {fmt(m.current_stock)} {m.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-procarni-secondary/5 border border-procarni-secondary/20 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-procarni-secondary font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-procarni-dark flex-1">{selectedMaterial.materials?.name}</span>
            <span className="text-xs text-procarni-secondary font-semibold">Stock: {fmt(selectedMaterial.current_stock)} {selectedMaterial.unit}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-slate-400 hover:text-procarni-primary transition-colors" />
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dir-referencia">Nro. de Referencia / Guía</Label>
          <Input id="dir-referencia" placeholder="GUIA-001" value={referencia} onChange={e => setReferencia(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dir-precio">Precio Unitario</Label>
          <Input id="dir-precio" type="number" min="0" step="0.000001" value={precio} onChange={e => setPrecio(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="dir-guia">Peso Guía *</Label>
          <Input id="dir-guia" type="number" min="0" step="0.01" placeholder="0.00" value={pesoGuia} onChange={e => setPesoGuia(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dir-recibido">Peso Real Recibido</Label>
          <Input id="dir-recibido" type="number" min="0" step="0.01" placeholder="= Peso Guía" value={pesoRecibido} onChange={e => setPesoRecibido(e.target.value)} />
        </div>
      </div>

      {/* Live merma preview */}
      {guia > 0 && recibido > 0 && recibido !== guia && (
        <m.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center gap-3 rounded-xl px-4 py-3 border text-sm font-semibold',
            guia > recibido
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-green-50 border-green-200 text-green-800'
          )}
        >
          {guia > recibido ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {guia > recibido
            ? `Merma de traslado detectada: ${fmt(guia - recibido, 2)} kg (${fmt(((guia - recibido) / guia) * 100, 1)}%)`
            : `Excedente detectado: +${fmt(recibido - guia, 2)} kg`}
        </m.div>
      )}

      <EvidenceZone
        file={evidenceFile}
        previewUrl={previewUrl}
        onFileSelected={handleFileChange}
        label="Evidencia (Factura / Nota de Entrega) — Cloudinary"
      />

      <Button
        id="btn-confirmar-entrada-directa"
        type="submit"
        disabled={submitting || !selectedMaterial || !pesoGuia}
        className="w-full h-11 bg-procarni-secondary hover:bg-procarni-secondary/90 text-white font-bold shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
        {submitting ? 'Registrando...' : 'Confirmar Entrada Directa'}
      </Button>
    </form>
  );
};

// ─── Tab 3: Ajuste Positivo ───────────────────────────────────────────────────

const TabAjustePositivo = () => {
  const queryClient = useQueryClient();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialInventory | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [observacion, setObservacion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: inventory = [] } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: getMaterialsInventory,
  });

  const { data: reasons = [] } = useQuery({
    queryKey: ['adjustmentReasons', 'ADD'],
    queryFn: () => getAdjustmentReasons('ADD'),
  });

  const filtered = inventory.filter(m => {
    const q = materialSearch.toLowerCase();
    return m.sku.toLowerCase().includes(q) || (m.materials?.name ?? '').toLowerCase().includes(q);
  }).slice(0, 20);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterial || !cantidad || !reasonCode || !observacion.trim()) {
      toast.error('Todos los campos son obligatorios para un ajuste positivo.');
      return;
    }
    setSubmitting(true);
    try {
      await registrarAjusteInventario({
        p_material_id: selectedMaterial.material_id,
        p_transaction_type: 'ADJUSTMENT_ADD',
        p_cantidad: parseFloat(cantidad),
        p_reason_code: reasonCode,
        p_observacion: observacion.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      toast.success(`✅ Ajuste positivo registrado para ${selectedMaterial.materials?.name}`);
      setSelectedMaterial(null);
      setMaterialSearch('');
      setCantidad('');
      setReasonCode('');
      setObservacion('');
    } catch (err: any) {
      toast.error(err.message ?? 'Error al registrar el ajuste.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-procarni-blue/5 border border-procarni-blue/20 rounded-xl px-4 py-3 text-sm text-procarni-blue">
        <strong>Ajuste Positivo:</strong> Úsalo para sobrantes detectados en conteo físico. El stock aumenta al CPP actual sin modificar el costo promedio.
      </div>

      {/* Material selector */}
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
                    className="w-full text-left p-3 hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-500 mr-2">{m.sku}</span>
                      <span className="text-sm font-semibold text-slate-800">{m.materials?.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">CPP: ${fmt(m.average_unit_cost, 4)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-procarni-secondary/5 border border-procarni-secondary/20 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-procarni-secondary font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-procarni-dark flex-1">{selectedMaterial.materials?.name}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-slate-400 hover:text-procarni-primary transition-colors" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="adj-cantidad">Cantidad a agregar *</Label>
          <Input id="adj-cantidad" type="number" min="0" step="0.01" placeholder="0.00" value={cantidad} onChange={e => setCantidad(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-motivo">Motivo *</Label>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger id="adj-motivo">
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
        <Label htmlFor="adj-obs">Observación detallada *</Label>
        <Textarea
          id="adj-obs"
          placeholder="Describe la razón del ajuste con detalle..."
          value={observacion}
          onChange={e => setObservacion(e.target.value)}
          rows={3}
          required
        />
      </div>

      <Button
        id="btn-confirmar-ajuste-positivo"
        type="submit"
        disabled={submitting || !selectedMaterial || !cantidad || !reasonCode || !observacion.trim()}
        className="w-full h-11 bg-procarni-blue hover:bg-procarni-blue/90 text-white font-bold shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-300"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
        {submitting ? 'Registrando...' : 'Confirmar Ajuste Positivo'}
      </Button>
    </form>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Recepciones = () => {
  const [activeTab, setActiveTab] = useState<'desde-oc' | 'directa' | 'ajuste-positivo'>('desde-oc');
  return (
    <div className="container mx-auto p-4 pb-20 space-y-6">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-black text-procarni-blue tracking-tighter leading-none">
          Recepciones
        </h1>
        <p className="text-[13px] text-gray-500 font-medium italic">
          Centro de entradas al almacén
        </p>
      </div>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          {/* Top Bar with integrated tab toggle */}
          <div className="bg-procarni-blue px-7 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {activeTab === 'desde-oc' && <Clipboard className="h-5 w-5 text-white/60 flex-shrink-0" />}
                {activeTab === 'directa' && <Upload className="h-5 w-5 text-white/60 flex-shrink-0" />}
                {activeTab === 'ajuste-positivo' && <Plus className="h-5 w-5 text-green-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-white font-bold text-base leading-tight">
                    {activeTab === 'desde-oc' && 'Recepcionar desde Orden de Compra'}
                    {activeTab === 'directa' && 'Entrada Directa de Inventario'}
                    {activeTab === 'ajuste-positivo' && 'Ajuste Positivo de Inventario'}
                  </p>
                  <p className="text-white/50 text-xs mt-0.5 truncate">
                    {activeTab === 'desde-oc' && 'Busca una Orden de Compra aprobada para registrar su ingreso al almacén'}
                    {activeTab === 'directa' && 'Registra una entrada manual sin orden de compra previa'}
                    {activeTab === 'ajuste-positivo' && 'Aumenta el stock de un material por excedente o inventario físico'}
                  </p>
                </div>
              </div>
              {/* Toggle tabs inside top-bar */}
              <div className="flex gap-1.5 bg-white/10 p-1 rounded-xl flex-shrink-0">
                <button
                  id="tab-desde-oc"
                  onClick={() => setActiveTab('desde-oc')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                    activeTab === 'desde-oc'
                      ? 'bg-procarni-blue text-white shadow-lg ring-1 ring-white/20'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Clipboard className="h-3.5 w-3.5" />
                  Desde OC
                </button>
                <button
                  id="tab-directa"
                  onClick={() => setActiveTab('directa')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                    activeTab === 'directa'
                      ? 'bg-procarni-blue text-white shadow-lg ring-1 ring-white/20'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Directa
                </button>
                <button
                  id="tab-ajuste-positivo"
                  onClick={() => setActiveTab('ajuste-positivo')}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200',
                    activeTab === 'ajuste-positivo'
                      ? 'bg-procarni-secondary text-white shadow-lg'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajuste
                </button>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            <AnimatePresence mode="wait">
              {activeTab === 'desde-oc' && (
                <m.div key="desde-oc" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <TabDesdeOC />
                </m.div>
              )}
              {activeTab === 'directa' && (
                <m.div key="directa" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <TabEntradaDirecta />
                </m.div>
              )}
              {activeTab === 'ajuste-positivo' && (
                <m.div key="ajuste-positivo" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
                  <TabAjustePositivo />
                </m.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
};

export default Recepciones;
