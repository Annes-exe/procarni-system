import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BellRing,
  ShoppingCart,
  CheckSquare,
  Plus,
  Search,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  ExternalLink,
  Package,
  Building2,
  ArrowRight,
  Sparkles,
  Layers,
  DollarSign,
  TrendingUp,
  RefreshCw,
  MoreVertical,
  Check,
  Repeat,
  RotateCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { purchaseReminderService } from '@/integrations/supabase/services/purchaseReminderService';
import { PurchaseReminder } from '@/integrations/supabase/types';
import PurchaseReminderDialog from '@/components/PurchaseReminderDialog';
import { cn } from '@/lib/utils';
import { format, isToday, isPast, isTomorrow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { m, AnimatePresence } from 'framer-motion';

const PurchaseReminders: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dialog & Selection State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [reminderToEdit, setReminderToEdit] = useState<PurchaseReminder | null>(null);
  const [reminderToDelete, setReminderToDelete] = useState<PurchaseReminder | null>(null);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'recurring'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'material_purchase' | 'management_task'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Fetch Reminders
  const { data: reminders = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['purchase_reminders'],
    queryFn: () => purchaseReminderService.getReminders(),
  });

  // Toggle Completed Mutation
  const toggleMutation = useMutation({
    mutationFn: (reminder: PurchaseReminder) =>
      purchaseReminderService.toggleComplete(reminder.id, reminder.status, reminder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_reminders'] });
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => purchaseReminderService.deleteReminder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase_reminders'] });
      setReminderToDelete(null);
    },
  });

  // Filtered Reminders
  const filteredReminders = useMemo(() => {
    return reminders.filter((rem) => {
      // Status & Recurring filter
      if (statusFilter === 'pending' && rem.status !== 'pending') return false;
      if (statusFilter === 'completed' && rem.status !== 'completed') return false;
      if (statusFilter === 'recurring' && !rem.is_recurring) return false;

      // Type
      if (typeFilter !== 'all' && rem.reminder_type !== typeFilter) return false;
      // Priority
      if (priorityFilter !== 'all' && rem.priority !== priorityFilter) return false;
      // Search
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchTitle = rem.title.toLowerCase().includes(query);
        const matchDesc = rem.description?.toLowerCase().includes(query);
        const matchMaterial = rem.material_name?.toLowerCase().includes(query);
        const matchSupplier = rem.suppliers?.name?.toLowerCase().includes(query);
        if (!matchTitle && !matchDesc && !matchMaterial && !matchSupplier) return false;
      }
      return true;
    });
  }, [reminders, statusFilter, typeFilter, priorityFilter, searchTerm]);

  // Metrics
  const metrics = useMemo(() => {
    const total = reminders.length;
    const pending = reminders.filter((r) => r.status === 'pending');
    const recurringCount = reminders.filter((r) => r.is_recurring).length;
    const pendingPurchases = pending.filter((r) => r.reminder_type === 'material_purchase').length;
    const pendingTasks = pending.filter((r) => r.reminder_type === 'management_task').length;
    const completed = reminders.filter((r) => r.status === 'completed').length;
    const withPo = reminders.filter((r) => r.purchase_order_id).length;

    return { total, pending: pending.length, recurringCount, pendingPurchases, pendingTasks, completed, withPo };
  }, [reminders]);

  // Handle "Generar OC" Action
  const handleGeneratePoFromReminder = (reminder: PurchaseReminder) => {
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

  // Helper for priority badge colors
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgente':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
            Urgente
          </span>
        );
      case 'alta':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            Alta
          </span>
        );
      case 'media':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            Media
          </span>
        );
      case 'baja':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Baja
          </span>
        );
    }
  };

  // Helper for Recurrence badge
  const getRecurrenceBadge = (reminder: PurchaseReminder) => {
    if (!reminder.is_recurring) return null;
    let label = 'Frecuente';
    switch (reminder.recurrence_interval) {
      case 'daily': label = 'Diario'; break;
      case 'weekly': label = 'Semanal (7d)'; break;
      case 'biweekly': label = 'Quincenal (15d)'; break;
      case 'monthly': label = 'Mensual (30d)'; break;
      case 'custom': label = `Cada ${reminder.recurrence_days || 7} días`; break;
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
        <Repeat className="w-3 h-3 text-amber-700" />
        {label}
      </span>
    );
  };

  // Helper for Due Date badge
  const getDueDateInfo = (dueDateStr: string | null) => {
    if (!dueDateStr) return null;
    const date = parseISO(dueDateStr);
    const isPastDue = isPast(date) && !isToday(date);
    const isDueToday = isToday(date);
    const isDueTomorrow = isTomorrow(date);

    let text = format(date, "d 'de' MMMM", { locale: es });
    let badgeClass = "bg-gray-100 text-gray-700 border-gray-200";

    if (isDueToday) {
      text = "¡Vence hoy!";
      badgeClass = "bg-amber-100 text-amber-800 border-amber-300 font-bold animate-pulse";
    } else if (isPastDue) {
      text = `Venció (${format(date, "dd/MM/yyyy")})`;
      badgeClass = "bg-red-100 text-red-800 border-red-300 font-bold";
    } else if (isDueTomorrow) {
      text = "Vence mañana";
      badgeClass = "bg-blue-100 text-blue-800 border-blue-300 font-semibold";
    }

    return { text, badgeClass, isPastDue };
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-procarni-dark via-[#1B294A] to-slate-900 p-8 text-white shadow-2xl ring-1 ring-white/10">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-72 w-72 rounded-full bg-procarni-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute right-1/3 bottom-0 -mb-20 h-64 w-64 rounded-full bg-procarni-secondary/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold tracking-wide text-white/90">
              <Sparkles className="w-3.5 h-3.5 text-procarni-primary" />
              Gestión Personalizada y Compras Recurrentes
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              Recordatorios y Tareas
            </h1>
            <p className="text-sm text-gray-300/90 max-w-2xl font-medium leading-relaxed">
              Organiza compras puntuales y programa tareas recurrentes para insumos frecuentes. Genera Órdenes de Compra con un solo clic.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              className="h-12 w-12 rounded-2xl bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white backdrop-blur-md"
              title="Actualizar lista"
            >
              <RefreshCw className={cn("h-5 w-5", isFetching && "animate-spin")} />
            </Button>
            <Button
              onClick={() => {
                setReminderToEdit(null);
                setIsDialogOpen(true);
              }}
              className="h-12 px-6 rounded-2xl bg-gradient-to-r from-procarni-primary to-procarni-secondary hover:opacity-95 text-white font-bold shadow-xl shadow-procarni-primary/25 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 text-sm"
            >
              <Plus className="w-5 h-5" />
              Nuevo Recordatorio
            </Button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pendientes */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Total Pendientes</p>
              <p className="text-3xl font-black text-procarni-dark">{metrics.pending}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-procarni-primary/10 flex items-center justify-center text-procarni-primary shadow-inner">
              <Clock className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-gray-500 font-medium">
            <span>De {metrics.total} recordatorios registrados</span>
          </div>
        </Card>

        {/* Compras Frecuentes / Recurrentes */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Compras Frecuentes</p>
              <p className="text-3xl font-black text-amber-600">{metrics.recurringCount}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner">
              <Repeat className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-amber-600 font-medium">
            <span>Tareas programadas periódicas</span>
          </div>
        </Card>

        {/* Compras de Insumos */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Insumos por Comprar</p>
              <p className="text-3xl font-black text-blue-600">{metrics.pendingPurchases}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner">
              <ShoppingCart className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-blue-600 font-medium">
            <span>Listos para generar Orden de Compra</span>
          </div>
        </Card>

        {/* Completados / Con OC */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Completados</p>
              <p className="text-3xl font-black text-procarni-secondary">{metrics.completed}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-procarni-secondary shadow-inner">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs text-procarni-secondary font-medium">
            <span>{metrics.withPo} convertidos en Órdenes de Compra</span>
          </div>
        </Card>
      </div>

      {/* Control Filters Bar */}
      <Card className="bg-white/70 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-5">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl overflow-x-auto">
            <button
              onClick={() => setStatusFilter('pending')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                statusFilter === 'pending'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              Pendientes ({metrics.pending})
            </button>
            <button
              onClick={() => setStatusFilter('recurring')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1",
                statusFilter === 'recurring'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              <Repeat className="w-3.5 h-3.5 text-amber-600" />
              Recurrentes ({metrics.recurringCount})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                statusFilter === 'completed'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              Completados ({metrics.completed})
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                statusFilter === 'all'
                  ? "bg-white text-procarni-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:text-procarni-dark"
              )}
            >
              Todos ({metrics.total})
            </button>
          </div>

          {/* Search and Secondary Dropdown Filters */}
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por título, material, proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-xs font-medium focus:ring-procarni-primary/20"
              />
            </div>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(val: any) => setTypeFilter(val)}>
              <SelectTrigger className="h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-xs font-medium min-w-[140px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="material_purchase">Compras de Insumo</SelectItem>
                <SelectItem value="management_task">Gestiones / Tareas</SelectItem>
              </SelectContent>
            </Select>

            {/* Priority Filter */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-11 rounded-2xl bg-gray-50/70 border-gray-200 text-xs font-medium min-w-[130px]">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las prioridades</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Reminders List / Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 bg-white/50 backdrop-blur-sm rounded-3xl">
          <div className="w-12 h-12 rounded-full border-4 border-procarni-primary/20 border-t-procarni-primary animate-spin mb-4" />
          <p className="text-sm font-bold text-gray-500">Cargando tus recordatorios...</p>
        </div>
      ) : filteredReminders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 bg-white/70 backdrop-blur-xl rounded-3xl border border-dashed border-gray-200 text-center">
          <div className="w-16 h-16 rounded-3xl bg-procarni-primary/10 flex items-center justify-center text-procarni-primary mb-4 shadow-sm">
            <BellRing className="w-8 h-8 opacity-70" />
          </div>
          <h3 className="text-lg font-extrabold text-procarni-dark">No hay recordatorios encontrados</h3>
          <p className="text-sm text-gray-500 max-w-md mt-1 mb-6">
            {searchTerm || typeFilter !== 'all' || priorityFilter !== 'all' || statusFilter !== 'pending'
              ? "No encontramos recordatorios con los filtros seleccionados."
              : "Crea tu primer recordatorio para compras frecuentes o tareas operativas."}
          </p>
          <Button
            onClick={() => {
              setReminderToEdit(null);
              setIsDialogOpen(true);
            }}
            className="rounded-2xl h-11 px-6 bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white font-bold shadow-lg shadow-procarni-primary/20"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Recordatorio
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <AnimatePresence>
            {filteredReminders.map((reminder) => {
              const dueDateInfo = getDueDateInfo(reminder.due_date);
              const isCompleted = reminder.status === 'completed';

              return (
                <m.div
                  key={reminder.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card
                    className={cn(
                      "bg-white/80 backdrop-blur-xl border-none shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5 relative group",
                      isCompleted && "opacity-75 bg-gray-50/80"
                    )}
                  >
                    {/* Top Row: Type, Priority, Date, Status */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getPriorityBadge(reminder.priority)}
                          {getRecurrenceBadge(reminder)}
                          {reminder.reminder_type === 'material_purchase' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <ShoppingCart className="w-3 h-3" />
                              Compra
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <CheckSquare className="w-3 h-3" />
                              Gestión
                            </span>
                          )}
                        </div>

                        {/* Dropdown Options Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-2xl p-1.5 shadow-xl border-none bg-white/95 backdrop-blur-lg">
                            <DropdownMenuItem
                              onClick={() => {
                                setReminderToEdit(reminder);
                                setIsDialogOpen(true);
                              }}
                              className="rounded-xl text-xs font-semibold cursor-pointer py-2"
                            >
                              <Edit2 className="w-4 h-4 mr-2 text-blue-600" />
                              Editar Recordatorio
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleMutation.mutate(reminder)}
                              className="rounded-xl text-xs font-semibold cursor-pointer py-2"
                            >
                              <Check className="w-4 h-4 mr-2 text-procarni-secondary" />
                              {reminder.is_recurring ? 'Completar y Reprogramar Ciclo' : isCompleted ? 'Marcar como Pendiente' : 'Marcar como Completado'}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setReminderToDelete(reminder)}
                              className="rounded-xl text-xs font-semibold cursor-pointer py-2 text-red-600 focus:bg-red-50 focus:text-red-700"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {/* Due date pill */}
                      {dueDateInfo && (
                        <div className="mb-3 flex items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px]", dueDateInfo.badgeClass)}>
                            <Calendar className="w-3 h-3" />
                            {dueDateInfo.text}
                          </span>
                          {reminder.is_recurring && (
                            <span className="text-[10px] text-gray-400 font-medium italic">
                              (Programada)
                            </span>
                          )}
                        </div>
                      )}

                      {/* Title & Description */}
                      <div className="space-y-1.5 mb-4">
                        <h4 className={cn("text-base font-extrabold text-procarni-dark leading-snug", isCompleted && "line-through text-gray-400")}>
                          {reminder.title}
                        </h4>
                        {reminder.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                            {reminder.description}
                          </p>
                        )}
                      </div>

                      {/* Material Purchase Details Block */}
                      {reminder.reminder_type === 'material_purchase' && (reminder.material_name || reminder.supplier_id) && (
                        <div className="p-3.5 rounded-2xl bg-gray-50/80 border border-gray-100 space-y-2 mb-4">
                          {reminder.material_name && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-gray-700 truncate max-w-[180px]">
                                {reminder.material_name}
                              </span>
                              <span className="font-mono font-bold text-procarni-dark bg-white px-2 py-0.5 rounded-lg border text-[11px]">
                                {reminder.quantity ?? 1} {reminder.unit_name || reminder.units_of_measure?.name || 'UND'}
                              </span>
                            </div>
                          )}

                          {reminder.suppliers?.name && (
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                              <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{reminder.suppliers.name}</span>
                            </div>
                          )}

                          {reminder.estimated_price ? (
                            <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-200/60">
                              <span>Precio est.:</span>
                              <span className="font-mono font-bold text-procarni-secondary">
                                {reminder.currency === 'VES' ? 'Bs. ' : reminder.currency === 'EUR' ? '€ ' : '$ '}
                                {Number(reminder.estimated_price).toFixed(2)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Linked Purchase Order Badge */}
                      {reminder.purchase_order_id && (
                        <div className="mb-4">
                          <button
                            type="button"
                            onClick={() => navigate(`/purchase-orders/${reminder.purchase_order_id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-green-50 text-procarni-secondary border border-green-200 hover:bg-green-100 transition-colors"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            <span>Ver OC #{reminder.purchase_orders?.sequence_number || reminder.purchase_order_id.substring(0, 8)}</span>
                            <ExternalLink className="w-3 h-3 ml-0.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Row */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 mt-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate(reminder)}
                        className={cn(
                          "rounded-xl h-9 px-3 text-xs font-bold transition-all",
                          reminder.is_recurring
                            ? "text-amber-700 hover:bg-amber-50"
                            : isCompleted
                            ? "text-gray-500 hover:bg-gray-100"
                            : "text-procarni-secondary hover:bg-green-50 hover:text-green-700"
                        )}
                      >
                        {reminder.is_recurring ? (
                          <>
                            <RotateCw className="w-3.5 h-3.5 mr-1" />
                            Siguiente Ciclo
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {isCompleted ? 'Desmarcar' : 'Completar'}
                          </>
                        )}
                      </Button>

                      {/* Button to Generate PO */}
                      {reminder.reminder_type === 'material_purchase' && (
                        <Button
                          size="sm"
                          onClick={() => handleGeneratePoFromReminder(reminder)}
                          className="rounded-xl h-9 px-3.5 bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white text-xs font-bold shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1.5"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Generar OC
                        </Button>
                      )}
                    </div>
                  </Card>
                </m.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Creation / Edit Dialog */}
      <PurchaseReminderDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        reminderToEdit={reminderToEdit}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={Boolean(reminderToDelete)} onOpenChange={(open) => !open && setReminderToDelete(null)}>
        <AlertDialogContent className="rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl p-6 sm:p-8">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-extrabold text-procarni-dark">
              ¿Eliminar este recordatorio?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-500 font-medium">
              Esta acción no se puede deshacer. Se eliminará el recordatorio "{reminderToDelete?.title}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 flex items-center justify-end gap-3">
            <AlertDialogCancel className="rounded-2xl h-11 px-5 border-gray-200">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reminderToDelete && deleteMutation.mutate(reminderToDelete.id)}
              className="rounded-2xl h-11 px-6 bg-red-600 hover:bg-red-700 text-white font-bold shadow-md shadow-red-500/20"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PurchaseReminders;
