import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileSpreadsheet, FileText, AlertCircle, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TransitItem {
  id: string;
  order_id: string;
  material_name: string;
  quantity: number;
  unit_price: number;
  unit: string | null;
  unit_id: string | null;
  supplier_code: string | null;
  description: string | null;
  purchase_orders: {
    sequence_number: number | null;
    delivery_date: string | null;
    created_at: string | null;
    status: string;
    currency: 'USD' | 'VES' | 'EUR';
    suppliers: {
      name: string;
    } | null;
  } | null;
}

interface TransitReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orderIds: string[];
}

const formatSequenceNumber = (sequence?: number | null, dateString?: string | null): string => {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OC-${year}-${month}-${seq}`;
};

const formatCurrencyVal = (amount: number, currency?: string) => {
  const symbol = currency === 'VES' ? 'Bs. ' : currency === 'EUR' ? '€ ' : '$ ';
  return `${symbol}${amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const TransitReportDialog: React.FC<TransitReportDialogProps> = ({
  isOpen,
  onClose,
  orderIds,
}) => {
  const [items, setItems] = useState<TransitItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchTransitItems = async () => {
      if (orderIds.length === 0 || !isOpen) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('purchase_order_items')
          .select(`
            id,
            order_id,
            material_name,
            quantity,
            unit_price,
            unit,
            unit_id,
            supplier_code,
            description,
            purchase_orders (
              sequence_number,
              delivery_date,
              created_at,
              status,
              currency,
              suppliers (
                name
              )
            )
          `)
          .in('order_id', orderIds);

        if (error) throw error;
        setItems((data as unknown as TransitItem[]) || []);
      } catch (error: any) {
        console.error('[TransitReportDialog] Error fetching items:', error);
        showError('Error al cargar la vista previa de materiales.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTransitItems();
  }, [isOpen, orderIds]);

  const handleExportXLSX = () => {
    if (items.length === 0) return;

    try {
      const dataToExport = items.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const deliveryDateStr = item.purchase_orders?.delivery_date
          ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE')
          : 'No asignada';
        const curr = item.purchase_orders?.currency || 'USD';

        return {
          'Orden de Compra': orderNum,
          'Proveedor': supplierName,
          'Material': item.material_name,
          'Cantidad': item.quantity,
          'Unidad': item.unit || 'UND',
          'Moneda': curr,
          'Precio Unitario': item.unit_price,
          'Total': item.quantity * item.unit_price,
          'Fecha Entrega': deliveryDateStr,
          'Estado Orden': item.purchase_orders?.status || 'N/A',
        };
      });

      // Calculate totals per currency
      const totalsByCurrency: Record<string, number> = {};
      items.forEach(item => {
        const curr = item.purchase_orders?.currency || 'USD';
        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + (item.quantity * item.unit_price);
      });

      // Add elegant Totals Row to XLSX per currency
      Object.entries(totalsByCurrency).forEach(([curr, totalAmount]) => {
        dataToExport.push({
          'Orden de Compra': `TOTAL CONSOLIDADO (${curr})`,
          'Proveedor': '',
          'Material': '',
          'Cantidad': '',
          'Unidad': '',
          'Moneda': curr,
          'Precio Unitario': '',
          'Total': totalAmount,
          'Fecha Entrega': '',
          'Estado Orden': '',
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'En Tránsito');

      // Autofit columns
      const maxColWidth = dataToExport.reduce((acc, row) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String(row[key as keyof typeof row] || '');
          acc[colIndex] = Math.max(acc[colIndex] || 10, val.length + 2);
        });
        return acc;
      }, [] as number[]);
      worksheet['!cols'] = maxColWidth.map((w) => ({ wch: w }));

      XLSX.writeFile(workbook, `Reporte_Materiales_Transito_${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('Reporte Excel generado correctamente.');
    } catch (error) {
      console.error('[TransitReportDialog] Error generating XLSX:', error);
      showError('Error al exportar a Excel.');
    }
  };

  const handleExportPDF = () => {
    if (items.length === 0) return;

    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // --- LOGO SECTION (Left side of header) ---
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74); // #1B294A (Azul Corporativo)
      doc.text('PROCARNI', 14, 20);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // #880a0a (Rojo Italia)
      doc.text('SYSTEM', 14, 24);

      // --- TITLE SECTION (Right side of header) ---
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // #0f172a (Procarni Dark)
      doc.text('Reporte Consolidador de Materiales en Tránsito', 200, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139); // #64748b (Slate 400)
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 23, { align: 'right' });

      // --- INFO BOX (Filters box) ---
      // Draw light gray info box with thin border only (no fill)
      doc.setDrawColor(226, 232, 240); // #e2e8f0
      doc.rect(14, 30, 182, 10, 'D'); // X, Y, Width, Height, Style 'D' (draw only)

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105); // #475569
      doc.text(`Órdenes Consolidadas: ${orderIds.length}`, 18, 36);
      doc.text(`Total de Ítems: ${items.length}`, 120, 36);

      const tableData = items.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const deliveryDateStr = item.purchase_orders?.delivery_date
          ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE')
          : 'No asignada';
        const unitLabel = item.unit || 'UND';
        const curr = item.purchase_orders?.currency || 'USD';

        return [
          orderNum,
          supplierName,
          item.material_name,
          `${item.quantity} ${unitLabel}`,
          formatCurrencyVal(item.unit_price, curr),
          formatCurrencyVal(item.quantity * item.unit_price, curr),
          deliveryDateStr,
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [['O.C.', 'Proveedor', 'Material / Ítem', 'Cantidad', 'P. Unitario', 'Total', 'Fecha Ent.']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [255, 255, 255], // White background
          textColor: [71, 85, 105], // #475569
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1.5 },
          lineColor: [203, 213, 225], // #cbd5e1
        },
        bodyStyles: {
          textColor: [15, 23, 42], // #0f172a
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [226, 232, 240], // #e2e8f0
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255], // White background (no striping)
        },
        styles: {
          cellPadding: 2.5,
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 35 },
          2: { cellWidth: 50 },
          3: { cellWidth: 20, halign: 'center' },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 18, halign: 'right' },
        },
      });

      // Get the bottom of the table
      // @ts-ignore
      const finalY = doc.lastAutoTable?.finalY || 100;

      // Draw Totals section grouped by currency
      const totalsByCurrency: Record<string, number> = {};
      items.forEach(item => {
        const curr = item.purchase_orders?.currency || 'USD';
        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + (item.quantity * item.unit_price);
      });

      const uniqueCurrencies = Object.keys(totalsByCurrency);
      const totalsBoxHeight = 4 + uniqueCurrencies.length * 8;

      // Totals Box (no fill)
      doc.setDrawColor(226, 232, 240); // #e2e8f0
      doc.rect(120, finalY + 10, 76, totalsBoxHeight, 'D');

      let currentTotalY = finalY + 16;
      uniqueCurrencies.forEach(curr => {
        const totalAmount = totalsByCurrency[curr];
        const label = `Total en ${curr}:`;
        const value = formatCurrencyVal(totalAmount, curr);

        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139); // #64748b
        doc.text(label, 124, currentTotalY);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(136, 10, 10); // #880a0a
        doc.text(value, 192, currentTotalY, { align: 'right' });

        currentTotalY += 8;
      });

      // Footer notes
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // #94a3b8
      doc.text('Reporte generado electrónicamente desde el panel administrativo de Procarni System.', 105, finalY + totalsBoxHeight + 20, { align: 'center' });

      // Save PDF directly to local disk
      doc.save(`Reporte_Materiales_Transito_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error) {
      console.error('[TransitReportDialog] Error generating PDF:', error);
      showError('Error al exportar a PDF.');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col bg-white rounded-3xl border-none shadow-2xl p-6 ring-1 ring-black/5">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-extrabold text-procarni-dark flex items-center gap-2">
            <Truck className="h-5 w-5 text-procarni-primary" />
            Reporte Consolidador de Materiales en Tránsito
          </DialogTitle>
          <DialogDescription className="text-xs italic text-gray-500 font-medium">
            Resumen consolidado de materiales solicitados en las {orderIds.length} órdenes seleccionadas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
            <span className="text-sm font-medium text-slate-500">Cargando ítems en tránsito...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <span className="text-sm font-medium">No se encontraron ítems en las órdenes seleccionadas.</span>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-[250px] border border-gray-100 rounded-2xl overflow-hidden mt-2 bg-slate-50/50">
              <ScrollArea className="h-[40vh] w-full">
                <Table>
                  <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Orden</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Material</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Cantidad</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Precio</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Total</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right pr-4">Fecha Ent.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const orderNum = formatSequenceNumber(
                        item.purchase_orders?.sequence_number,
                        item.purchase_orders?.created_at
                      );
                      const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                      const deliveryDateStr = item.purchase_orders?.delivery_date
                        ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE')
                        : 'No asignada';

                      return (
                        <TableRow key={item.id} className="hover:bg-slate-100/30 transition-colors">
                          <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                          <TableCell className="text-xs text-gray-600 font-medium max-w-[150px] truncate" title={supplierName}>
                            {supplierName}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">{item.material_name}</TableCell>
                          <TableCell className="text-xs text-center font-bold font-mono">
                            {item.quantity} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrencyVal(item.unit_price, item.purchase_orders?.currency)}</TableCell>
                          <TableCell className="text-xs text-right font-mono font-bold text-procarni-dark">{formatCurrencyVal(item.quantity * item.unit_price, item.purchase_orders?.currency)}</TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground pr-4">{deliveryDateStr}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <DialogFooter className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-2 mt-4">
              <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto h-10 px-4 rounded-xl text-slate-500">
                Cerrar
              </Button>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto ml-auto">
                <Button
                  variant="outline"
                  onClick={handleExportXLSX}
                  disabled={items.length === 0}
                  className="w-full sm:w-auto h-10 border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/10 hover:text-procarni-secondary px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-all"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={items.length === 0}
                  className="w-full sm:w-auto h-10 bg-procarni-primary hover:bg-red-750 text-white px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg transition-all"
                >
                  <FileText className="h-4 w-4" />
                  Exportar PDF
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransitReportDialog;
