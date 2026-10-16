import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  CheckSquare,
  Calendar,
  DollarSign,
  AlertTriangle,
  Building2,
  Package,
  Layers,
  Sparkles,
  Loader2,
  Repeat,
  RotateCw,
  Plus,
  Trash2
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllUnits, searchMaterials, searchSuppliers } from '@/integrations/supabase/data';
import SmartSearch from '@/components/SmartSearch';
import { purchaseReminderService, CreatePurchaseReminderPayload } from '@/integrations/supabase/services/purchaseReminderService';
import { PurchaseReminder, PurchaseReminderItem } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { showError } from '@/utils/toast';

interface DialogItemRow {
  tempId: string;
  material_id?: string | null;
  material_name: string;
  quantity: number | '';
  unit_id?: string;
  unit_name: string;
  estimated_price?: number | '';
}

interface PurchaseReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminderToEdit?: PurchaseReminder | null;
  onSuccess?: (savedReminder: PurchaseReminder) => void;
  defaultMaterial?: {
    id?: string;
    name: string;
    unit_id?: string;
    unit?: string;
  };
  defaultSupplier?: {
    id?: string;
    name: string;
  };
}

const PurchaseReminderDialog: React.FC<PurchaseReminderDialogProps> = ({
  open,
  onOpenChange,
  reminderToEdit,
  onSuccess,
  defaultMaterial,
  defaultSupplier
}) => {
  const queryClient = useQueryClient();
  const isEditing = Boolean(reminderToEdit);

  // Form State
  const [reminderType, setReminderType] = useState<'material_purchase' | 'management_task'>('material_purchase');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'baja' | 'media' | 'alta' | 'urgente'>('media');
  const [dueDate, setDueDate] = useState('');
  
  // Recurrence State
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'>('weekly');
  const [recurrenceDays, setRecurrenceDays] = useState<number | ''>(7);

  // Items State (Multi-Item Support)
  const [items, setItems] = useState<DialogItemRow[]>([]);

  // Supplier & Currency
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'VES' | 'EUR'>('USD');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load Units of Measure
  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  // Initialize or reset form
  useEffect(() => {
    if (open) {
      if (reminderToEdit) {
        setReminderType(reminderToEdit.reminder_type || 'material_purchase');
        setTitle(reminderToEdit.title || '');
        setDescription(reminderToEdit.description || '');
        setPriority(reminderToEdit.priority || 'media');
        setDueDate(reminderToEdit.due_date ? reminderToEdit.due_date.split('T')[0] : '');
        setIsRecurring(Boolean(reminderToEdit.is_recurring));
        setRecurrenceInterval(reminderToEdit.recurrence_interval || 'weekly');
        setRecurrenceDays(reminderToEdit.recurrence_days ?? 7);
        setSupplierId(reminderToEdit.supplier_id || null);
        setSupplierName(reminderToEdit.suppliers?.name || '');
        setCurrency(reminderToEdit.currency || 'USD');

        if (Array.isArray(reminderToEdit.items) && reminderToEdit.items.length > 0) {
          setItems(reminderToEdit.items.map((it, idx) => ({
            tempId: it.id || `edit-item-${idx}-${Date.now()}`,
            material_id: it.material_id || null,
            material_name: it.material_name || '',
            quantity: it.quantity ?? 1,
            unit_id: it.unit_id || '',
            unit_name: it.unit_name || 'UND',
            estimated_price: it.estimated_price ?? ''
          })));
        } else if (reminderToEdit.material_name || reminderToEdit.material_id) {
          setItems([{
            tempId: 'edit-initial',
            material_id: reminderToEdit.material_id || null,
            material_name: reminderToEdit.material_name || '',
            quantity: reminderToEdit.quantity ?? 1,
            unit_id: reminderToEdit.unit_id || '',
            unit_name: reminderToEdit.unit_name || 'UND',
            estimated_price: reminderToEdit.estimated_price ?? ''
          }]);
        } else {
          setItems([{
            tempId: 'initial',
            material_id: null,
            material_name: '',
            quantity: 1,
            unit_id: units[0]?.id || '',
            unit_name: units[0]?.name || 'UND',
            estimated_price: ''
          }]);
        }
      } else {
        setReminderType('material_purchase');
        setTitle(defaultMaterial ? `Comprar ${defaultMaterial.name}` : '');
        setDescription('');
        setPriority('media');
        setIsRecurring(false);
        setRecurrenceInterval('weekly');
        setRecurrenceDays(7);
        // Default due date: tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setDueDate(tomorrow.toISOString().split('T')[0]);

        setSupplierId(defaultSupplier?.id || null);
        setSupplierName(defaultSupplier?.name || '');
        setCurrency('USD');

        const initialUnitId = defaultMaterial?.unit_id || (units.length > 0 ? units[0].id : '');
        const initialUnitName = defaultMaterial?.unit || (units.length > 0 ? units[0].name : 'UND');

        setItems([{
          tempId: 'new-initial',
          material_id: defaultMaterial?.id || null,
          material_name: defaultMaterial?.name || '',
          quantity: 1,
          unit_id: initialUnitId,
          unit_name: initialUnitName,
          estimated_price: ''
        }]);
      }
    }
  }, [open, reminderToEdit, defaultMaterial, defaultSupplier, units]);

  // Suggest title based on items
  const updateTitleSuggestion = (updatedItems: DialogItemRow[]) => {
    const named = updatedItems.map(i => i.material_name.trim()).filter(Boolean);
    if (named.length === 0) return;
    if (!title || title.startsWith('Comprar ')) {
      if (named.length === 1) {
        setTitle(`Comprar ${named[0]}`);
      } else if (named.length === 2) {
        setTitle(`Comprar ${named[0]} y ${named[1]}`);
      } else {
        setTitle(`Comprar ${named[0]} (+${named.length - 1} más)`);
      }
    }
  };

  // Add Item Row
  const handleAddItem = () => {
    const defaultUnit = units.length > 0 ? units[0] : null;
    setItems(prev => [
      ...prev,
      {
        tempId: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        material_id: null,
        material_name: '',
        quantity: 1,
        unit_id: defaultUnit?.id || '',
        unit_name: defaultUnit?.name || 'UND',
        estimated_price: ''
      }
    ]);
  };

  // Remove Item Row
  const handleRemoveItem = (tempId: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  // Update Item Row
  const handleUpdateItem = (tempId: string, updates: Partial<DialogItemRow>) => {
    setItems(prev => {
      const next = prev.map(i => i.tempId === tempId ? { ...i, ...updates } : i);
      if ('material_name' in updates) {
        updateTitleSuggestion(next);
      }
      return next;
    });
  };

  // Handle Material Selection from SmartSearch for a specific item row
  const handleItemMaterialSelect = (tempId: string, mat: any) => {
    let uId = mat.unit_id || '';
    let uName = mat.unit || 'UND';
    if (mat.unit_id) {
      const foundUnit = units.find((u: any) => u.id === mat.unit_id);
      if (foundUnit) uName = foundUnit.name;
    } else if (mat.unit) {
      const foundUnit = units.find((u: any) => u.name.toLowerCase() === mat.unit.toLowerCase());
      if (foundUnit) uId = foundUnit.id;
    }

    handleUpdateItem(tempId, {
      material_id: mat.id,
      material_name: mat.name,
      unit_id: uId,
      unit_name: uName
    });
  };

  // Handle Supplier Selection
  const handleSupplierSelect = (item: any) => {
    setSupplierId(item.id);
    setSupplierName(item.name);
  };

  // Handle Unit Change
  const handleUnitChange = (selectedUnitId: string) => {
    setUnitId(selectedUnitId);
    const found = units.find((u: any) => u.id === selectedUnitId);
    if (found) {
      setUnitName(found.name);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      showError('Por favor ingresa un título o asunto para el recordatorio.');
      return;
    }

    const cleanedItems = reminderType === 'material_purchase'
      ? items
          .filter(i => i.material_name.trim().length > 0)
          .map(i => ({
            material_id: i.material_id || null,
            material_name: i.material_name.trim(),
            quantity: i.quantity === '' ? 1 : Number(i.quantity),
            unit_id: i.unit_id || null,
            unit_name: i.unit_name || null,
            estimated_price: i.estimated_price !== '' && i.estimated_price !== undefined ? Number(i.estimated_price) : null
          }))
      : [];

    if (reminderType === 'material_purchase' && cleanedItems.length === 0) {
      showError('Por favor indica al menos un material o insumo a comprar.');
      return;
    }

    const firstItem = cleanedItems[0] || null;

    setIsSubmitting(true);
    try {
      const payload: CreatePurchaseReminderPayload = {
        title: title.trim(),
        description: description.trim() || null,
        reminder_type: reminderType,
        priority,
        due_date: dueDate ? new Date(`${dueDate}T12:00:00Z`).toISOString() : null,
        material_id: firstItem?.material_id || null,
        material_name: firstItem?.material_name || null,
        supplier_id: reminderType === 'material_purchase' ? supplierId : null,
        quantity: firstItem?.quantity ?? null,
        unit_id: firstItem?.unit_id || null,
        unit_name: firstItem?.unit_name || null,
        estimated_price: firstItem?.estimated_price ?? null,
        currency,
        items: cleanedItems,
        is_recurring: isRecurring,
        recurrence_interval: isRecurring ? recurrenceInterval : null,
        recurrence_days: isRecurring ? (recurrenceInterval === 'custom' ? Number(recurrenceDays || 7) : recurrenceInterval === 'daily' ? 1 : recurrenceInterval === 'weekly' ? 7 : recurrenceInterval === 'biweekly' ? 15 : 30) : null
      };

      let result: PurchaseReminder | null = null;
      if (isEditing && reminderToEdit) {
        result = await purchaseReminderService.updateReminder(reminderToEdit.id, payload);
      } else {
        result = await purchaseReminderService.createReminder(payload);
      }

      if (result) {
        queryClient.invalidateQueries({ queryKey: ['purchase_reminders'] });
        if (onSuccess) onSuccess(result);
        onOpenChange(false);
      }
    } catch (err: unknown) {
      console.error('Error saving purchase reminder:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-2xl border-none shadow-2xl rounded-3xl p-6 sm:p-8">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-procarni-primary to-procarni-secondary flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-extrabold text-procarni-dark tracking-tight">
                {isEditing ? 'Editar Recordatorio' : 'Nuevo Recordatorio Personalizado'}
              </DialogTitle>
              <DialogDescription className="text-xs text-gray-500 font-medium">
                Programa recordatorios puntuales o compras recurrentes frecuentes para tu equipo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Selector de Tipo de Recordatorio */}
          <div className="grid grid-cols-2 gap-3 p-1.5 bg-gray-100/80 rounded-2xl">
            <button
              type="button"
              onClick={() => setReminderType('material_purchase')}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200",
                reminderType === 'material_purchase'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              <ShoppingCart className={cn("w-4 h-4", reminderType === 'material_purchase' ? "text-procarni-primary" : "")} />
              Compra de Insumo / Material
            </button>
            <button
              type="button"
              onClick={() => setReminderType('management_task')}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all duration-200",
                reminderType === 'management_task'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              <CheckSquare className={cn("w-4 h-4", reminderType === 'management_task' ? "text-procarni-primary" : "")} />
              Gestión / Tarea General
            </button>
          </div>

          {/* Título / Asunto */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Título / Asunto del Recordatorio <span className="text-procarni-primary">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                reminderType === 'material_purchase'
                  ? "Ej: Reponer stock semanal de tripas para embutidos..."
                  : "Ej: Llamar al proveedor de transporte para verificar despacho..."
              }
              className="h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-sm font-medium focus:ring-procarni-primary/20"
              required
            />
          </div>

          {/* Si es Compra de Insumo: Lista de Materiales / Ítems Dinámicos */}
          {reminderType === 'material_purchase' && (
            <div className="p-4 sm:p-5 rounded-2xl bg-blue-50/40 border border-blue-100/60 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-procarni-blue">
                  <Package className="w-4 h-4 text-procarni-primary" />
                  <span>Materiales / Insumos a Comprar ({items.length})</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddItem}
                  className="h-7 px-2.5 rounded-xl text-[11px] font-bold text-procarni-primary border-procarni-primary/30 hover:bg-procarni-primary/5 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Ítem
                </Button>
              </div>

              {/* Lista dinámica de ítems */}
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div
                    key={item.tempId}
                    className="p-3 bg-white rounded-2xl border border-gray-200/80 shadow-xs space-y-2.5 relative group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-procarni-primary bg-procarni-primary/5 px-2 py-0.5 rounded-md">
                        Ítem #{index + 1}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.tempId)}
                          className="h-6 w-6 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                          title="Eliminar este ítem"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Material SmartSearch */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Material / Insumo <span className="text-procarni-primary">*</span>
                      </Label>
                      <SmartSearch
                        placeholder="Buscar material en catálogo o escribir nombre..."
                        displayValue={item.material_name}
                        selectedId={item.material_id || undefined}
                        modal={true}
                        fetchFunction={async (q) => {
                          const res = await searchMaterials(q);
                          return res.map(m => ({ id: m.id, name: m.name, unit: m.unit, unit_id: m.unit_id }));
                        }}
                        onSelect={(mat) => handleItemMaterialSelect(item.tempId, mat)}
                        className="w-full"
                      />
                    </div>

                    {/* Cantidad, Unidad y Precio Estimado */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          Cantidad
                        </Label>
                        <Input
                          type="number"
                          min="0.01"
                          step="any"
                          value={item.quantity}
                          onChange={(e) => handleUpdateItem(item.tempId, {
                            quantity: e.target.value === '' ? '' : parseFloat(e.target.value)
                          })}
                          placeholder="1"
                          className="h-9 rounded-xl bg-gray-50/50 border-gray-200 font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          Unidad de Medida
                        </Label>
                        <Select
                          value={item.unit_id || ''}
                          onValueChange={(val) => {
                            const found = units.find((u: any) => u.id === val);
                            handleUpdateItem(item.tempId, {
                              unit_id: val,
                              unit_name: found ? found.name : item.unit_name
                            });
                          }}
                        >
                          <SelectTrigger className="h-9 rounded-xl bg-gray-50/50 border-gray-200 text-xs">
                            <SelectValue placeholder="Unidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map((u: any) => (
                              <SelectItem key={u.id} value={u.id} className="text-xs">
                                {u.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                          Precio Unit. Est. ({currency})
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={item.estimated_price}
                          onChange={(e) => handleUpdateItem(item.tempId, {
                            estimated_price: e.target.value === '' ? '' : parseFloat(e.target.value)
                          })}
                          placeholder="0.00"
                          className="h-9 rounded-xl bg-gray-50/50 border-gray-200 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Proveedor Sugerido y Moneda */}
              <div className="pt-2 border-t border-blue-100/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Proveedor Sugerido (Opcional)
                  </Label>
                  <SmartSearch
                    placeholder="Buscar proveedor sugerido..."
                    displayValue={supplierName}
                    selectedId={supplierId || undefined}
                    modal={true}
                    fetchFunction={async (q) => {
                      const res = await searchSuppliers(q);
                      return res.map(s => ({ id: s.id, name: s.name, rif: s.rif }));
                    }}
                    onSelect={handleSupplierSelect}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Moneda Estimada
                  </Label>
                  <Select value={currency} onValueChange={(val: any) => setCurrency(val)}>
                    <SelectTrigger className="h-10 rounded-xl bg-white border-gray-200 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="VES">VES (Bs.)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Tarea Programada / Recurrente Switch Block */}
          <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Repeat className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-procarni-dark">
                    Compra Frecuente / Tarea Programada Recurrente
                  </span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Activa esta opción si compras este ítem de forma periódica o realizas esta gestión periódicamente.
                </p>
              </div>
              <Switch
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
                className="data-[state=checked]:bg-procarni-secondary"
              />
            </div>

            {isRecurring && (
              <div className="pt-3 border-t border-amber-200/50 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Frecuencia de Repetición
                  </Label>
                  <Select value={recurrenceInterval} onValueChange={(val: any) => setRecurrenceInterval(val)}>
                    <SelectTrigger className="h-10 rounded-xl bg-white border-gray-200 text-xs font-semibold">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diario (Cada 1 día)</SelectItem>
                      <SelectItem value="weekly">Semanal (Cada 7 días)</SelectItem>
                      <SelectItem value="biweekly">Quincenal (Cada 15 días)</SelectItem>
                      <SelectItem value="monthly">Mensual (Cada 30 días)</SelectItem>
                      <SelectItem value="custom">Personalizado (en días)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recurrenceInterval === 'custom' ? (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      Repetir cada (días)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={recurrenceDays}
                      onChange={(e) => setRecurrenceDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      placeholder="Ej: 10"
                      className="h-10 rounded-xl bg-white border-gray-200 text-xs font-mono"
                    />
                  </div>
                ) : (
                  <div className="flex items-center text-xs text-amber-800 bg-amber-100/60 p-2.5 rounded-xl self-end">
                    <RotateCw className="w-3.5 h-3.5 mr-1.5 text-amber-700 shrink-0" />
                    <span className="text-[11px] leading-tight">
                      Al generar la OC o completarla, se reprogramará automáticamente para el siguiente ciclo.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Prioridad y Fecha Inicial */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Prioridad
              </Label>
              <Select value={priority} onValueChange={(val: any) => setPriority(val)}>
                <SelectTrigger className="h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      Baja
                    </span>
                  </SelectItem>
                  <SelectItem value="media">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      Media
                    </span>
                  </SelectItem>
                  <SelectItem value="alta">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      Alta
                    </span>
                  </SelectItem>
                  <SelectItem value="urgente">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
                      Urgente
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {isRecurring ? 'Primera Fecha / Próximo Recordatorio' : 'Fecha Límite / Recordatorio'}
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-sm font-medium"
              />
            </div>
          </div>

          {/* Notas / Descripción */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              Notas Adicionales / Observaciones (Opcional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles sobre por qué se necesita, cotizaciones pendientes, instrucciones especiales..."
              rows={3}
              className="rounded-2xl bg-gray-50/70 border-gray-200 text-sm font-normal focus:ring-procarni-primary/20 resize-none"
            />
          </div>

          <DialogFooter className="pt-4 border-t flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-2xl h-11 px-5 border-gray-200"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-2xl h-11 px-6 bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white font-bold shadow-lg shadow-procarni-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : isEditing ? (
                'Actualizar Recordatorio'
              ) : (
                'Crear Recordatorio'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PurchaseReminderDialog;
