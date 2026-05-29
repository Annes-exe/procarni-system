import React, { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { m, AnimatePresence } from 'framer-motion';
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
} from '@/integrations/supabase/services/inventoryService';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { OrderDocumentService } from '@/integrations/supabase/services/orderDocumentService';
import { MaterialInventory } from '@/integrations/supabase/types';

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

const TabDesdeOC = () => {
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, { pesoGuia: string; pesoRecibido: string; precio: string }>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ['purchaseOrdersAprobadas'],
    queryFn: getPurchaseOrdersAprobadas,
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
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
      setRows({});
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

  const handleSubmit = async () => {
    if (!selectedOrderId || items.length === 0) return;
    const validItems = (items as any[]).filter(item => {
      const r = getRow(item.id, item.unit_price);
      return parseFloat(r.pesoGuia) > 0;
    });
    if (validItems.length === 0) {
      toast.error('Ingresa el Peso Guía de al menos un ítem.');
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

      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['registeredOCReferences'] });
      const totalMerma = results.reduce((a, r) => a + (r.merma_kg ?? 0), 0);
      toast.success(`✅ ${validItems.length} recepción(es) registrada(s). Merma total: ${fmt(totalMerma)} kg`);
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
                      Esta OC no tiene materiales habilitados para almacén.
                    </TableCell>
                  </TableRow>
                ) : (
                  (items as any[]).map(item => {
                    const r = getRow(item.id, item.unit_price, item.quantity);
                    const g = parseFloat(r.pesoGuia) || 0;
                    const rv = parseFloat(r.pesoRecibido) || 0;
                    return (
                      <TableRow key={item.id} className="group">
                        <TableCell className="pl-4 font-semibold text-sm text-slate-700">
                          {item.material_name}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-slate-500">
                            {item.materials_inventory?.sku ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-mono text-slate-500">
                          {fmt(item.quantity)} {item.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="0.00"
                            value={r.pesoGuia}
                            onChange={e => setRowField(item.id, 'pesoGuia', e.target.value, item.unit_price, item.quantity)}
                            className="w-24 h-8 text-right text-sm ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min="0" step="0.01"
                            placeholder="= Guía"
                            value={r.pesoRecibido}
                            onChange={e => setRowField(item.id, 'pesoRecibido', e.target.value, item.unit_price, item.quantity)}
                            className="w-24 h-8 text-right text-sm ml-auto"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number" min="0" step="0.000001"
                            value={r.precio}
                            onChange={e => setRowField(item.id, 'precio', e.target.value, item.unit_price, item.quantity)}
                            className="w-28 h-8 text-right text-sm ml-auto"
                          />
                        </TableCell>
                        <TableCell className="pr-4">
                          {g > 0 && rv > 0 && <MermaIndicator guia={g} recibido={rv} />}
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
            className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            {submitting ? 'Registrando...' : 'Confirmar Recepción'}
          </Button>
        </m.div>
      )}
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
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-emerald-600 font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-emerald-800 flex-1">{selectedMaterial.materials?.name}</span>
            <span className="text-xs text-emerald-600">Stock: {fmt(selectedMaterial.current_stock)} {selectedMaterial.unit}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-emerald-500 hover:text-red-500" />
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
        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
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
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
        <strong>Ajuste Positivo (ADJUSTMENT_ADD):</strong> Úsalo para sobrantes detectados en conteo físico. El stock aumenta al CPP actual sin modificar el costo promedio.
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
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            <span className="font-mono text-xs text-emerald-600 font-bold">{selectedMaterial.sku}</span>
            <span className="text-sm font-semibold text-emerald-800 flex-1">{selectedMaterial.materials?.name}</span>
            <button type="button" onClick={() => setSelectedMaterial(null)}>
              <X className="h-4 w-4 text-emerald-500 hover:text-red-500" />
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
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
        {submitting ? 'Registrando...' : 'Confirmar Ajuste Positivo'}
      </Button>
    </form>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const Recepciones = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6 pb-24">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Download className="h-6 w-6 text-slate-700" />
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Recepciones</h1>
        </div>
        <p className="text-sm text-slate-500 ml-8">
          Centro de entradas al almacén — elimina el flujo de WhatsApp
        </p>
      </div>

      <m.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl"
      >
        <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-5">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Registrar Entrada de Inventario
            </CardTitle>
            <CardDescription className="text-slate-300 text-sm">
              Selecciona el tipo de entrada para comenzar
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs defaultValue="desde-oc">
              <TabsList className="w-full grid grid-cols-3 mb-6 bg-slate-100 p-1 rounded-xl h-auto">
                <TabsTrigger
                  id="tab-desde-oc"
                  value="desde-oc"
                  className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Clipboard className="h-4 w-4 mr-1.5" />
                  Desde OC
                </TabsTrigger>
                <TabsTrigger
                  id="tab-directa"
                  value="directa"
                  className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Entrada Directa
                </TabsTrigger>
                <TabsTrigger
                  id="tab-ajuste-positivo"
                  value="ajuste-positivo"
                  className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Ajuste Positivo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="desde-oc"><TabDesdeOC /></TabsContent>
              <TabsContent value="directa"><TabEntradaDirecta /></TabsContent>
              <TabsContent value="ajuste-positivo"><TabAjustePositivo /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </m.div>
    </div>
  );
};

export default Recepciones;
