import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileSpreadsheet, FileText, AlertCircle, Truck, Package, PackageCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { purchaseOrderService } from '@/services/purchaseOrderService';

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
  received_quantity?: number | null;
  purchase_orders: {
    sequence_number: number | null;
    delivery_date: string | null;
    created_at: string | null;
    status: string;
    currency: 'USD' | 'VES' | 'EUR';
    reception_status?: string | null;
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
  const [receptionQuantities, setReceptionQuantities] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

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
          received_quantity,
          purchase_orders (
            sequence_number,
            delivery_date,
            created_at,
            status,
            currency,
            reception_status,
            suppliers (
              name
            )
          )
        `)
        .in('order_id', orderIds);

      if (error) throw error;
      const fetchedItems = (data as unknown as TransitItem[]) || [];
      setItems(fetchedItems);
      
      const initialQuantities: Record<string, number> = {};
      fetchedItems.forEach(item => {
        initialQuantities[item.id] = 0;
      });
      setReceptionQuantities(initialQuantities);
    } catch (error: any) {
      console.error('[TransitReportDialog] Error fetching items:', error);
      showError('Error al cargar la vista previa de materiales.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransitItems();
  }, [isOpen, orderIds]);

  const handleSetInTransit = async () => {
    // Check if any order is not in an approved state
    const nonApproved = items.some(item => {
      const status = item.purchase_orders?.status;
      return !['Approved', 'Credit', 'Paid', 'ToPay', 'Received'].includes(status || '');
    });

    if (nonApproved) {
      showError('Solo las órdenes aprobadas pueden establecerse en tránsito.');
      return;
    }

    // Filter order IDs: only target those whose reception status is still 'Ninguno' or null
    const ordersToSet = new Set<string>();
    items.forEach(item => {
      const recStatus = item.purchase_orders?.reception_status;
      if (!recStatus || recStatus === 'Ninguno') {
        ordersToSet.add(item.order_id);
      }
    });

    if (ordersToSet.size === 0) {
      showSuccess('Las órdenes seleccionadas ya se encuentran en tránsito o recepción parcial.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await purchaseOrderService.updateReceptionStatus(Array.from(ordersToSet), 'En tránsito');
      if (success) {
        showSuccess('Órdenes marcadas en tránsito (se omitieron las que ya tienen recepción parcial/completa).');
        await fetchTransitItems();
      }
    } catch (err) {
      console.error(err);
      showError('Error al marcar en tránsito.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveReception = async () => {
    // 1. Check if any order is not in an approved state
    const nonApproved = items.some(item => {
      const status = item.purchase_orders?.status;
      return !['Approved', 'Credit', 'Paid', 'ToPay', 'Received'].includes(status || '');
    });

    if (nonApproved) {
      showError('Solo se pueden registrar recepciones para órdenes aprobadas.');
      return;
    }

    // Check if user is attempting to receive quantities for orders not in transit/partial
    const attemptingToReceiveNonTransit = items.some(item => {
      const newQty = receptionQuantities[item.id] ?? 0;
      const recStatus = item.purchase_orders?.reception_status;
      return newQty > 0 && recStatus !== 'En tránsito' && recStatus !== 'Parcial';
    });

    if (attemptingToReceiveNonTransit) {
      showError('No se pueden registrar cantidades para órdenes que no estén en tránsito. Por favor, establézcalas en tránsito primero.');
      return;
    }

    // 2. Check if any quantity exceeds the requested quantity
    const exceeds = Object.entries(receptionQuantities).some(([id, val]) => {
      const item = items.find(i => i.id === id);
      if (!item) return false;
      const totalProjected = Number(item.received_quantity || 0) + val;
      return totalProjected > item.quantity;
    });

    if (exceeds) {
      showError('No se puede recibir más de la cantidad solicitada (la suma con el acumulado excede el límite).');
      return;
    }

    setIsSaving(true);
    try {
      const payload = Object.entries(receptionQuantities).map(([id, val]) => {
        const item = items.find(i => i.id === id);
        const currentAccumulated = Number(item?.received_quantity || 0);
        return {
          id,
          received_quantity: currentAccumulated + val
        };
      });

      const successItems = await purchaseOrderService.updateReceivedQuantities(payload);
      if (!successItems) throw new Error("Error updating quantities");

      const updateOrderPromises = orderIds.map(orderId =>
        purchaseOrderService.updateOrderReceptionState(orderId)
      );
      await Promise.all(updateOrderPromises);

      showSuccess('Recepción registrada exitosamente.');
      onClose();
    } catch (err) {
      console.error(err);
      showError('Error al guardar la recepción.');
    } finally {
      setIsSaving(false);
    }
  };

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

  const canSetInTransit = items.some(item => {
    const recStatus = item.purchase_orders?.reception_status;
    return !recStatus || recStatus === 'Ninguno';
  });

  return (
    <Dialog open={isOpen} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col bg-white rounded-[2rem] border-none shadow-2xl p-6 ring-1 ring-black/5">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-xl font-extrabold text-procarni-dark flex items-center gap-2">
            <Package className="h-5 w-5 text-procarni-primary" />
            Consolidador de Materiales y Recepción
          </DialogTitle>
          <DialogDescription className="text-xs italic text-gray-500 font-medium">
            Gestiona la recepción y visualiza los materiales en tránsito de las {orderIds.length} órdenes seleccionadas.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
            <span className="text-sm font-medium text-slate-500">Cargando ítems...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <AlertCircle className="h-10 w-10 text-amber-500" />
            <span className="text-sm font-medium">No se encontraron ítems en las órdenes seleccionadas.</span>
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-[300px] border border-gray-100 rounded-2xl overflow-hidden mt-2 bg-slate-50/50">
              <ScrollArea className="h-[45vh] w-full">
                <Table>
                  <TableHeader className="bg-slate-100/80 sticky top-0 z-10">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Orden</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Proveedor</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Material</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Solicitado</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Recibido Acumulado</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center w-28">Nueva Recepción</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Progreso</TableHead>
                      <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">P. Unitario</TableHead>
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

                      const accumulatedQty = Number(item.received_quantity || 0);
                      const newQty = receptionQuantities[item.id] ?? 0;
                      const totalProjected = accumulatedQty + newQty;
                      const progressPercent = Math.min(100, Math.max(0, Math.round((totalProjected / item.quantity) * 100)));
                      const maxAllowed = Math.max(0, item.quantity - accumulatedQty);
                      const isEditable = item.purchase_orders?.reception_status === 'En tránsito' || item.purchase_orders?.reception_status === 'Parcial';

                      return (
                        <TableRow key={item.id} className="hover:bg-slate-100/30 transition-colors">
                          <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                          <TableCell className="text-xs text-gray-600 font-medium max-w-[120px] truncate" title={supplierName}>
                            {supplierName}
                          </TableCell>
                          <TableCell className="text-xs font-semibold text-slate-800">{item.material_name}</TableCell>
                          <TableCell className="text-xs text-center font-bold font-mono">
                            {item.quantity} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                          </TableCell>
                          
                          {/* Parked Register (Previously received quantity) */}
                          <TableCell className="text-xs text-center font-bold font-mono bg-slate-100/30 border-x border-gray-100">
                            {accumulatedQty} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                          </TableCell>

                          {/* Editable new quantity received */}
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              disabled={!isEditable}
                              placeholder={isEditable ? "0" : "Bloqueado"}
                              title={isEditable ? "Nueva cantidad recibida" : "Establezca la orden en tránsito primero"}
                              value={receptionQuantities[item.id] ?? 0}
                              onChange={(e) => {
                                const val = Math.min(maxAllowed, Math.max(0, Number(e.target.value)));
                                setReceptionQuantities(prev => ({
                                  ...prev,
                                  [item.id]: val
                                }));
                              }}
                              className="h-8 w-24 mx-auto text-center text-xs font-bold bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
                            />
                          </TableCell>

                          {/* Progress bar and numeric tracking (accumulated + new) */}
                          <TableCell className="text-xs text-center">
                            <div className="flex flex-col items-center gap-1 min-w-[110px]">
                              <span className="font-bold font-mono text-xs">
                                {totalProjected} / {item.quantity} <span className="text-[9px] text-gray-400 font-normal">({progressPercent}%)</span>
                              </span>
                              <div className="w-24 bg-gray-200/70 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all duration-300",
                                    progressPercent === 100 ? "bg-green-600" : "bg-procarni-primary"
                                  )}
                                  style={{ width: `${progressPercent}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-right font-mono font-semibold">
                            {formatCurrencyVal(item.unit_price, item.purchase_orders?.currency)}
                          </TableCell>
                          <TableCell className="text-xs text-right text-muted-foreground pr-4">
                            {deliveryDateStr}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <DialogFooter className="pt-4 border-t border-gray-100 flex flex-col md:flex-row gap-2 mt-4 items-end justify-between w-full">
              <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto items-end">
                <div className="flex flex-col sm:w-auto w-full">
                  <Button variant="ghost" onClick={onClose} className="h-10 px-4 rounded-xl text-slate-500 w-full sm:w-auto">
                    Cerrar
                  </Button>
                </div>
                
                <div className="flex flex-col gap-1.5 sm:w-auto w-full">
                  <span className="text-[9px] uppercase tracking-widest font-extrabold text-slate-400 select-none pl-1 text-center sm:text-left">Paso 1: En Tránsito</span>
                  <Button
                    variant="outline"
                    onClick={handleSetInTransit}
                    disabled={isSaving || items.length === 0 || !canSetInTransit}
                    className="h-10 border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/10 px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-all w-full sm:w-auto"
                  >
                    <Truck className="h-4 w-4 text-procarni-primary" />
                    Establecer En Tránsito
                  </Button>
                </div>

                <div className="flex flex-col gap-1.5 sm:w-auto w-full">
                  <span className="text-[9px] uppercase tracking-widest font-extrabold text-slate-400 select-none pl-1 text-center sm:text-left">Paso 2: Registrar Recepción</span>
                  <Button
                    onClick={handleSaveReception}
                    disabled={isSaving || items.length === 0}
                    className="h-10 bg-green-700 hover:bg-green-800 text-white px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg transition-all w-full sm:w-auto"
                  >
                    <PackageCheck className="h-4 w-4" />
                    Guardar Recepción
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto ml-auto">
                <Button
                  variant="outline"
                  onClick={handleExportXLSX}
                  disabled={items.length === 0}
                  className="h-10 border-procarni-secondary/30 text-procarni-secondary hover:bg-procarni-secondary/10 hover:text-procarni-secondary px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm transition-all"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Exportar Excel
                </Button>
                <Button
                  onClick={handleExportPDF}
                  disabled={items.length === 0}
                  className="h-10 bg-procarni-primary hover:bg-red-750 text-white px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg transition-all"
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
