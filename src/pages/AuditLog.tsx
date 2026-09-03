import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Clock, User, Plus, Edit, Trash, CheckCircle, XCircle, ArrowRight, Eye, EyeOff, Package, Truck, Building2, FileText, UploadCloud, Archive, ClipboardList, ChevronDown, ChevronUp, PackageCheck } from 'lucide-react';

import { getAllAuditLogs } from '@/integrations/supabase/data';
import { showError } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AuditLogEntry } from '@/integrations/supabase/services/auditLogService';
import { useSession } from '@/components/SessionContextProvider';
import { translateStatus } from '@/utils/statusTranslations';

const fieldTranslations: Record<string, string> = {
  // General
  name: 'Nombre',
  status: 'Estado',
  description: 'Descripción',
  code: 'Código',
  currency: 'Moneda',
  unit_price: 'Precio Unitario',
  quantity: 'Cantidad',
  unit: 'Unidad de Medida',
  delivery_date: 'Fecha de Entrega',
  created_at: 'Fecha de Creación',
  user_email: 'Email de Usuario',
  notes: 'Notas',
  address: 'Dirección',
  phone: 'Teléfono',
  website: 'Sitio Web',
  email: 'Correo Electrónico',
  
  // Materials
  is_master: '¿Es Patrón de Oro?',
  base_material_id: 'ID Material Base',
  category_id: 'ID Categoría',
  unit_id: 'ID Unidad',
  min_stock: 'Stock Mínimo',
  sku: 'Código de Barra / SKU',
  supplier_code: 'Código del Proveedor',
  
  // Orders / Quotes
  sequence_number: 'Nro de Secuencia',
  supplier_id: 'ID Proveedor',
  company_id: 'ID Empresa',
  exchange_rate: 'Tasa de Cambio',
  payment_date: 'Fecha de Pago',
  credit_days: 'Días de Crédito',
  quote_request_id: 'ID Solic. Cotización',
  material_id: 'ID Material',
  amount: 'Monto Total',
  payment_status: 'Estado de Pago',
  observations: 'Observaciones',
  reception_status: 'Estado de Recepción',
  received_quantity: 'Cantidad Recibida',
  
  // System profiles
  role: 'Rol de Usuario',
  username: 'Nombre de Usuario',
};

const tableTranslations: Record<string, string> = {
  purchase_orders: 'Órdenes de Compra (OC)',
  purchase_order_items: 'Detalle / Ítems de Orden de Compra',
  service_orders: 'Órdenes de Servicio (OS)',
  service_order_materials: 'Detalle / Ítems de Orden de Servicio',
  materials: 'Catálogo de Materiales',
  suppliers: 'Catálogo de Proveedores',
  supplier_materials: 'Relación Proveedor - Material',
  supplier_quotes: 'Cotizaciones de Proveedor',
  quote_requests: 'Solicitudes de Cotización (SC)',
  quote_request_items: 'Detalle / Ítems de Solicitud de Cotización',
  companies: 'Empresas / RIFs de Facturación',
  ignored_material_matches: 'Coincidencias de Limpieza Ignoradas',
  audit_logs: 'Kardex de Auditoría',
  price_history: 'Historial de Precios',
  ficha_tecnica: 'Fichas Técnicas',
};

const getRelativeTime = (timestamp: string) => {
  try {
    const diffMs = new Date().getTime() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
  } catch (e) {
    return '';
  }
};

