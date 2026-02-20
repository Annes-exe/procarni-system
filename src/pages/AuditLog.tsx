import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, Clock, User } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { getAllAuditLogs } from '@/integrations/supabase/data';
import { showError } from '@/utils/toast';
import { Input } from '@/components/ui/input';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AuditLogEntry } from '@/integrations/supabase/services/auditLogService';

const AuditLog = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');

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

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderLogDetails = (details: any) => {
    if (!details) return 'N/A';
    try {
      const detailString = JSON.stringify(details, null, 2);
      return (
        <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded-md overflow-x-auto max-w-xs md:max-w-full">
          {detailString}
        </pre>
      );
    } catch {
      return String(details);
    }
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
                  <Card key={log.id} className="p-4">
                    <CardTitle className="text-lg mb-2">{log.action}</CardTitle>
                    <div className="text-sm space-y-1">
                      <p className="flex items-center"><User className="mr-1 h-3 w-3" /> Usuario: {log.user_email || 'N/A'}</p>
                      <p className="flex items-center"><Clock className="mr-1 h-3 w-3" /> Fecha: {formatTimestamp(log.timestamp)}</p>
                      <p><strong>Tabla:</strong> {log.table || 'N/A'}</p>
                      <p><strong>ID Registro:</strong> {log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</p>
                      <p><strong>Descripción:</strong> {log.description || 'N/A'}</p>
                      {log.raw_details && Object.keys(log.raw_details).length > 3 && (
                        <div className="mt-2">
                          <p className="font-semibold">Detalles Adicionales:</p>
                          {renderLogDetails(log.raw_details)}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-gray-100 overflow-hidden bg-white">
                <Table>
                  <TableHeader className="bg-gray-50/50">
                    <TableRow>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3 w-[150px]">Fecha</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3 w-[150px]">Usuario</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3 w-[150px]">Acción</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3 w-[100px]">Tabla</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3 w-[100px]">ID Registro</TableHead>
                      <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="pl-4 py-3 text-xs text-gray-600">{formatTimestamp(log.timestamp)}</TableCell>
                        <TableCell className="py-3 text-sm text-gray-600">{log.user_email || 'N/A'}</TableCell>
                        <TableCell className="py-3 font-medium text-procarni-dark">{log.action}</TableCell>
                        <TableCell className="py-3 text-sm text-gray-600">{log.table || 'N/A'}</TableCell>
                        <TableCell className="py-3 text-sm text-gray-600">{log.record_id ? log.record_id.substring(0, 8) : 'N/A'}</TableCell>
                        <TableCell className="pr-4 py-3 text-sm text-gray-600">{log.description || renderLogDetails(log.raw_details)}</TableCell>
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
      <MadeWithDyad />
    </div>
  );
};

export default AuditLog;