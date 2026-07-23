import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Package, PackageOpen, FileSpreadsheet, FileText, AlertCircle, History } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { ReceptionHistoryDialog } from './ReceptionHistoryDialog';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PendingOrderItem {
  id: string;
  order_id: string;
  material_name: string;
  quantity: number;
  received_quantity: number;
  unit: string | null;
  unit_price: number;
  purchase_orders: {
    sequence_number: number | null;
    created_at: string | null;
    currency: string;
    suppliers: {
      name: string;
    } | null;
  } | null;
}

const formatSequenceNumber = (sequence?: number | null, dateString?: string | null): string => {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OC-${year}-${month}-${seq}`;
};

export const PendingReceiptsIndicator: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIndicatorIds, setSelectedIndicatorIds] = useState<Set<string>>(new Set());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const handleOrderClick = (orderId: string) => {
    setIsOpen(false);
    setSelectedIndicatorIds(new Set());
    navigate(`/purchase-order-management?openTransitReport=true&orderId=${orderId}`);
  };

  const handleToggleSelect = (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    const newSelected = new Set(selectedIndicatorIds);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedIndicatorIds(newSelected);
  };

  const handleBulkOpen = () => {
    if (selectedIndicatorIds.size === 0) return;
    setIsOpen(false);
    const ids = Array.from(selectedIndicatorIds).join(',');
    setSelectedIndicatorIds(new Set());
    navigate(`/purchase-order-management?openTransitReport=true&orderId=${ids}`);
  };

  // Fetch active purchase orders (En transito or Parcial) and their items
  const { data: items = [], isLoading, refetch } = useQuery<PendingOrderItem[]>({
    queryKey: ['pending_receipts'],
    queryFn: async () => {
      // 1. Get orders that are in transit or partial
      const { data: orders, error: ordersError } = await supabase
        .from('purchase_orders')
        .select('id')
        .in('reception_status', ['En tránsito', 'Parcial']);

      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];

      const orderIds = orders.map(o => o.id);

      // 2. Get items of those orders
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          order_id,
          material_name,
          quantity,
          received_quantity,
          unit,
          unit_price,
          purchase_orders (
            sequence_number,
            created_at,
            currency,
            suppliers (
              name
            )
          )
        `)
        .in('order_id', orderIds);

      if (error) throw error;
      return (data as unknown as PendingOrderItem[]) || [];
    },
    enabled: isOpen
  });

  // Calculate stats
  const activeOrderIds = Array.from(new Set(items.map(item => item.order_id)));
  const totalItems = items.length;
  const missingItems = items.filter(item => Number(item.received_quantity || 0) < Number(item.quantity));

  let totalRequested = 0;
  let totalReceived = 0;
  items.forEach(item => {
    totalRequested += Number(item.quantity);
    totalReceived += Number(item.received_quantity || 0);
  });

  const overallProgress = totalRequested > 0 
    ? Math.min(100, Math.max(0, Math.round((totalReceived / totalRequested) * 100))) 
    : 0;

  // Group items by order for list display
  const ordersProgress = activeOrderIds.map(orderId => {
    const orderItems = items.filter(item => item.order_id === orderId);
    let req = 0;
    let rec = 0;
    orderItems.forEach(item => {
      req += Number(item.quantity);
      rec += Number(item.received_quantity || 0);
    });
    const pct = req > 0 ? Math.min(100, Math.max(0, Math.round((rec / req) * 100))) : 0;
    const firstItem = orderItems[0];
    const seq = firstItem?.purchase_orders?.sequence_number;
    const dateStr = firstItem?.purchase_orders?.created_at;
    const supplier = firstItem?.purchase_orders?.suppliers?.name || 'N/A';
    
    return {
      orderId,
      label: formatSequenceNumber(seq, dateStr),
      supplier,
      progress: pct,
      pendingCount: orderItems.filter(item => Number(item.received_quantity || 0) < Number(item.quantity)).length
    };
  });

  // Export missing items report as Excel
  const handleExportXLSX = () => {
    if (missingItems.length === 0) {
      showError('No hay materiales faltantes para reportar.');
      return;
    }

    try {
      setIsExporting(true);
      const dataToExport = missingItems.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const qty = Number(item.quantity);
        const rec = Number(item.received_quantity || 0);
        const missing = Math.max(0, qty - rec);

        return {
          'Orden de Compra': orderNum,
          'Proveedor': supplierName,
          'Material': item.material_name,
          'Solicitado': qty,
          'Recibido': rec,
          'Faltante': missing,
          'Unidad': item.unit || 'UND'
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Faltantes por Recibir');

      // Autofit columns
      const maxColWidth = dataToExport.reduce((acc, row) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String(row[key as keyof typeof row] || '');
          acc[colIndex] = Math.max(acc[colIndex] || 10, val.length + 2);
        });
        return acc;
      }, [] as number[]);
      worksheet['!cols'] = maxColWidth.map((w) => ({ wch: w }));

      XLSX.writeFile(workbook, `Reporte_Faltantes_Recepcion_${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('Reporte Excel generado.');
    } catch (error) {
      console.error('[PendingReceipts] XLSX Error:', error);
      showError('Error al exportar reporte.');
    } finally {
      setIsExporting(false);
    }
  };

  // Export missing items report as PDF
  const handleExportPDF = () => {
    if (missingItems.length === 0) {
      showError('No hay materiales faltantes para reportar.');
      return;
    }

    try {
      setIsExporting(true);
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Header
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74); // #1B294A
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // #880a0a
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // #0f172a
      doc.text('Reporte de Materiales Faltantes por Recibir', 200, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 23, { align: 'right' });

      // Summary Box
      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 30, 182, 10, 'D');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Órdenes Activas: ${activeOrderIds.length}`, 18, 36);
      doc.text(`Ítems Faltantes: ${missingItems.length}`, 120, 36);

      const tableData = missingItems.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const qty = Number(item.quantity);
        const rec = Number(item.received_quantity || 0);
        const missing = Math.max(0, qty - rec);
        const unit = item.unit || 'UND';

        return [
          orderNum,
          supplierName,
          item.material_name,
          `${qty} ${unit}`,
          `${rec} ${unit}`,
          `${missing} ${unit}`
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [['O.C.', 'Proveedor', 'Material / Ítem', 'Solicitado', 'Recibido', 'Faltante']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1.5 },
          lineColor: [203, 213, 225],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [226, 232, 240],
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255],
        },
        styles: {
          cellPadding: 2.5,
        },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 40 },
          2: { cellWidth: 55 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'center' },
          5: { cellWidth: 22, halign: 'center', fontStyle: 'bold', textColor: [136, 10, 10] },
        },
      });

      // @ts-ignore
      const finalY = doc.lastAutoTable?.finalY || 100;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado automáticamente desde el panel de control de recepciones.', 105, finalY + 20, { align: 'center' });

      doc.save(`Reporte_Faltantes_Recepcion_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Reporte PDF descargado.');
    } catch (error) {
      console.error('[PendingReceipts] PDF Error:', error);
      showError('Error al exportar reporte.');
    } finally {
      setIsExporting(false);
    }
  };

  // Simple query to count active receptions even when popover is closed
  const { data: countData } = useQuery({
    queryKey: ['pending_receipts_count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .in('reception_status', ['En tránsito', 'Parcial']);
      
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000 // Poll every 30s
  });

  const activeReceptionsCount = countData || 0;

  return (
    <Popover open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (open) refetch();
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-procarni-primary/10 text-slate-600 hover:text-procarni-primary rounded-xl transition-all"
          title="Recepciones Pendientes"
        >
          {activeReceptionsCount > 0 ? (
            <PackageOpen className="h-5 w-5 text-procarni-primary animate-bounce" />
          ) : (
            <Package className="h-5 w-5" />
          )}
          {activeReceptionsCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-procarni-primary text-[9px] font-black text-white ring-2 ring-white animate-pulse">
              {activeReceptionsCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl rounded-3xl ring-1 ring-black/5 mt-2 z-50">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0">
              <h4 className="font-extrabold text-sm text-procarni-dark flex items-center gap-1.5 truncate">
                <Package className="h-4 w-4 text-procarni-primary shrink-0" />
                Recepciones Activas
              </h4>
              <p className="text-[10px] text-gray-400 font-medium italic truncate">Estado de órdenes en tránsito/parciales</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setIsHistoryOpen(true);
              }}
              className="h-7 px-2 text-[10px] font-bold text-slate-500 hover:text-procarni-primary hover:bg-slate-50 rounded-xl flex items-center gap-1 shrink-0 shadow-sm border border-slate-100 bg-white"
              title="Ver historial de recepciones"
            >
              <History className="h-3.5 w-3.5" />
              Historial
            </Button>
          </div>

          {isLoading ? (
            <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-procarni-primary" />
              <span className="text-xs">Cargando progreso...</span>
            </div>
          ) : ordersProgress.length === 0 ? (
            <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
              <Package className="h-8 w-8 text-slate-300" />
              <span className="text-xs font-semibold">No hay órdenes en tránsito o recepción parcial.</span>
            </div>
          ) : (
            <>
              {/* Overall Consolidate Progress */}
              <div className="bg-slate-50 p-2.5 rounded-2xl border border-gray-100 space-y-1">
                <div className="flex justify-between text-[10px] font-bold text-gray-500">
                  <span>PROGRESO CONSOLIDADO</span>
                  <span className="text-procarni-primary font-mono">{overallProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      overallProgress === 100 ? "bg-green-600" : "bg-procarni-primary"
                    )}
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
                <div className="text-[9px] text-slate-400 font-medium">
                  {missingItems.length} materiales faltantes por recibir.
                </div>
              </div>

              {/* Individual orders scroll list */}
              <ScrollArea className="h-44 pr-1">
                <div className="space-y-2">
                  {ordersProgress.map((op) => (
                    <div 
                      key={op.orderId} 
                      onClick={() => handleOrderClick(op.orderId)}
                      className="p-2 border border-gray-100 hover:bg-slate-50 rounded-xl transition-all flex gap-2.5 items-center cursor-pointer hover:border-procarni-primary/30"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIndicatorIds.has(op.orderId)}
                        onChange={(e) => handleToggleSelect(e as any, op.orderId)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-procarni-primary focus:ring-procarni-primary/20 cursor-pointer shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between text-[11px] font-semibold text-procarni-dark">
                          <span className="font-mono">{op.label}</span>
                          <span>{op.progress}%</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-400 truncate">
                          <span className="truncate max-w-[120px]" title={op.supplier}>{op.supplier}</span>
                          <span className="font-medium text-amber-600">{op.pendingCount} faltantes</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              op.progress === 100 ? "bg-green-500" : "bg-procarni-primary/70"
                            )}
                            style={{ width: `${op.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Bulk Open Button */}
              {selectedIndicatorIds.size > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <Button
                    onClick={handleBulkOpen}
                    className="w-full h-9 text-xs font-bold bg-green-700 hover:bg-green-800 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 animate-in fade-in slide-in-from-bottom-2"
                  >
                    <Package className="h-4 w-4" />
                    Recibir Seleccionadas ({selectedIndicatorIds.size})
                  </Button>
                </div>
              )}

              {/* Action Buttons to export report of missing items */}
              <div className="pt-2 border-t border-gray-100 flex flex-col gap-1.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Reporte de Faltantes</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={handleExportXLSX}
                    disabled={isExporting || missingItems.length === 0}
                    variant="outline"
                    className="h-8 text-[11px] font-bold border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/5 rounded-xl gap-1"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button
                    onClick={handleExportPDF}
                    disabled={isExporting || missingItems.length === 0}
                    variant="outline"
                    className="h-8 text-[11px] font-bold border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/5 rounded-xl gap-1"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    PDF
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
      {isHistoryOpen && (
        <ReceptionHistoryDialog
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
    </Popover>
  );
};
