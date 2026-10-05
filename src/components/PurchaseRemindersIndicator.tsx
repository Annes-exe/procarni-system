import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BellRing,
  ShoppingCart,
  CheckSquare,
  Plus,
  Calendar,
  Clock,
  ExternalLink,
  Check,
  Package,
  Building2,
  Sparkles,
  Loader2,
  CalendarClock,
  Repeat,
  RotateCw
} from 'lucide-react';
import { purchaseReminderService } from '@/integrations/supabase/services/purchaseReminderService';
import { PurchaseReminder } from '@/integrations/supabase/types';
import PurchaseReminderDialog from '@/components/PurchaseReminderDialog';
import { cn } from '@/lib/utils';
import { format, isToday, isPast, isTomorrow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export const PurchaseRemindersIndicator: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'pending' | 'recurring' | 'purchases' | 'tasks' | 'all'>('pending');

  // Fetch reminders
  const { data: reminders = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase_reminders'],
    queryFn: () => purchaseReminderService.getReminders(),
    refetchInterval: 30000 // Poll every 30s
  });

  // Toggle complete mutation
  const toggleMutation = useMutation({
    mutationFn: (reminder: PurchaseReminder) =>
      purchaseReminderService.toggleComplete(reminder.id, reminder.status, reminder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_reminders'] });
    },
  });

  // Pending count
  const pendingReminders = useMemo(() => {
    return reminders.filter((r) => r.status === 'pending');
  }, [reminders]);

  const pendingCount = pendingReminders.length;
  const recurringCount = useMemo(() => reminders.filter(r => r.is_recurring).length, [reminders]);

  // Filtered display in Popover
  const displayReminders = useMemo(() => {
    return reminders.filter((r) => {
      if (selectedTab === 'pending') return r.status === 'pending';
      if (selectedTab === 'recurring') return r.is_recurring;
      if (selectedTab === 'purchases') return r.status === 'pending' && r.reminder_type === 'material_purchase';
      if (selectedTab === 'tasks') return r.status === 'pending' && r.reminder_type === 'management_task';
      return true; // 'all'
    });
  }, [reminders, selectedTab]);

  // Handle Generate PO from Popover
  const handleGeneratePo = (reminder: PurchaseReminder) => {
    setIsOpen(false);
    navigate('/generate-po', {
      state: {
        fromReminder: reminder,
        supplier: reminder.suppliers || (reminder.supplier_id ? { id: reminder.supplier_id, name: '' } : undefined),
        suggestedItems: reminder.material_name ? [
          {
            material_id: reminder.material_id || undefined,
            material_name: reminder.material_name,
            quantity: reminder.quantity || 1,
            unit: reminder.unit_name || reminder.units_of_measure?.name || 'UND',
            unit_id: reminder.unit_id || undefined,
            unit_price: reminder.estimated_price || 0,
            tax_rate: 0.16,
            is_exempt: false,
            description: reminder.description || `Recordatorio: ${reminder.title}`
          }
        ] : undefined
      }
    });
  };

  const getPriorityDot = (priority: string) => {
    switch (priority) {
      case 'urgente':
        return <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0" title="Prioridad Urgente" />;
      case 'alta':
        return <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title="Prioridad Alta" />;
      case 'media':
        return <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Prioridad Media" />;
      case 'baja':
      default:
        return <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" title="Prioridad Baja" />;
    }
  };

  const getDueDateLabel = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    const date = parseISO(dueDateStr);
    if (isToday(date)) {
      return <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">¡Hoy!</span>;
    }
    if (isPast(date)) {
      return <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">Venció</span>;
    }
    if (isTomorrow(date)) {
      return <span className="text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">Mañana</span>;
    }
    return (
      <span className="text-[10px] text-gray-500">
        {format(date, "d MMM", { locale: es })}
      </span>
    );
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (open) refetch();
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-procarni-primary/10 text-slate-600 hover:text-procarni-primary rounded-xl transition-all"
            title="Recordatorios de Compras"
          >
            {pendingCount > 0 ? (
              <CalendarClock className="h-5 w-5 text-procarni-primary animate-pulse" />
            ) : (
              <CalendarClock className="h-5 w-5" />
            )}
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-procarni-primary text-[9px] font-black text-white ring-2 ring-white animate-pulse">
                {pendingCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[28rem] p-4 bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl rounded-3xl ring-1 ring-black/5 mt-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="space-y-3">
            {/* Header del Popover */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <div className="min-w-0">
                <h4 className="font-extrabold text-sm text-procarni-dark flex items-center gap-1.5 truncate">
                  <CalendarClock className="h-4 w-4 text-procarni-primary shrink-0" />
                  Recordatorios y Compras Recurrentes
                </h4>
                <p className="text-[10px] text-gray-400 font-medium italic truncate">
                  {pendingCount} {pendingCount === 1 ? 'pendiente activo' : 'pendientes activos'}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="h-7 px-2.5 rounded-xl bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white text-[11px] font-bold shadow-xs hover:scale-105 transition-transform flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nuevo
                </Button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-gray-100/80 rounded-xl overflow-x-auto">
              <button
                type="button"
                onClick={() => setSelectedTab('pending')}
                className={cn(
                  "flex-1 py-1 px-2 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap",
                  selectedTab === 'pending'
                    ? "bg-white text-procarni-dark shadow-xs"
                    : "text-gray-500 hover:text-procarni-dark"
                )}
              >
                Pendientes ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('recurring')}
                className={cn(
                  "flex-1 py-1 px-2 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap flex items-center justify-center gap-1",
                  selectedTab === 'recurring'
                    ? "bg-white text-procarni-dark shadow-xs"
                    : "text-gray-500 hover:text-procarni-dark"
                )}
              >
                <Repeat className="w-3 h-3 text-amber-600" />
                Recurrentes ({recurringCount})
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('purchases')}
                className={cn(
                  "flex-1 py-1 px-2 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap",
                  selectedTab === 'purchases'
                    ? "bg-white text-procarni-dark shadow-xs"
                    : "text-gray-500 hover:text-procarni-dark"
                )}
              >
                Compras
              </button>
              <button
                type="button"
                onClick={() => setSelectedTab('all')}
                className={cn(
                  "flex-1 py-1 px-2 text-[10px] font-bold rounded-lg transition-all whitespace-nowrap",
                  selectedTab === 'all'
                    ? "bg-white text-procarni-dark shadow-xs"
                    : "text-gray-500 hover:text-procarni-dark"
                )}
              >
                Todos
              </button>
            </div>

            {/* List */}
            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin text-procarni-primary" />
                <span className="text-xs">Cargando recordatorios...</span>
              </div>
            ) : displayReminders.length === 0 ? (
              <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <BellRing className="h-8 w-8 text-slate-300 opacity-60" />
                <span className="text-xs font-semibold">No hay recordatorios en esta sección.</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="text-procarni-primary text-xs font-bold hover:underline mt-1"
                >
                  + Crear un recordatorio
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-72 pr-1">
                <div className="space-y-2">
                  {displayReminders.map((reminder) => {
                    const isCompleted = reminder.status === 'completed';
                    const isPurchase = reminder.reminder_type === 'material_purchase';

                    return (
                      <div
                        key={reminder.id}
                        className={cn(
                          "p-2.5 border border-gray-100 hover:bg-slate-50/80 rounded-2xl transition-all space-y-1.5 relative group",
                          isCompleted && "opacity-60 bg-gray-50/50"
                        )}
                      >
                        {/* Row 1: Priority dot, Title, Recurrence badge, Date badge, Check */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <div className="mt-1">{getPriorityDot(reminder.priority)}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className={cn("text-xs font-bold text-procarni-dark truncate", isCompleted && "line-through text-gray-400")}>
                                  {reminder.title}
                                </p>
                                {reminder.is_recurring && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded-full border border-amber-200">
                                    <Repeat className="w-2.5 h-2.5 text-amber-700" />
                                    {reminder.recurrence_interval === 'daily' ? 'Diario' : reminder.recurrence_interval === 'biweekly' ? '15d' : reminder.recurrence_interval === 'monthly' ? 'Mensual' : reminder.recurrence_interval === 'custom' ? `${reminder.recurrence_days}d` : 'Semanal'}
                                  </span>
                                )}
                              </div>
                              {reminder.description && (
                                <p className="text-[11px] text-gray-500 truncate leading-snug">
                                  {reminder.description}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {getDueDateLabel(reminder.due_date)}
                            <button
                              type="button"
                              onClick={() => toggleMutation.mutate(reminder)}
                              className={cn(
                                "w-6 h-6 rounded-lg border flex items-center justify-center transition-all",
                                isCompleted
                                  ? "bg-green-600 text-white border-green-600"
                                  : reminder.is_recurring
                                  ? "border-amber-300 text-amber-600 hover:bg-amber-50"
                                  : "border-gray-300 text-transparent hover:border-procarni-primary hover:text-procarni-primary/40"
                              )}
                              title={reminder.is_recurring ? 'Completar y reprogramar siguiente ciclo' : isCompleted ? 'Desmarcar' : 'Completar'}
                            >
                              {reminder.is_recurring ? (
                                <RotateCw className="w-3 h-3 text-amber-700" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Row 2 (if purchase): Material / Supplier info & Generar OC button */}
                        {isPurchase && (reminder.material_name || reminder.supplier_id) && (
                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100/80 text-[11px]">
                            <div className="flex items-center gap-1.5 text-gray-600 truncate min-w-0">
                              <Package className="w-3 h-3 text-procarni-primary shrink-0" />
                              <span className="font-semibold truncate">
                                {reminder.material_name}
                              </span>
                              {reminder.quantity ? (
                                <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                                  {reminder.quantity} {reminder.unit_name || 'UND'}
                                </span>
                              ) : null}
                            </div>

                            {/* Generar OC Button */}
                            {!reminder.purchase_order_id ? (
                              <Button
                                size="sm"
                                onClick={() => handleGeneratePo(reminder)}
                                className="h-6 px-2 text-[10px] font-bold rounded-lg bg-procarni-primary hover:bg-procarni-primary/90 text-white flex items-center gap-1 shrink-0"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                Generar OC
                              </Button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsOpen(false);
                                  navigate(`/purchase-orders/${reminder.purchase_order_id}`);
                                }}
                                className="text-[10px] font-bold text-procarni-secondary hover:underline flex items-center gap-0.5 shrink-0"
                              >
                                <span>OC vinculada</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {/* Footer */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/purchase-reminders');
                }}
                className="w-full text-xs h-8 text-procarni-blue font-bold hover:text-procarni-primary hover:bg-slate-50 rounded-xl flex items-center justify-center gap-1"
              >
                <span>Abrir panel completo de recordatorios</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Dialog for creating a new reminder */}
      <PurchaseReminderDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </>
  );
};

export default PurchaseRemindersIndicator;