const LogDetails = ({ log }: { log: AuditLogEntry }) => {
  if (!log) return null;
  const details = log.raw_details;

  const translateField = (field: string) => fieldTranslations[field] || field;
  const translateTable = (table: string) => tableTranslations[table] || table;

  // Determine locations / En dónde cambió?
  const tableName = log.table ? translateTable(log.table) : 'Sin tabla registrada';
  const tableRaw = log.table || '';
  const recordId = log.record_id || 'N/A';

  // Determine links
  let poId = null;
  if (tableRaw === 'purchase_orders') {
    poId = recordId;
  } else if (tableRaw === 'purchase_order_items') {
    poId = details?.purchase_order_id || details?.new_data?.purchase_order_id || details?.old_data?.purchase_order_id;
  } else if (details?.purchase_order_id) {
    poId = details.purchase_order_id;
  }

  let soId = null;
  if (tableRaw === 'service_orders') {
    soId = recordId;
  } else if (tableRaw === 'service_order_materials') {
    soId = details?.service_order_id || details?.new_data?.service_order_id || details?.old_data?.service_order_id;
  } else if (details?.service_order_id) {
    soId = details.service_order_id;
  }

  // Render status change cleanly
  let statusChangeElement = null;
  if (details?.old_data?.status || details?.new_status) {
    const oldStatus = translateStatus(details.old_data?.status) || 'N/A';
    const newStatus = translateStatus(details.new_status || details.new_data?.status) || 'N/A';
    if (oldStatus !== newStatus) {
      statusChangeElement = (
        <div className="flex items-center text-xs bg-slate-50 border border-slate-100 p-1.5 rounded-xl max-w-fit shadow-sm my-1">
          <span className="text-slate-400 font-semibold uppercase tracking-widest text-[9px] ml-2">Estado</span>
          <span className="mx-2 text-slate-500 font-mono text-[11px]">{oldStatus}</span>
          <ArrowRight className="w-3 h-3 text-slate-400" />
          <span className="mx-2 text-procarni-primary font-bold font-mono text-[11px]">{newStatus}</span>
        </div>
      );
    }
  }

  // Determine changes list (What changed? -> To what?)
  let changesList: Array<{ field: string; label: string; oldVal: string; newVal: string }> = [];
  let valuesList: Array<{ field: string; label: string; value: string }> = [];

  const skipFields = ['id', 'created_at', 'updated_at', 'status', 'password', 'encrypted_password'];

  if (details?.old_data && details?.new_data) {
    // UPDATE
    const keys = Object.keys(details.new_data);
    keys.forEach(key => {
      if (!skipFields.includes(key)) {
        const oldVal = details.old_data[key];
        const newVal = details.new_data[key];
        if (oldVal !== newVal && (oldVal !== null || newVal !== null)) {
          changesList.push({
            field: key,
            label: translateField(key),
            oldVal: oldVal === null ? 'Nulo' : String(oldVal),
            newVal: newVal === null ? 'Nulo' : String(newVal),
          });
        }
      }
    });
  } else if (details?.new_data) {
    // INSERT
    Object.keys(details.new_data).forEach(key => {
      if (!skipFields.includes(key) && details.new_data[key] !== null && details.new_data[key] !== '') {
        valuesList.push({
          field: key,
          label: translateField(key),
          value: String(details.new_data[key]),
        });
      }
    });
  } else if (details?.old_data) {
    // DELETE
    Object.keys(details.old_data).forEach(key => {
      if (!skipFields.includes(key) && details.old_data[key] !== null && details.old_data[key] !== '') {
        valuesList.push({
          field: key,
          label: translateField(key),
          value: String(details.old_data[key]),
        });
      }
    });
  }

  // Categorize action impact
  let impactText = 'Operacional';
  let impactColor = 'text-blue-600 bg-blue-50/50 border-blue-100';
  const actionLower = log.action.toLowerCase();
  if (actionLower.includes('delete') || actionLower.includes('eliminar') || actionLower.includes('trash')) {
    impactText = 'Crítico (Eliminación)';
    impactColor = 'text-red-600 bg-red-50/50 border-red-100';
  } else if (actionLower.includes('price') || actionLower.includes('amount') || actionLower.includes('unit_price') || changesList.some(c => c.field.includes('price') || c.field.includes('amount') || c.field.includes('total'))) {
    impactText = 'Financiero (Precios/Montos)';
    impactColor = 'text-emerald-600 bg-emerald-50/50 border-emerald-100';
  }

  return (
    <div className="flex flex-col gap-3.5 mt-2 bg-slate-50/40 p-4 rounded-2xl border border-slate-100 max-w-2xl shadow-inner text-xs">
      
      {/* Información de Contexto / Relevancia */}
      <div className="grid grid-cols-2 gap-4 bg-white p-3 rounded-xl border border-slate-150 shadow-sm">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Usuario Responsable</p>
          <p className="font-semibold text-slate-700 mt-0.5">{log.user_email || 'Sistema (Automático)'}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Fecha y Tiempo Transcurrido</p>
          <p className="font-semibold text-slate-700 mt-0.5" title={new Date(log.timestamp).toLocaleString()}>
            {getRelativeTime(log.timestamp)}
          </p>
        </div>
        <div className="col-span-2 grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Impacto / Tipo</p>
            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full border text-[10px] font-bold ${impactColor}`}>
              {impactText}
            </span>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">ID de Registro (Auditoría)</p>
            <span className="font-mono text-[9px] text-slate-400 block mt-0.5 truncate select-all" title={log.id}>
              {log.id}
            </span>
          </div>
        </div>
      </div>

      {/* 1. ¿En dónde cambió? */}
      <div className="space-y-0.5">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">¿En dónde cambió?</p>
        <p className="text-xs text-slate-700 font-medium">
          Módulo / Tabla: <span className="font-bold text-procarni-blue">{tableName}</span>
          <span className="text-[9px] font-mono text-slate-400 block mt-0.5">ID Registro de Origen: {recordId}</span>
        </p>
      </div>

      {/* 2. ¿Qué cambió? y ¿A qué cambió? */}
      <div className="space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Detalles del Cambio</p>
        {statusChangeElement}

        {changesList.length > 0 ? (
          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-1/3">¿Qué cambió? (Campo)</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-1/3">Valor Anterior</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-1/3">¿A qué cambió? (Valor Nuevo)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {changesList.map((ch, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/10">
                    <td className="px-3 py-2 font-bold text-slate-600">
                      {ch.label} <span className="text-[8px] font-mono text-slate-300 font-normal block">({ch.field})</span>
                    </td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[150px]" title={ch.oldVal}>{ch.oldVal}</td>
                    <td className="px-3 py-2 text-slate-900 font-bold truncate max-w-[150px]" title={ch.newVal}>{ch.newVal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : valuesList.length > 0 ? (
          <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 text-slate-400 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-1/2">Propiedad</th>
                  <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[9px] w-1/2">Valor Registrado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {valuesList.map((val, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/10">
                    <td className="px-3 py-2 font-bold text-slate-600">
                      {val.label} <span className="text-[8px] font-mono text-slate-300 font-normal block">({val.field})</span>
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-medium truncate max-w-[200px]" title={val.value}>{val.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No se registraron cambios en campos del sistema.</p>
        )}
      </div>

      {/* 3. Enlace a OC u OS */}
      {(poId || soId) && (
        <div className="pt-2 border-t border-slate-150 flex flex-wrap gap-2">
          {poId && (
            <Link to={`/purchase-orders/${poId}`}>
              <Button size="sm" className="bg-red-50 text-procarni-primary hover:bg-red-100 hover:text-procarni-primary border border-red-200/50 shadow-sm flex items-center gap-1.5 h-8 rounded-xl font-bold text-[11px] transition-all">
                <FileText className="w-3.5 h-3.5" />
                Ver Orden de Compra (OC)
              </Button>
            </Link>
          )}
          {soId && (
            <Link to={`/service-orders/${soId}`}>
              <Button size="sm" className="bg-blue-50 text-procarni-blue hover:bg-blue-100 hover:text-procarni-blue border border-blue-200/50 shadow-sm flex items-center gap-1.5 h-8 rounded-xl font-bold text-[11px] transition-all">
                <FileText className="w-3.5 h-3.5" />
                Ver Orden de Servicio (OS)
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

const AuditLog = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'orders' | 'receptions' | 'materials' | 'suppliers' | 'quotes'>('all');
  const { role, isLoadingSession } = useSession();

  const defaultStartDate = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  };

  const defaultEndDate = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  };

  const [startDate, setStartDate] = useState<string>(defaultStartDate());
  const [endDate, setEndDate] = useState<string>(defaultEndDate());
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleExpand = (logId: string) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  useEffect(() => {
    if (!isLoadingSession && role !== 'admin') {
      navigate('/');
      showError('No tienes permisos para acceder a esta página.');
    }
  }, [role, isLoadingSession, navigate]);

  const { data: logs, isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: ['auditLogs', startDate, endDate],
    queryFn: () => getAllAuditLogs(startDate ? `${startDate}T00:00:00Z` : undefined, endDate ? `${endDate}T23:59:59Z` : undefined),
  });

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    
    // First, filter by tab category
    let tabFiltered = logs;
    if (activeTab === 'orders') {
      tabFiltered = logs.filter(log => {
        const t = (log.table || '').toLowerCase();
        const a = log.action.toLowerCase();
        return t.includes('purchase_order') || t.includes('service_order') || a.includes('purchase_order') || a.includes('service_order');
      });
    } else if (activeTab === 'receptions') {
      tabFiltered = logs.filter(log => {
        const t = (log.table || '').toLowerCase();
        const a = log.action.toLowerCase();
        const d = (log.description || '').toLowerCase();
        return t.includes('reception') || a.includes('reception') || a.includes('transit') || d.includes('recep') || d.includes('tráns') || d.includes('recib');
      });
    } else if (activeTab === 'materials') {
      tabFiltered = logs.filter(log => {
        const t = (log.table || '').toLowerCase();
        const a = log.action.toLowerCase();
        return t === 'materials' || t.includes('category') || t.includes('measure') || t.includes('price') || a.includes('material') || a.includes('category') || a.includes('measure') || a.includes('price');
      });
    } else if (activeTab === 'suppliers') {
      tabFiltered = logs.filter(log => {
        const t = (log.table || '').toLowerCase();
        const a = log.action.toLowerCase();
        return t.includes('supplier') || a.includes('supplier');
      });
    } else if (activeTab === 'quotes') {
      tabFiltered = logs.filter(log => {
        const t = (log.table || '').toLowerCase();
        const a = log.action.toLowerCase();
        return t.includes('quote_request') || t.includes('quote_comparison') || t.includes('ficha') || a.includes('quote_request') || a.includes('quote_comparison') || a.includes('ficha');
      });
    }

    if (!searchTerm) return tabFiltered;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return tabFiltered.filter(log =>
      log.action.toLowerCase().includes(lowerCaseSearchTerm) ||
      (log.user_email && log.user_email.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (log.table && log.table.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (log.description && log.description.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [logs, activeTab, searchTerm]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Cargando historial de auditoría...
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error al cargar el historial de auditoría: {error.message}
      </div>
    );
  }

  const actionMap: Record<string, { label: string, color: string, icon?: React.ElementType }> = {
    // Quote Requests
    CREATE_QUOTE_REQUEST: { label: 'Crear Solic. Cotización', color: 'bg-green-50 text-emerald-700 border-green-200 hover:bg-green-50', icon: Plus },
    UPDATE_QUOTE_REQUEST: { label: 'Editar Solic. Cotización', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50', icon: Edit },
    UPDATE_QUOTE_REQUEST_STATUS: { label: 'Cambiar Estado Solic.', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50', icon: CheckCircle },
    BULK_ARCHIVE_QUOTE_REQUESTS: { label: 'Archivar SCs Masivo', color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50', icon: Archive },
    DELETE_QUOTE_REQUEST: { label: 'Eliminar Solic. Cot.', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50', icon: Trash },
    
    // Service Orders
    CREATE_SERVICE_ORDER: { label: 'Crear Orden Ser.', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50', icon: Plus },
    UPDATE_SERVICE_ORDER: { label: 'Editar Orden Ser.', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50', icon: Edit },
    UPDATE_SERVICE_ORDER_STATUS: { label: 'Cambiar Estado OS', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 hover:bg-fuchsia-50', icon: CheckCircle },
    DELETE_SERVICE_ORDER: { label: 'Eliminar Orden Ser.', color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50', icon: Trash },

    // Purchase Orders (Bulks)
    BULK_ARCHIVE_PURCHASE_ORDERS: { label: 'Archivar OCs Masivo', color: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50', icon: Archive },

    // Quote Comparisons
    CREATE_QUOTE_COMPARISON: { label: 'Crear Comparativo', color: 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50', icon: FileText },
    UPDATE_QUOTE_COMPARISON: { label: 'Editar Comparativo', color: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-50', icon: Edit },
    DELETE_QUOTE_COMPARISON: { label: 'Eliminar Comparativo', color: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-50', icon: Trash },

    // Material Quotes
    DELETE_QUOTE: { label: 'Eliminar Cotización', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50', icon: Trash },

    // Materials
    CREATE_MATERIAL: { label: 'Crear Material', color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50', icon: Package },
    UPDATE_MATERIAL: { label: 'Editar Material', color: 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-50', icon: Edit },
    DELETE_MATERIAL: { label: 'Eliminar Material', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50', icon: Trash },

    // Suppliers
    CREATE_SUPPLIER: { label: 'Crear Proveedor', color: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50', icon: Truck },
    UPDATE_SUPPLIER: { label: 'Editar Proveedor', color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50', icon: Edit },
    DELETE_SUPPLIER: { label: 'Eliminar Proveedor', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50', icon: Trash },

    // Companies
    CREATE_COMPANY: { label: 'Crear Empresa', color: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-50', icon: Building2 },
    UPDATE_COMPANY: { label: 'Editar Empresa', color: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-50', icon: Edit },
    DELETE_COMPANY: { label: 'Eliminar Empresa', color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50', icon: Trash },

    // Fichas Técnicas
    UPLOAD_FICHA_TECNICA: { label: 'Subir Ficha Técnica', color: 'bg-lime-50 text-lime-700 border-lime-200/50 hover:bg-lime-50', icon: UploadCloud },
    DELETE_FICHA_TECNICA: { label: 'Eliminar Ficha Técnica', color: 'bg-rose-50 text-rose-700 border-rose-200/50 hover:bg-rose-50', icon: Trash },

    // Receptions / Transit
    update_reception_status: { label: 'Establecer Tránsito', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50', icon: Truck },
    update_order_reception_state: { label: 'Registrar Recepción', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50', icon: PackageCheck },
  };

  const getActionDisplay = (action: string, details?: any) => {
    if (actionMap[action]) return actionMap[action];

    const isInsert = action.startsWith('Creación en');
    const isUpdate = action.startsWith('Actualización en');
    const isDelete = action.startsWith('Eliminación en');
    
    // Choose icon based on database table name
    const table = (details?.table || '').toLowerCase();
    let Icon: React.ElementType = FileText;
    if (table.includes('material') || table.includes('category') || table.includes('measure')) {
      Icon = Package;
    } else if (table.includes('supplier')) {
      Icon = Truck;
    } else if (table.includes('company')) {
      Icon = Building2;
    } else if (table.includes('quote_request')) {
      Icon = FileText;
    } else if (table.includes('quote_comparison')) {
      Icon = ClipboardList;
    } else if (table.includes('ficha')) {
      Icon = UploadCloud;
    }

    if (isInsert) {
      return { label: action, color: 'bg-green-50 text-emerald-700 border-green-200/30 hover:bg-green-50', icon: Icon };
    }
    if (isUpdate) {
      if (details?.new_status) {
         return { label: 'Cambio de Estado', color: 'bg-purple-50 text-purple-700 border-purple-200/30 hover:bg-purple-50', icon: CheckCircle };
      }
      return { label: action, color: 'bg-blue-50 text-blue-700 border-blue-200/30 hover:bg-blue-50', icon: Icon };
    }
    if (isDelete) {
      return { label: action, color: 'bg-red-50 text-red-700 border-red-200/30 hover:bg-red-50', icon: Trash };
    }

    return { label: action, color: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-50', icon: Icon };
  };

  const renderActionBadge = (action: string, details?: any) => {
    const { label, color, icon: Icon } = getActionDisplay(action, details);
    return (
      <Badge variant="outline" className={`font-semibold text-[10px] tracking-wide uppercase ${color} border-none flex items-center w-fit gap-1 rounded-full px-2 py-0.5`}>
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Kardex de Auditoría</h1>
          <p className="text-muted-foreground text-sm">Registro continuo de transacciones, movimientos y auditoría del sistema.</p>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-2xl shadow-gray-200/50 bg-transparent md:bg-white/70 backdrop-blur-xl rounded-[2rem] ring-1 ring-white">
        <CardContent className="p-0 md:p-8">
          
          {/* Date range filter and search */}
          <div className="flex flex-col gap-4 mb-6 bg-slate-50 border border-slate-100 p-4 rounded-[1.5rem] shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-procarni-dark uppercase tracking-widest text-slate-500">Filtrado por Rango de Fecha</p>
                <p className="text-[11px] text-slate-400 font-medium italic">Filtra las acciones registradas en el rango seleccionado.</p>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate(defaultStartDate());
                    setEndDate(defaultEndDate());
                  }}
                  className="h-8 text-[11px] font-bold rounded-xl border-slate-200 text-slate-600 bg-white hover:bg-slate-100 shrink-0"
                >
                  Mes Actual
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="h-8 text-[11px] font-bold rounded-xl border-slate-200 text-slate-600 bg-white hover:bg-slate-100 shrink-0"
                >
                  Historial Completo
                </Button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3 max-w-md w-full">
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Desde</label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-white text-xs h-9 rounded-xl border-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Hasta</label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-white text-xs h-9 rounded-xl border-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Tabs Filter matching Premium style */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full md:w-auto">
              <TabsList className="grid grid-cols-6 h-9 bg-slate-100 p-0.5 rounded-xl">
                <TabsTrigger value="all" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Todo</TabsTrigger>
                <TabsTrigger value="orders" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Órdenes</TabsTrigger>
                <TabsTrigger value="receptions" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Recepciones</TabsTrigger>
                <TabsTrigger value="materials" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Materiales</TabsTrigger>
                <TabsTrigger value="suppliers" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Proveedores</TabsTrigger>
                <TabsTrigger value="quotes" className="text-[11px] font-bold rounded-lg data-[state=active]:bg-white data-[state=active]:text-procarni-dark">Cotizaciones</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-80">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Buscar en Kardex..."
                className="w-full bg-slate-50 pl-9 h-9 text-xs rounded-xl border-slate-150 focus:ring-procarni-primary/20"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {filteredLogs.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="p-4 border-slate-150 rounded-2xl shadow-sm bg-white/70 backdrop-blur-md">
                    <div className="flex justify-between items-start mb-3">
                      {renderActionBadge(log.action, log.raw_details)}
                      <span className="text-[10px] text-slate-400 flex items-center font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 font-mono">
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        {new Date(log.timestamp).toLocaleDateString('es-VE')}
                      </span>
                    </div>
                    <div className="text-sm space-y-2">
                      <div className="flex items-center text-xs text-slate-500 font-medium">
                        <User className="mr-1.5 h-3.5 w-3.5 text-slate-400 bg-slate-100 p-0.5 rounded-full" /> 
                        <span>{log.user_email || 'Sistema'}</span>
                      </div>
                      
                      <div className="text-slate-800 bg-slate-50/50 p-3 rounded-xl text-xs border border-slate-100">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-procarni-dark mb-1">{log.description || 'Sin descripción'}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpand(log.id)}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg flex items-center justify-center shrink-0"
                          >
                            {expandedLogs[log.id] ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                        {expandedLogs[log.id] && (
                          <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-150">
                            <LogDetails log={log} />
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between bg-white border border-slate-100 p-1.5 rounded-lg text-[10px] text-slate-400 font-mono mt-1">
                         <span>Tabla: {log.table || 'N/A'}</span>
                         <span>ID: {log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-150 overflow-hidden bg-white/60 backdrop-blur-sm shadow-xl shadow-gray-150/10">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b border-slate-150">
                    <TableRow>
                      <TableHead className="font-bold text-[10px] tracking-widest uppercase text-slate-400 pl-4 py-3 min-w-[130px]">Fecha / Hora</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-widest uppercase text-slate-400 py-3 min-w-[180px]">Usuario</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-widest uppercase text-slate-400 py-3 min-w-[200px]">Acción / Transacción</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-widest uppercase text-slate-400 py-3 w-[120px]">Entidad</TableHead>
                      <TableHead className="font-bold text-[10px] tracking-widest uppercase text-slate-400 pr-4 py-3 w-full">Detalle del Movimiento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-blue-50/10 transition-colors group">
                        <TableCell className="pl-4 py-3 text-[11px] text-slate-500 font-mono align-top">
                          <div className="flex items-center text-nowrap bg-slate-50 w-fit px-2 py-0.5 rounded border border-slate-100">
                            <Clock className="w-2.5 h-2.5 mr-1 text-slate-400"/>
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-xs font-semibold text-slate-700 align-top">
                          <div className="flex items-center bg-white border border-slate-100 w-fit px-2 py-0.5 rounded-lg shadow-sm">
                            <User className="w-3 h-3 mr-1 text-slate-400" />
                            {log.user_email || 'Sistema'}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 align-top">
                           {renderActionBadge(log.action, log.raw_details)}
                        </TableCell>
                        <TableCell className="py-3 align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 w-fit">{log.table || 'N/A'}</span>
                            <span className="text-[9px] font-mono text-slate-400">ID: {log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="pr-4 py-3 align-top">
                          <div className="flex items-start justify-between gap-4">
                            <span className="text-xs text-procarni-dark font-bold block mb-1">{log.description || 'Sin descripción general'}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpand(log.id)}
                              className="h-8 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl px-2.5 flex items-center gap-1.5 shrink-0 transition-all shadow-sm border border-slate-100 bg-white"
                            >
                              {expandedLogs[log.id] ? (
                                <>
                                  Ocultar Detalle
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </>
                              ) : (
                                <>
                                  Ver Detalle
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </>
                              )}
                            </Button>
                          </div>
                          {expandedLogs[log.id] && (
                            <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                              <LogDetails log={log} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <div className="text-center text-slate-500 py-12 border border-dashed border-slate-200 rounded-2xl bg-white/50">
              No hay registros de movimientos en el Kardex de auditoría para este filtro o búsqueda.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AuditLog;