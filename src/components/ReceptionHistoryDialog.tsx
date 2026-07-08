import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, FileText, Calendar, Clock, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReceptionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReceptionRecord {
  id: string;
  timestamp: string;
  user_email: string;
  materialName: string;
  quantity: number;
  orderNumber: string;
}

export const ReceptionHistoryDialog: React.FC<ReceptionHistoryDialogProps> = ({ isOpen, onClose }) => {
  const [filterPeriod, setFilterPeriod] = useState<'all' | 'week' | 'month' | 'custom'>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { data: rawLogs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['reception_history_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'update_received_quantity')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  // Process and parse logs
  const receptionRecords = useMemo((): ReceptionRecord[] => {
    return rawLogs.map((log: any) => {
      const details = log.details || {};
      let materialName = details.material_name || '';
      let quantity = Number(details.quantity_received || 0);
      let orderNumber = details.order_number || '';

      // Fallback parsing from description text if structured fields are missing
      if (!materialName || !quantity || !orderNumber) {
        const desc = details.description || '';
        const match = desc.match(/Recibió\s+([\d\.]+)\s+unidades\s+del\s+material\s+'(.*)'\s+en\s+la\s+orden\s+de\s+compra\s+([A-Za-z0-9\-]+)/);
        if (match) {
          quantity = Number(match[1]);
          materialName = match[2];
          orderNumber = match[3];
        } else {
          // Alternative regex for variations
          const altMatch = desc.match(/Recibió\s+([\d\.]+)\s+.*material\s+'(.*)'\s+en.*orden.*(OC-[\d\-]+)/i);
          if (altMatch) {
            quantity = Number(altMatch[1]);
            materialName = altMatch[2];
            orderNumber = altMatch[3];
          } else {
            materialName = desc || 'Material Desconocido';
          }
        }
      }

      return {
        id: log.id,
        timestamp: log.timestamp,
        user_email: log.user_email || 'Sistema',
        materialName,
        quantity,
        orderNumber: orderNumber || 'N/A',
      };
    });
  }, [rawLogs]);

  // Filter records based on selected period
  const filteredRecords = useMemo(() => {
    const now = new Date();
    return receptionRecords.filter((rec) => {
      const recDate = new Date(rec.timestamp);

      if (filterPeriod === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return recDate >= oneWeekAgo;
      }
      if (filterPeriod === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(now.getMonth() - 1);
        return recDate >= oneMonthAgo;
      }
      if (filterPeriod === 'custom') {
        let matchStart = true;
        let matchEnd = true;
        if (startDate) {
          const start = new Date(startDate);
          start.setHours(0, 0, 0, 0);
          matchStart = recDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchEnd = recDate <= end;
        }
        return matchStart && matchEnd;
      }
      return true; // 'all'
    });
  }, [receptionRecords, filterPeriod, startDate, endDate]);

  // Group and consolidate quantities by material name
  const consolidatedSummary = useMemo(() => {
    const map = new Map<string, { materialName: string; totalQuantity: number; count: number }>();
    filteredRecords.forEach((rec) => {
      const existing = map.get(rec.materialName);
      if (existing) {
        existing.totalQuantity += rec.quantity;
        existing.count += 1;
      } else {
        map.set(rec.materialName, {
          materialName: rec.materialName,
          totalQuantity: rec.quantity,
          count: 1,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [filteredRecords]);

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Title & Header setup
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(27, 41, 74); // Procarni blue
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // Primary red
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // Dark slate
      doc.text('Reporte de Historial de Recepciones', 200, 18, { align: 'right' });

      // Period text
      let periodLabel = 'Todos los registros';
      if (filterPeriod === 'week') periodLabel = 'Última Semana';
      else if (filterPeriod === 'month') periodLabel = 'Último Mes';
      else if (filterPeriod === 'custom') {
        const from = startDate ? format(new Date(startDate), 'dd/MM/yyyy') : 'Inicio';
        const to = endDate ? format(new Date(endDate), 'dd/MM/yyyy') : 'Fin';
        periodLabel = `Periodo: ${from} - ${to}`;
      }

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Periodo: ${periodLabel}`, 200, 23, { align: 'right' });
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 28, { align: 'right' });

      // 1. Consolidated Table
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(27, 41, 74);
      doc.text('Resumen Consolidado por Material', 14, 35);

      const consolidatedData = consolidatedSummary.map((sum) => [
        sum.materialName,
        sum.totalQuantity.toString(),
        sum.count.toString()
      ]);

      autoTable(doc, {
        startY: 39,
        head: [['Material / Ítem', 'Total Recibido', 'Nro. de Recepciones']],
        body: consolidatedData,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1 },
          lineColor: [226, 232, 240],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249],
        },
        styles: {
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 120 },
          1: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
          2: { cellWidth: 35, halign: 'center' },
        },
      });

      // @ts-ignore
      const midY = doc.lastAutoTable?.finalY || 80;

      // 2. Chronological Details Table
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(27, 41, 74);
      doc.text('Detalle Cronológico de Entradas', 14, midY + 12);

      const tableData = filteredRecords.map((rec) => [
        format(new Date(rec.timestamp), 'dd/MM/yyyy HH:mm'),
        rec.materialName,
        rec.quantity.toString(),
        rec.orderNumber,
        rec.user_email,
      ]);

      autoTable(doc, {
        startY: midY + 16,
        head: [['Fecha/Hora', 'Material / Ítem', 'Cant. Recibida', 'O.C. Asoc.', 'Usuario']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1 },
          lineColor: [226, 232, 240],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249],
        },
        styles: {
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 65 },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          4: { cellWidth: 40 },
        },
      });

      // Save document
      const fileDate = new Date().toISOString().split('T')[0];
      doc.save(`Reporte_Historico_Recepciones_${fileDate}.pdf`);
    } catch (e) {
      console.error('Error generating PDF:', e);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[90vw] p-6 bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl rounded-3xl z-50 animate-in fade-in zoom-in-95 duration-200">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-extrabold text-procarni-blue flex items-center gap-2">
            <Clock className="h-5 w-5 text-procarni-primary" />
            Histórico de Recepciones
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 font-medium italic">
            Visualiza y descarga el reporte de materiales ingresados al sistema.
          </DialogDescription>
        </DialogHeader>

        {/* Filter Controls */}
        <div className="space-y-4 my-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border shadow-sm">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterPeriod('all')}
                className={cn(
                  "h-7 text-xs px-2.5 rounded-lg transition-all",
                  filterPeriod === 'all' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white"
                )}
              >
                Todos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterPeriod('week')}
                className={cn(
                  "h-7 text-xs px-2.5 rounded-lg transition-all",
                  filterPeriod === 'week' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white"
                )}
              >
                Semana
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterPeriod('month')}
                className={cn(
                  "h-7 text-xs px-2.5 rounded-lg transition-all",
                  filterPeriod === 'month' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white"
                )}
              >
                Mes
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilterPeriod('custom')}
                className={cn(
                  "h-7 text-xs px-2.5 rounded-lg transition-all",
                  filterPeriod === 'custom' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white"
                )}
              >
                Periodo
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                onClick={() => refetch()}
                disabled={isFetching}
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-xl shrink-0 border-slate-200 text-slate-500 hover:text-procarni-primary"
                title="Actualizar datos"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </Button>

              <Button
                onClick={handleDownloadPDF}
                disabled={filteredRecords.length === 0}
                className="h-8 text-xs font-bold bg-procarni-primary hover:bg-red-800 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                <FileText className="h-3.5 w-3.5" />
                Descargar PDF ({filteredRecords.length})
              </Button>
            </div>
          </div>

          {filterPeriod === 'custom' && (
            <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desde</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-procarni-primary/20"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hasta</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-procarni-primary/20"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Records Content */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-procarni-primary" />
            <span className="text-sm">Buscando recepciones históricas...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center gap-2 text-slate-400">
            <FileText className="h-10 w-10 text-slate-300 animate-pulse" />
            <p className="text-sm font-bold text-slate-600">No se encontraron recepciones</p>
            <p className="text-xs max-w-xs px-4">No hay registros de ingreso de materiales registrados en el rango seleccionado.</p>
          </div>
        ) : (
          <ScrollArea className="h-96 border border-slate-100 rounded-2xl bg-slate-50/20 p-2">
            <div className="space-y-6">
              {/* Consolidated Summary Table */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Resumen de Totales Recibidos por Material</h5>
                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5">Material</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5 text-center">Total Recibido</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5 text-center">Nro. Ingresos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {consolidatedSummary.map((sum, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/30">
                          <TableCell className="text-xs font-bold text-procarni-dark py-2.5">{sum.materialName}</TableCell>
                          <TableCell className="text-xs text-center py-2.5">
                            <Badge className="bg-green-50 text-procarni-secondary border border-green-200/50 font-mono font-bold text-[10px]">
                              {sum.totalQuantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-center text-slate-500 py-2.5">{sum.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Chronological Detailed Table */}
              <div className="space-y-2">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Detalle Cronológico de Entradas</h5>
                <div className="border border-slate-100 rounded-xl overflow-hidden bg-white shadow-sm">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5">Fecha/Hora</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5">Material</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5 text-center">Cantidad</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5 text-center">O.C.</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-slate-500 py-2.5">Usuario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecords.map((rec) => (
                        <TableRow key={rec.id} className="hover:bg-slate-50/30">
                          <TableCell className="text-xs text-slate-500 font-medium py-2.5">
                            {format(new Date(rec.timestamp), 'dd/MM/yyyy HH:mm', { locale: es })}
                          </TableCell>
                          <TableCell className="text-xs font-bold text-procarni-dark py-2.5">
                            {rec.materialName}
                          </TableCell>
                          <TableCell className="text-xs text-center py-2.5">
                            <Badge variant="secondary" className="font-mono font-bold text-[10px]">
                              +{rec.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-center font-mono font-bold text-slate-600 py-2.5">
                            {rec.orderNumber}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-400 py-2.5 truncate max-w-[120px]" title={rec.user_email}>
                            {rec.user_email.split('@')[0]}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};
