import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Clock, User, Plus, Edit, Trash, CheckCircle, XCircle, ArrowRight, Eye, EyeOff, Package, Truck, Building2, FileText, UploadCloud, Archive } from 'lucide-react';

import { getAllAuditLogs } from '@/integrations/supabase/data';
import { showError } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AuditLogEntry } from '@/integrations/supabase/services/auditLogService';
import { useSession } from '@/components/SessionContextProvider';
const getStatusBadge = (status: string) => {
  if (!status) return null;
  const s = status.toLowerCase();
  let colorClass = 'bg-slate-100 text-slate-800';
  if (s === 'approved' || s === 'aprobado') colorClass = 'bg-[#e2f5ec] text-[#1b7b44]';
  if (s === 'rejected' || s === 'rechazado') colorClass = 'bg-red-100 text-red-800';
  if (s === 'draft' || s === 'borrador') colorClass = 'bg-slate-100 text-slate-800';
  if (s === 'sent' || s === 'enviado') colorClass = 'bg-blue-100 text-blue-800';
  if (s === 'archived' || s === 'archivado') colorClass = 'bg-orange-100 text-orange-800';

  return (
    <div className={`font-medium ${colorClass} rounded px-2 py-0.5 text-[11px] border border-black/5`}>
      {status}
    </div>
  );
};

