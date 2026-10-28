import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Send,
  MessageCircle,
  Sparkles,
  MapPin,
  Clock,
  ChevronRight,
  RefreshCw,
  Eye,
  Check
} from 'lucide-react';
import { showSuccess, showError } from '@/utils/toast';

export interface QuickQuoteSupplierItem {
  id: string;
  name: string;
  phone: string;
  rif?: string | null;
  city?: string | null;
  rubros?: string | null;
}

export interface QuickQuoteItem {
  id: string;
  description: string;
  quantity: string;
  notes?: string;
}

interface WhatsAppQuickQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSuppliers: QuickQuoteSupplierItem[];
  initialTerm?: string;
}

export const WhatsAppQuickQuoteModal: React.FC<WhatsAppQuickQuoteModalProps> = ({
  isOpen,
  onClose,
  initialSuppliers,
  initialTerm = '',
}) => {
  // Pestaña activa en móvil: 'items' (requerimiento) o 'suppliers' (envío a proveedores)
  const [mobileTab, setMobileTab] = useState<'items' | 'suppliers'>('items');
  const [isCopied, setIsCopied] = useState(false);

  // Lista de items a cotizar (texto libre o prellenado)
  const [items, setItems] = useState<QuickQuoteItem[]>(() => {
    return initialTerm.trim()
      ? [{ id: '1', description: initialTerm.trim(), quantity: '1', notes: '' }]
      : [{ id: '1', description: '', quantity: '1', notes: '' }];
  });

  // Parámetros de entrega y urgencia predeterminados
  const [deliveryLocation, setDeliveryLocation] = useState<string>('Planta Procarni, San Vicente, Aragua');
  const [urgency, setUrgency] = useState<string>('Inmediato / Esta semana');
  const [customFooter, setCustomFooter] = useState<string>('¿Tendrán disponibilidad y precio unitario a la fecha?');

  // Estado de proveedores contactados
  const [contactedSuppliers, setContactedSuppliers] = useState<Record<string, boolean>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // Formateador de teléfono limpio internacional (+58)
  const formatPhone = (rawPhone: string) => {
    const clean = rawPhone.replace(/\D/g, '');
    if (!clean) return '';
    if (clean.startsWith('58')) return clean;
    if (clean.startsWith('0')) return `58${clean.substring(1)}`;
    return `58${clean}`;
  };

  // Agregar nuevo item libre
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: '', quantity: '1', notes: '' },
    ]);
  };

  // Modificar item
  const handleUpdateItem = (id: string, field: keyof QuickQuoteItem, value: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
    );
  };

  // Eliminar item
  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setItems([{ id: Date.now().toString(), description: '', quantity: '1', notes: '' }]);
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Construir mensaje base exacto con la estructura requerida
  const buildMessage = (_supplierName?: string) => {
    const validItems = items.filter((it) => it.description.trim().length > 0);
    const greeting = `Saludos estimado proveedor, le escribimos del Departamento de Compras de *Procarni*.`;

    const itemsText =
      validItems.length > 0
        ? validItems
            .map((it) => {
              const qty = it.quantity.trim() ? `${it.quantity.trim()} - ` : '';
              const notes = it.notes?.trim() ? ` _(${it.notes.trim()})_` : '';
              return `• ${qty}*${it.description.trim()}*${notes}`;
            })
            .join('\n')
        : '• 10 rollo - *alambre*';

    return `${greeting}

Quisiéramos consultar disponibilidad y precio para los siguientes ítems:
${itemsText}

*Lugar de entrega:* ${deliveryLocation.trim() || 'Planta Procarni, San Vicente, Aragua'}
*Tiempo requerido:* ${urgency.trim() || 'Inmediato / Esta semana'}

${customFooter.trim()}
Quedamos muy atentos a su respuesta. ¡Muchas gracias!`;
  };

  // Mensaje para difusión genérica
  const genericMessage = useMemo(() => buildMessage(), [items, deliveryLocation, urgency, customFooter]);

  // Copiar al portapapeles
  const handleCopyMaster = async () => {
    try {
      await navigator.clipboard.writeText(genericMessage);
      setIsCopied(true);
      showSuccess('¡Mensaje copiado al portapapeles listo para difusión!');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      showError('No se pudo copiar automáticamente. Por favor selecciónalo manualmente.');
    }
  };

  // Abrir chat de WhatsApp para un proveedor
  const handleOpenWhatsApp = (supplier: QuickQuoteSupplierItem, markCompleted = true) => {
    const phone = formatPhone(supplier.phone);
    if (!phone) {
      showError(`El proveedor ${supplier.name} no tiene un número válido.`);
      return;
    }
    const message = buildMessage(supplier.name);
    const encoded = encodeURIComponent(message);
    const url = `https://wa.me/${phone}?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    if (markCompleted) {
      setContactedSuppliers((prev) => ({ ...prev, [supplier.id]: true }));
    }
  };

  // Secuenciador: Disparar el actual y preparar el siguiente
  const handleSendCurrentAndNext = () => {
    if (initialSuppliers.length === 0) return;
    const currentSupplier = initialSuppliers[currentIndex];
    if (currentSupplier) {
      handleOpenWhatsApp(currentSupplier, true);
      if (currentIndex < initialSuppliers.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    }
  };

  const completedCount = Object.keys(contactedSuppliers).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[96vw] max-w-4xl h-[92vh] max-h-[92vh] flex flex-col p-4 sm:p-6 bg-slate-50 border border-gray-200/80 shadow-2xl rounded-3xl overflow-hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        {/* HEADER MODAL */}
        <DialogHeader className="pb-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 sm:p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 shrink-0">
                <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight truncate">
                  Cotizador Express por WhatsApp
                </DialogTitle>
                <DialogDescription className="text-[11px] sm:text-xs text-gray-500 font-medium truncate">
                  Consulta precios y stock por WhatsApp sin crear ítems previamente.
                </DialogDescription>
              </div>
            </div>
          </div>

          {/* SELECTOR DE PESTAÑAS EXCLUSIVO EN MÓVIL (< lg) */}
          <div className="flex lg:hidden mt-3 bg-gray-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setMobileTab('items')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mobileTab === 'items'
                  ? 'bg-white text-procarni-dark shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-procarni-primary" />
              <span>1. Requerimiento</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {items.filter((i) => i.description.trim()).length}
              </Badge>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('suppliers')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                mobileTab === 'suppliers'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>2. Proveedores</span>
              <Badge
                className={`text-[10px] h-4 px-1 ${
                  mobileTab === 'suppliers' ? 'bg-white text-emerald-700' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {initialSuppliers.length}
              </Badge>
            </button>
          </div>
        </DialogHeader>

        {/* CONTENIDO PRINCIPAL SCROLLABLE */}
        <div className="flex-1 overflow-y-auto py-2 px-1 sm:px-2 space-y-4 overscroll-contain">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* COLUMNA IZQUIERDA: ITEMS Y CONDICIONES (7 COLS EN DESKTOP) */}
            <div
              className={`space-y-4 lg:col-span-7 ${
                mobileTab === 'items' ? 'block' : 'hidden lg:block'
              }`}
            >
              {/* Canasta de Items Libres */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200/80 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-procarni-primary" />
                    Ítems ({items.filter((i) => i.description.trim()).length})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                    className="h-8 text-xs border-dashed border-gray-300 hover:border-procarni-primary text-procarni-dark font-semibold rounded-xl"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1 text-procarni-primary" /> Agregar ítem
                  </Button>
                </div>

                <div className="space-y-2.5 max-h-[35vh] sm:max-h-[240px] overflow-y-auto pr-0.5">
                  {items.map((item, idx) => (
                    <div
                      key={item.id}
                      className="bg-gray-50/70 p-2.5 rounded-xl border border-gray-100 space-y-2"
                    >
                      {/* Fila superior en móvil: número, cantidad e ícono eliminar */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-5 text-center">
                          #{idx + 1}
                        </span>
                        <div className="w-32 shrink-0">
                          <Input
                            placeholder="Cant. (10 rollo)"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                            className="h-8.5 text-xs bg-white border-gray-200 font-semibold rounded-lg"
                          />
                        </div>
                        <div className="flex-1 min-w-0" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(item.id)}
                          className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                          title="Eliminar este ítem"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Campos de descripción y notas */}
                      <div className="space-y-1.5 pl-7">
                        <Input
                          placeholder="Descripción (ej: alambre galvanizado, rolinera)..."
                          value={item.description}
                          onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                          className="h-8.5 text-xs bg-white border-gray-200 font-medium rounded-lg"
                        />
                        <Input
                          placeholder="Especificación opcional (marca, calibre, medida)..."
                          value={item.notes || ''}
                          onChange={(e) => handleUpdateItem(item.id, 'notes', e.target.value)}
                          className="h-7 text-[11px] bg-white/60 border-gray-200/60 text-gray-600 placeholder:text-gray-400 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Condiciones Rápidas de Entrega */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200/80 shadow-xs space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-procarni-secondary" />
                  Condiciones del Requerimiento
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Lugar de Entrega
                    </Label>
                    <Input
                      value={deliveryLocation}
                      onChange={(e) => setDeliveryLocation(e.target.value)}
                      placeholder="Planta Procarni, San Vicente, Aragua"
                      className="h-9 text-xs bg-gray-50/50 border-gray-200 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Plazo / Urgencia
                    </Label>
                    <Input
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                      placeholder="Inmediato / Esta semana"
                      className="h-9 text-xs bg-gray-50/50 border-gray-200 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {/* Previsualización del Mensaje */}
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200/80 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600">
                    Mensaje WhatsApp
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyMaster}
                    className="h-8 text-xs border-emerald-300 text-emerald-700 bg-emerald-50/50 hover:bg-emerald-100 rounded-xl font-bold gap-1.5"
                  >
                    {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-emerald-600" />}
                    <span>{isCopied ? '¡Copiado!' : 'Copiar Texto'}</span>
                  </Button>
                </div>
                <div className="p-3 bg-emerald-950/5 border border-emerald-500/10 rounded-xl font-mono text-[11px] text-gray-800 whitespace-pre-line leading-relaxed max-h-[140px] overflow-y-auto">
                  {genericMessage}
                </div>
              </div>

              {/* Botón flotante móvil para pasar a Proveedores */}
              <div className="block lg:hidden pt-2">
                <Button
                  type="button"
                  onClick={() => setMobileTab('suppliers')}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-md flex items-center justify-center gap-2"
                >
                  <span>Continuar a Proveedores ({initialSuppliers.length})</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* COLUMNA DERECHA: PROVEEDORES Y DISPARADOR DE CADENA (5 COLS EN DESKTOP) */}
            <div
              className={`space-y-4 lg:col-span-5 flex flex-col justify-between ${
                mobileTab === 'suppliers' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-gray-200/80 shadow-xs space-y-3 flex-1">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-600 block truncate">
                      Proveedores Seleccionados
                    </span>
                    <span className="text-xs text-gray-400">
                      {completedCount} de {initialSuppliers.length} contactados
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 ${
                      completedCount === initialSuppliers.length && initialSuppliers.length > 0
                        ? 'border-emerald-300 text-emerald-700 bg-emerald-50 font-bold'
                        : 'border-gray-200 text-gray-600 font-semibold'
                    }`}
                  >
                    {completedCount === initialSuppliers.length && initialSuppliers.length > 0
                      ? '¡Completado!'
                      : `${initialSuppliers.length} en cola`}
                  </Badge>
                </div>

                {/* Botón Lanzador Secuencial (Ráfaga) */}
                {initialSuppliers.length > 0 && (
                  <div className="p-3.5 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-2xl text-white shadow-lg shadow-emerald-600/20 space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-emerald-200">
                      <span>Ráfaga 1 a 1</span>
                      <span className="bg-emerald-800/40 px-2 py-0.5 rounded-full text-white">
                        {Math.min(currentIndex + 1, initialSuppliers.length)} / {initialSuppliers.length}
                      </span>
                    </div>
                    <Button
                      type="button"
                      onClick={handleSendCurrentAndNext}
                      className="w-full bg-white text-emerald-800 hover:bg-emerald-50 font-extrabold h-11 rounded-xl shadow-sm flex items-center justify-between px-3.5 gap-2 group transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Send className="h-4 w-4 text-emerald-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                        <span className="truncate text-xs">
                          Enviar a <u>{initialSuppliers[currentIndex]?.name || 'Siguiente'}</u>
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />
                    </Button>
                  </div>
                )}

                {/* Lista Detallada de Proveedores */}
                <div className="space-y-2 max-h-[42vh] sm:max-h-[280px] overflow-y-auto pr-0.5">
                  {initialSuppliers.length === 0 ? (
                    <div className="py-10 text-center text-gray-400 text-xs space-y-2">
                      <p>No has seleccionado proveedores aún.</p>
                      <p className="text-[11px] text-gray-400">
                        Toca las tarjetas de proveedores en la búsqueda para añadirlos a la cola.
                      </p>
                    </div>
                  ) : (
                    initialSuppliers.map((sup, idx) => {
                      const isDone = !!contactedSuppliers[sup.id];
                      const isCurrent = idx === currentIndex;
                      const phoneFormatted = formatPhone(sup.phone);

                      return (
                        <div
                          key={sup.id}
                          className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-2 ${
                            isDone
                              ? 'bg-emerald-50/40 border-emerald-200 text-gray-700'
                              : isCurrent
                              ? 'bg-blue-50/60 border-blue-200 shadow-xs'
                              : 'bg-gray-50/60 border-gray-100 hover:border-gray-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isDone ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : (
                                <div
                                  className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                    isCurrent ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                                  }`}
                                />
                              )}
                              <span className="text-xs font-bold text-gray-800 truncate block">
                                {sup.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 pl-4 flex items-center gap-2 truncate mt-0.5">
                              <span>📞 {sup.phone || 'Sin número'}</span>
                              {sup.city && <span>• {sup.city}</span>}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!phoneFormatted}
                            onClick={() => handleOpenWhatsApp(sup, true)}
                            className={`h-8 px-2.5 text-xs font-bold shrink-0 rounded-xl ${
                              isDone
                                ? 'text-emerald-700 hover:bg-emerald-100/50'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title="Abrir chat en WhatsApp"
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            {isDone ? 'Reenviar' : 'Abrir'}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Acciones de pie de modal */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setContactedSuppliers({});
                    setCurrentIndex(0);
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 h-9 rounded-xl"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reiniciar
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={onClose}
                  className="bg-procarni-dark hover:bg-gray-800 text-white font-bold text-xs h-10 px-6 rounded-2xl shadow-md"
                >
                  Cerrar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppQuickQuoteModal;