const LogDetails = ({ details }: { details: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!details) return null;

  let infoBlocks = [];
  if (details.supplier_id) infoBlocks.push(`Proveedor ID: ${details.supplier_id.substring(0,8)}`);
  if (details.items_count !== undefined) infoBlocks.push(`Ítems: ${details.items_count}`);
  
  const detailString = JSON.stringify(details, null, 2);
  const hasDetails = detailString !== '{}';

  return (
    <div className="flex flex-col gap-2">
      {details.new_status && (
        <div className="flex items-center text-sm bg-white border border-slate-100 p-1 rounded max-w-fit shadow-sm">
          <span className="text-slate-500 flex items-center font-medium text-[11px] ml-2">
            Nuevo Estado
            <ArrowRight className="w-3.5 h-3.5 mx-2 text-slate-300" />
          </span>
          {getStatusBadge(details.new_status)}
        </div>
      )}
      
      {infoBlocks.length > 0 && !details.updates && (
        <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{infoBlocks.join(' | ')}</div>
      )}

      {hasDetails && (
        <div className="mt-1">
           <Button variant="outline" size="sm" className="h-7 text-[11px] bg-white text-slate-500 shadow-sm hover:text-slate-700 hover:bg-slate-50 border-slate-200" onClick={() => setIsOpen(!isOpen)}>
             {isOpen ? <><EyeOff className="w-3 h-3 mr-1.5"/> Ocultar Detalles</> : <><Eye className="w-3 h-3 mr-1.5"/> Ver Detalles Técnicos</>}
           </Button>
           {isOpen && (
             <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
               <pre className="text-xs bg-slate-50 border border-slate-200 text-slate-600 p-2.5 rounded-md overflow-x-auto max-w-fit font-mono">
                 {detailString}
               </pre>
             </div>
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
  const { role, isLoadingSession } = useSession();

  useEffect(() => {
    if (!isLoadingSession && role !== 'admin') {
      navigate('/');
      showError('No tienes permisos para acceder a esta página.');
    }
  }, [role, isLoadingSession, navigate]);

  const { data: logs, isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: ['auditLogs'],
    queryFn: getAllAuditLogs,
  });

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    if (!searchTerm) return logs;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return logs.filter(log =>
      log.action.toLowerCase().includes(lowerCaseSearchTerm) ||
      (log.user_email && log.user_email.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (log.table && log.table.toLowerCase().includes(lowerCaseSearchTerm)) ||
      (log.description && log.description.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [logs, searchTerm]);

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
    CREATE_QUOTE_REQUEST: { label: 'Crear Solic. Cotización', color: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100', icon: Plus },
    UPDATE_QUOTE_REQUEST: { label: 'Editar Solic. Cotización', color: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100', icon: Edit },
    UPDATE_QUOTE_REQUEST_STATUS: { label: 'Cambiar Estado Solic.', color: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100', icon: CheckCircle },
    BULK_ARCHIVE_QUOTE_REQUESTS: { label: 'Archivar SCs Masivo', color: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100', icon: Archive },
    DELETE_QUOTE_REQUEST: { label: 'Eliminar Solic. Cot.', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash },
    
    // Service Orders
    CREATE_SERVICE_ORDER: { label: 'Crear Orden Ser.', color: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-100', icon: Plus },
    UPDATE_SERVICE_ORDER: { label: 'Editar Orden Ser.', color: 'bg-indigo-100 text-indigo-800 border-indigo-200 hover:bg-indigo-100', icon: Edit },
    UPDATE_SERVICE_ORDER_STATUS: { label: 'Cambiar Estado OS', color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 hover:bg-fuchsia-100', icon: CheckCircle },
    DELETE_SERVICE_ORDER: { label: 'Eliminar Orden Ser.', color: 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100', icon: Trash },

    // Purchase Orders (Bulks)
    BULK_ARCHIVE_PURCHASE_ORDERS: { label: 'Archivar OCs Masivo', color: 'bg-orange-100 text-orange-800 border-orange-200 hover:bg-orange-100', icon: Archive },

    // Quote Comparisons
    CREATE_QUOTE_COMPARISON: { label: 'Crear Comparativo', color: 'bg-teal-100 text-teal-800 border-teal-200 hover:bg-teal-100', icon: FileText },
    UPDATE_QUOTE_COMPARISON: { label: 'Editar Comparativo', color: 'bg-cyan-100 text-cyan-800 border-cyan-200 hover:bg-cyan-100', icon: Edit },
    DELETE_QUOTE_COMPARISON: { label: 'Eliminar Comparativo', color: 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100', icon: Trash },

    // Material Quotes
    DELETE_QUOTE: { label: 'Eliminar Cotización', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash },

    // Materials
    CREATE_MATERIAL: { label: 'Crear Material', color: 'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100', icon: Package },
    UPDATE_MATERIAL: { label: 'Editar Material', color: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100', icon: Edit },
    DELETE_MATERIAL: { label: 'Eliminar Material', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash },

    // Suppliers
    CREATE_SUPPLIER: { label: 'Crear Proveedor', color: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-100', icon: Truck },
    UPDATE_SUPPLIER: { label: 'Editar Proveedor', color: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100', icon: Edit },
    DELETE_SUPPLIER: { label: 'Eliminar Proveedor', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash },

    // Companies
    CREATE_COMPANY: { label: 'Crear Empresa', color: 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-100', icon: Building2 },
    UPDATE_COMPANY: { label: 'Editar Empresa', color: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100', icon: Edit },
    DELETE_COMPANY: { label: 'Eliminar Empresa', color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash },

    // Fichas Técnicas
    UPLOAD_FICHA_TECNICA: { label: 'Subir Ficha Técnica', color: 'bg-lime-100 text-lime-800 border-lime-200 hover:bg-lime-100', icon: UploadCloud },
    DELETE_FICHA_TECNICA: { label: 'Eliminar Ficha Técnica', color: 'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-100', icon: Trash },
  };

  const getActionDisplay = (action: string, details?: any) => {
    if (actionMap[action]) return actionMap[action];

    // Handle database trigger actions ("Creación en ...", "Actualización en ...", "Eliminación en ...")
    if (action.startsWith('Creación en')) {
      return { label: action, color: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100', icon: Plus };
    }
    if (action.startsWith('Actualización en')) {
      if (details?.new_status) {
         return { label: 'Cambio de Estado', color: 'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-100', icon: CheckCircle };
      }
      return { label: action, color: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100', icon: Edit };
    }
    if (action.startsWith('Eliminación en')) {
      return { label: action, color: 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100', icon: Trash };
    }

    return { label: action, color: 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-100' };
  };

  const renderActionBadge = (action: string, details?: any) => {
    const { label, color, icon: Icon } = getActionDisplay(action, details);
    return (
      <Badge variant="outline" className={`font-medium ${color} border-none flex items-center w-fit gap-1.5 rounded-full px-2.5 py-0.5`}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
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
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Historial de Auditoría</h1>
          <p className="text-muted-foreground text-sm">Registro de todas las acciones importantes realizadas en el sistema.</p>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6">
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por acción, email, tabla o descripción..."
              className="w-full appearance-none bg-background pl-8 h-9 text-sm shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredLogs.length > 0 ? (
            isMobile ? (
              <div className="grid gap-4">
                {filteredLogs.map((log) => (
                  <Card key={log.id} className="p-4 border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      {renderActionBadge(log.action, log.raw_details)}
                      <span className="text-xs text-slate-400 flex items-center font-medium bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                        <Clock className="w-3 h-3 mr-1" />
                        {new Date(log.timestamp).toLocaleDateString('es-VE')}
                      </span>
                    </div>
                    <div className="text-sm space-y-3">
                      <div className="flex items-center text-slate-700">
                        <User className="mr-2 h-4 w-4 text-slate-400 bg-slate-100 p-0.5 rounded-full" /> 
                        <span className="font-medium">{log.user_email || 'Sistema'}</span>
                      </div>
                      
                      <div className="text-slate-700 bg-slate-50 p-3 rounded-lg text-sm border border-slate-100 shadow-sm">
                        <p className="font-medium mb-1">{log.description || 'Sin descripción'}</p>
                        <LogDetails details={log.raw_details} />
                      </div>
                      
                      <div className="flex justify-between bg-white border border-slate-100 p-2 rounded text-xs text-slate-500 mt-2">
                         <span className="font-mono">T: {log.table || 'N/A'}</span>
                         <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">ID: {log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 overflow-hidden bg-white shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                    <TableRow>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-slate-500 pl-4 py-3 min-w-[140px]">Fecha</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-slate-500 py-3 min-w-[200px]">Usuario</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-slate-500 py-3 min-w-[220px]">Acción</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-slate-500 py-3 w-[100px]">Tabla / Ref</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-slate-500 pr-4 py-3 w-full">Descripción y Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="pl-4 py-3 text-xs text-slate-600 align-top">
                          <div className="flex items-center text-nowrap font-medium bg-slate-50 w-fit px-2 py-1 rounded border border-slate-100">
                            <Clock className="w-3 h-3 mr-1.5 text-slate-400"/>
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-sm font-medium text-slate-700 align-top">
                          <div className="flex items-center bg-white border border-slate-100 w-fit px-2 py-1 rounded shadow-sm">
                            <User className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                            {log.user_email || 'Sistema'}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 align-top">
                           {renderActionBadge(log.action, log.raw_details)}
                        </TableCell>
                        <TableCell className="py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 w-fit">{log.table || 'N/A'}</span>
                            <span className="text-[11px] font-mono text-slate-400">ID:{log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="pr-4 py-3 align-top">
                          <span className="text-sm text-slate-800 font-medium block mb-1">{log.description || 'Sin descripción general'}</span>
                          <LogDetails details={log.raw_details} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : (
            <div className="text-center text-muted-foreground p-8">
              No hay registros de auditoría disponibles o no se encontraron resultados para tu búsqueda.
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
};

export default AuditLog;