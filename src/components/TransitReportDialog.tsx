import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileSpreadsheet, FileText, AlertCircle, Truck, Package, PackageCheck, Check, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { useSession } from '@/components/SessionContextProvider';
import { translateStatus } from '@/utils/statusTranslations';

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
  const { session } = useSession();
  const [items, setItems] = useState<TransitItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [receptionQuantities, setReceptionQuantities] = useState<Record<string, number | string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<{ first_name: string | null; last_name: string | null } | null>(null);

  useEffect(() => {
    const fetchCurrentProfile = async () => {
      if (session?.user?.id && isOpen) {
        const { data } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();
        if (data) {
          setCurrentProfile(data);
        }
      }
    };
    fetchCurrentProfile();
  }, [session, isOpen]);

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
      
      const initialQuantities: Record<string, number | string> = {};
      fetchedItems.forEach(item => {
        initialQuantities[item.id] = '';
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
    const nonApproved = items.some(item => {
      const status = item.purchase_orders?.status;
      return !['Approved', 'Credit', 'Paid', 'ToPay', 'Received'].includes(status || '');
    });

    if (nonApproved) {
      showError('Solo las órdenes aprobadas pueden establecerse en tránsito.');
      return;
    }

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
        showSuccess('Órdenes marcadas en tránsito.');
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
    const nonApproved = items.some(item => {
      const status = item.purchase_orders?.status;
      return !['Approved', 'Credit', 'Paid', 'ToPay', 'Received'].includes(status || '');
    });

    if (nonApproved) {
      showError('Solo se pueden registrar recepciones para órdenes aprobadas.');
      return;
    }

    const attemptingToReceiveNonTransit = items.some(item => {
      const newQty = Number(receptionQuantities[item.id] || 0);
      const recStatus = item.purchase_orders?.reception_status;
      return newQty > 0 && recStatus !== 'En tránsito' && recStatus !== 'Parcial';
    });

    if (attemptingToReceiveNonTransit) {
      showError('No se pueden registrar cantidades para órdenes que no estén en tránsito. Por favor, establézcalas en tránsito primero.');
      return;
    }

    const exceeds = Object.entries(receptionQuantities).some(([id, val]) => {
      const item = items.find(i => i.id === id);
      if (!item) return false;
      const totalProjected = Number(item.received_quantity || 0) + Number(val || 0);
      return totalProjected > item.quantity;
    });

    if (exceeds) {
      showError('No se puede recibir más de la cantidad solicitada.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = Object.entries(receptionQuantities)
        .filter(([_, val]) => Number(val || 0) > 0)
        .map(([id, val]) => {
          const item = items.find(i => i.id === id);
          const currentAccumulated = Number(item?.received_quantity || 0);
          return {
            id,
            received_quantity: currentAccumulated + Number(val || 0)
          };
        });

      if (payload.length === 0) {
        showError('Por favor ingrese al menos una cantidad a recibir.');
        setIsSaving(false);
        return;
      }

      const successItems = await purchaseOrderService.updateReceivedQuantities(payload);
      if (!successItems) throw new Error("Error updating quantities");

      // Register audit logs for each received material
      const auditPromises = payload.map(async p => {
        const item = items.find(i => i.id === p.id);
        const orderNum = formatSequenceNumber(item?.purchase_orders?.sequence_number, item?.purchase_orders?.created_at);
        const addedQty = p.received_quantity - Number(item?.received_quantity || 0);

        try {
          await logAudit('update_received_quantity', {
            table: 'purchase_order_items',
            record_id: p.id,
            description: `Recibió ${addedQty} unidades del material '${item?.material_name}' en la orden de compra ${orderNum}.`,
            new_data: { received_quantity: p.received_quantity },
            old_data: { received_quantity: item?.received_quantity || 0 },
            material_name: item?.material_name,
            order_number: orderNum,
            quantity_received: addedQty
          });
        } catch (e) {
          console.error('[TransitReportDialog] Audit logging error:', e);
        }
      });
      await Promise.all(auditPromises);

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
      const dataToExport: Array<Record<string, string | number>> = items.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const deliveryDateStr = item.purchase_orders?.delivery_date
          ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE')
          : 'No asignada';
        const curr = item.purchase_orders?.currency || 'USD';
        const qtyOrdered = item.quantity;
        const qtyReceived = Number(item.received_quantity || 0);
        const qtyPending = Math.max(0, qtyOrdered - qtyReceived);

        return {
          'Orden de Compra': orderNum,
          'Proveedor': supplierName,
          'Material': item.material_name,
          'Cantidad Pedida': qtyOrdered,
          'Cantidad Recibida': qtyReceived,
          'Cantidad Faltante (En Tránsito)': qtyPending,
          'Unidad': item.unit || 'UND',
          'Moneda': curr,
          'Precio Unitario': item.unit_price,
          'Total Pedido': qtyOrdered * item.unit_price,
          'Total en Tránsito / Pendiente': qtyPending * item.unit_price,
          'Fecha Entrega': deliveryDateStr,
          'Estado Orden': translateStatus(item.purchase_orders?.status),
        };
      });

      const totalsByCurrency: Record<string, number> = {};
      items.forEach(item => {
        const curr = item.purchase_orders?.currency || 'USD';
        const qtyOrdered = item.quantity;
        const qtyReceived = Number(item.received_quantity || 0);
        const qtyPending = Math.max(0, qtyOrdered - qtyReceived);
        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + (qtyPending * item.unit_price);
      });

      Object.entries(totalsByCurrency).forEach(([curr, totalAmount]) => {
        dataToExport.push({
          'Orden de Compra': `TOTAL EN TRÁNSITO CONSOLIDADO (${curr})`,
          'Proveedor': '',
          'Material': '',
          'Cantidad Pedida': 0,
          'Cantidad Recibida': 0,
          'Cantidad Faltante (En Tránsito)': 0,
          'Unidad': '',
          'Moneda': curr,
          'Precio Unitario': 0,
          'Total Pedido': 0,
          'Total en Tránsito / Pendiente': totalAmount,
          'Fecha Entrega': '',
          'Estado Orden': '',
        });
      });

      const allFullyReceived = items.length > 0 && items.every(item => {
        const accumulatedQty = Number(item.received_quantity || 0);
        return accumulatedQty >= item.quantity;
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, allFullyReceived ? 'Recibidos' : 'En Tránsito');

      const maxColWidth = dataToExport.reduce((acc, row) => {
        Object.keys(row).forEach((key, colIndex) => {
          const val = String(row[key as keyof typeof row] || '');
          acc[colIndex] = Math.max(acc[colIndex] || 10, val.length + 2);
        });
        return acc;
      }, [] as number[]);
      worksheet['!cols'] = maxColWidth.map((w) => ({ wch: w }));

      XLSX.writeFile(workbook, `Reporte_Materiales_${allFullyReceived ? 'Recibidos' : 'Transito'}_${new Date().toISOString().split('T')[0]}.xlsx`);
      showSuccess('Reporte Excel generado correctamente.');
    } catch (error) {
      console.error('[TransitReportDialog] Error generating XLSX:', error);
      showError('Error al exportar a Excel.');
    }
  };

  const handleExportPDF = () => {
    if (items.length === 0) return;

    try {
      const allFullyReceived = items.length > 0 && items.every(item => {
        const accumulatedQty = Number(item.received_quantity || 0);
        return accumulatedQty >= item.quantity;
      });

      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74);
      doc.text('PROCARNI', 14, 20);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10);
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text(
        allFullyReceived 
          ? 'Reporte Consolidador de Materiales Recibidos' 
          : 'Reporte Consolidador de Materiales en Tránsito', 
        200, 18, { align: 'right' }
      );

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 23, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.rect(14, 30, 182, 10, 'D');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Órdenes Consolidadas: ${orderIds.length}`, 18, 36);
      doc.text(`Total de Ítems: ${items.length}`, 120, 36);

      const tableData = items.map((item) => {
        const orderNum = formatSequenceNumber(
          item.purchase_orders?.sequence_number,
          item.purchase_orders?.created_at
        );
        const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
        const accumulatedQty = Number(item.received_quantity || 0);
        const isCompleted = accumulatedQty >= item.quantity;
        const pendingQty = Math.max(0, item.quantity - accumulatedQty);
        const unitLabel = item.unit || 'UND';
        const curr = item.purchase_orders?.currency || 'USD';

        return [
          orderNum,
          supplierName,
          item.material_name,
          `${item.quantity} ${unitLabel}`,
          `${accumulatedQty} ${unitLabel}`,
          `${pendingQty} ${unitLabel}`,
          isCompleted ? 'Recibido' : (accumulatedQty > 0 ? 'Parcial' : 'Pendiente'),
          formatCurrencyVal(item.unit_price, curr),
          formatCurrencyVal(pendingQty * item.unit_price, curr),
        ];
      });

      autoTable(doc, {
        startY: 46,
        head: [['O.C.', 'Proveedor', 'Material / Ítem', 'Pedida', 'Recibida', 'Faltante', 'Estado', 'P. Unitario', 'T. Tránsito']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8,
          lineWidth: { bottom: 1.5 },
          lineColor: [203, 213, 225],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 7.5,
          lineWidth: { bottom: 0.5 },
          lineColor: [226, 232, 240],
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255],
        },
        styles: {
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 25 },
          2: { cellWidth: 35 },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
          6: { cellWidth: 16, halign: 'center' },
          7: { cellWidth: 21, halign: 'right' },
          8: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
        },
      });

      // @ts-ignore
      const finalY = doc.lastAutoTable?.finalY || 100;

      const totalsByCurrency: Record<string, number> = {};
      items.forEach(item => {
        const curr = item.purchase_orders?.currency || 'USD';
        const pendingQty = Math.max(0, item.quantity - Number(item.received_quantity || 0));
        totalsByCurrency[curr] = (totalsByCurrency[curr] || 0) + (pendingQty * item.unit_price);
      });

      const uniqueCurrencies = Object.keys(totalsByCurrency);
      const totalsBoxHeight = 4 + uniqueCurrencies.length * 8;

      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(14, finalY + 10, 182, totalsBoxHeight, 'FD');

      let currentTotalY = finalY + 16;
      uniqueCurrencies.forEach(curr => {
        const totalVal = totalsByCurrency[curr];
        const value = formatCurrencyVal(totalVal, curr);

        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`Total en Tránsito Consolidado (${curr}):`, 18, currentTotalY);
        doc.text(value, 192, currentTotalY, { align: 'right' });

        currentTotalY += 8;
      });

      let printedByName = '';
      if (currentProfile?.first_name || currentProfile?.last_name) {
        printedByName = `${currentProfile.first_name || ''} ${currentProfile.last_name || ''}`.trim();
      } else {
        printedByName = session?.user?.email || 'Usuario';
      }

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Reporte generado por: ${printedByName} desde el panel administrativo de Procarni System.`, 105, finalY + totalsBoxHeight + 20, { align: 'center' });

      doc.save(`Reporte_Materiales_${allFullyReceived ? 'Recibidos' : 'Transito'}_${new Date().toISOString().split('T')[0]}.pdf`);
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
      <DialogContent className="max-w-5xl max-h-[92vh] md:max-h-[85vh] flex flex-col bg-white rounded-[2rem] border-none shadow-2xl p-4 md:p-6 ring-1 ring-black/5 overflow-y-auto md:overflow-visible">
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
            <div className="flex-1 min-h-[150px] md:min-h-[300px] border border-gray-100 rounded-2xl overflow-hidden mt-2 bg-slate-50/50">
              <ScrollArea className="h-[55vh] md:h-[45vh] w-full">
                {(() => {
                  const pendingItems = items.filter(item => Number(item.received_quantity || 0) < item.quantity);
                  const completedItems = items.filter(item => Number(item.received_quantity || 0) >= item.quantity);

                  return (
                    <>
                      {/* ========================================================================= */}
                      {/* 1. PENDING ITEMS SECTION (Desktop & Mobile)                               */}
                      {/* ========================================================================= */}
                      
                      {/* Subtitle / Header for Pending Items */}
                      {pendingItems.length > 0 && (
                        <div className="px-4 py-2 bg-amber-50/80 border-b border-amber-100/50 text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                          <Truck className="h-3.5 w-3.5" />
                          <span>Materiales Pendientes de Recepción ({pendingItems.length})</span>
                        </div>
                      )}

                      {/* Desktop Table View - Pending */}
                      <div className="hidden md:block">
                        {pendingItems.length > 0 ? (
                          <Table>
                            <TableHeader className="bg-slate-100/80">
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
                              {pendingItems.map((item) => {
                                const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
                                const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                                const deliveryDateStr = item.purchase_orders?.delivery_date ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE') : 'No asignada';
                                const accumulatedQty = Number(item.received_quantity || 0);
                                const newQty = Number(receptionQuantities[item.id] || 0);
                                const totalProjected = accumulatedQty + newQty;
                                const progressPercent = Math.min(100, Math.max(0, Math.round((totalProjected / item.quantity) * 100)));
                                const maxAllowed = Math.max(0, item.quantity - accumulatedQty);
                                const isEditable = item.purchase_orders?.reception_status === 'En tránsito' || item.purchase_orders?.reception_status === 'Parcial';

                                return (
                                  <TableRow key={item.id} className="hover:bg-slate-100/30 transition-colors">
                                    <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                                    <TableCell className="text-xs text-gray-600 font-medium max-w-[120px] truncate" title={supplierName}>{supplierName}</TableCell>
                                    <TableCell className="text-xs font-semibold text-slate-800">{item.material_name}</TableCell>
                                    <TableCell className="text-xs text-center font-bold font-mono">
                                      {item.quantity} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                                    </TableCell>
                                    <TableCell className="text-xs text-center font-bold font-mono bg-slate-100/30 border-x border-gray-100">
                                      {accumulatedQty} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                                    </TableCell>
                                    <TableCell className="text-center">
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        disabled={!isEditable}
                                        placeholder={isEditable ? "0" : "Bloqueado"}
                                        value={receptionQuantities[item.id] ?? ''}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) => {
                                          const rawVal = e.target.value;
                                          if (rawVal === '') {
                                            setReceptionQuantities(prev => ({ ...prev, [item.id]: '' }));
                                            return;
                                          }
                                          if (/^[0-9]*\.?[0-9]*$/.test(rawVal)) {
                                            const parsed = Number(rawVal);
                                            if (parsed > maxAllowed) {
                                              setReceptionQuantities(prev => ({ ...prev, [item.id]: maxAllowed }));
                                            } else {
                                              setReceptionQuantities(prev => ({ ...prev, [item.id]: rawVal }));
                                            }
                                          }
                                        }}
                                        className="h-8 w-24 mx-auto text-center text-xs font-bold bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
                                      />
                                    </TableCell>
                                    <TableCell className="text-xs text-center">
                                      <div className="flex flex-col items-center gap-1 min-w-[110px]">
                                        <span className="font-bold font-mono text-xs">
                                          {totalProjected} / {item.quantity} <span className="text-[9px] text-gray-400 font-normal">({progressPercent}%)</span>
                                        </span>
                                        <div className="w-24 bg-gray-200/70 rounded-full h-1.5 overflow-hidden">
                                          <div className={cn("h-full rounded-full transition-all duration-300", progressPercent === 100 ? "bg-green-600" : "bg-procarni-primary")} style={{ width: `${progressPercent}%` }} />
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-mono font-semibold">
                                      {formatCurrencyVal(item.unit_price, item.purchase_orders?.currency)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right text-muted-foreground pr-4">{deliveryDateStr}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="p-6 text-center text-xs text-slate-400 font-medium">No hay materiales pendientes en este lote.</div>
                        )}
                      </div>

                      {/* Mobile Cards View - Pending */}
                      <div className="block md:hidden p-3 space-y-3">
                        {pendingItems.map((item) => {
                          const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
                          const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                          const accumulatedQty = Number(item.received_quantity || 0);
                          const newQty = Number(receptionQuantities[item.id] || 0);
                          const totalProjected = accumulatedQty + newQty;
                          const progressPercent = Math.min(100, Math.max(0, Math.round((totalProjected / item.quantity) * 100)));
                          const maxAllowed = Math.max(0, item.quantity - accumulatedQty);
                          const isEditable = item.purchase_orders?.reception_status === 'En tránsito' || item.purchase_orders?.reception_status === 'Parcial';

                          return (
                            <div key={item.id} className="bg-white p-4 border border-gray-150 rounded-2xl shadow-sm space-y-3">
                              <div className="flex justify-between items-start border-b border-gray-100 pb-2">
                                <div>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Orden</span>
                                  <span className="text-xs font-mono font-bold text-procarni-dark">{orderNum}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Proveedor</span>
                                  <span className="text-xs text-gray-600 font-semibold block truncate max-w-[140px]">{supplierName}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Material</span>
                                <span className="text-xs font-semibold text-slate-800">{item.material_name}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100/50">
                                <div className="text-center">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Pedida</span>
                                  <span className="text-xs font-bold font-mono text-slate-700">{item.quantity}</span>
                                </div>
                                <div className="text-center border-x border-gray-200">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">Recibido</span>
                                  <span className="text-xs font-bold font-mono text-slate-700">{accumulatedQty}</span>
                                </div>
                                <div className="text-center">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">P. Unitario</span>
                                  <span className="text-xs font-bold font-mono text-slate-700">{item.purchase_orders?.currency} {item.unit_price.toFixed(2)}</span>
                                </div>
                              </div>
                              <div className="flex flex-col gap-3 pt-1">
                                <div className="flex flex-col gap-1 w-full">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Nueva Recepción</span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    disabled={!isEditable}
                                    placeholder={isEditable ? "0" : "Bloqueado"}
                                    value={receptionQuantities[item.id] ?? ''}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    onChange={(e) => {
                                      const rawVal = e.target.value;
                                      if (rawVal === '') {
                                        setReceptionQuantities(prev => ({ ...prev, [item.id]: '' }));
                                        return;
                                      }
                                      if (/^[0-9]*\.?[0-9]*$/.test(rawVal)) {
                                        const parsed = Number(rawVal);
                                        if (parsed > maxAllowed) {
                                          setReceptionQuantities(prev => ({ ...prev, [item.id]: maxAllowed }));
                                        } else {
                                          setReceptionQuantities(prev => ({ ...prev, [item.id]: rawVal }));
                                        }
                                      }
                                    }}
                                    className="h-9 w-full text-center text-xs font-bold bg-slate-50 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
                                  />
                                </div>
                                <div className="flex justify-between items-center text-xs mt-1">
                                  <span className="text-gray-500 font-medium">Proyectado:</span>
                                  <span className="font-bold font-mono">
                                    {totalProjected} / {item.quantity} <span className="text-[10px] text-gray-400 font-normal">({progressPercent}%)</span>
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200/70 rounded-full h-1.5 overflow-hidden">
                                  <div className={cn("h-full rounded-full transition-all duration-300", progressPercent === 100 ? "bg-green-600" : "bg-procarni-primary")} style={{ width: `${progressPercent}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ========================================================================= */}
                      {/* 2. COMPLETED ITEMS SECTION (Desktop & Mobile)                             */}
                      {/* ========================================================================= */}

                      {/* Subtitle / Header for Completed Items */}
                      {completedItems.length > 0 && (
                        <div className="px-4 py-2 bg-green-50 border-y border-green-100 text-[11px] font-black uppercase tracking-wider text-green-800 flex items-center gap-1.5 mt-6">
                          <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          <span>Materiales Completamente Recibidos ({completedItems.length})</span>
                        </div>
                      )}

                      {/* Desktop Table View - Completed */}
                      <div className="hidden md:block">
                        {completedItems.length > 0 ? (
                          <Table>
                            <TableHeader className="bg-emerald-50/60">
                              <TableRow>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Orden</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Proveedor</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Material</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Solicitado</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Recibido Total</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center w-28">Estado</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">P. Unitario</TableHead>
                                <TableHead className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right pr-4">Fecha Ent.</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {completedItems.map((item) => {
                                const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
                                const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                                const deliveryDateStr = item.purchase_orders?.delivery_date ? new Date(item.purchase_orders.delivery_date).toLocaleDateString('es-VE') : 'No asignada';
                                const accumulatedQty = Number(item.received_quantity || 0);

                                return (
                                  <TableRow key={item.id} className="bg-green-50/20 hover:bg-green-50/30 transition-colors">
                                    <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                                    <TableCell className="text-xs text-gray-600 font-medium max-w-[120px] truncate" title={supplierName}>{supplierName}</TableCell>
                                    <TableCell className="text-xs font-semibold text-slate-800">{item.material_name}</TableCell>
                                    <TableCell className="text-xs text-center font-bold font-mono">{item.quantity} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span></TableCell>
                                    <TableCell className="text-xs text-center font-bold font-mono bg-emerald-100/10 border-x border-gray-100">{accumulatedQty} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span></TableCell>
                                    <TableCell className="text-center">
                                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                                        <Check className="h-3 w-3 shrink-0" /> Recibido
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-xs text-right font-mono font-semibold">
                                      {formatCurrencyVal(item.unit_price, item.purchase_orders?.currency)}
                                    </TableCell>
                                    <TableCell className="text-xs text-right text-muted-foreground pr-4">{deliveryDateStr}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : null}
                      </div>

                      {/* Mobile Cards View - Completed */}
                      <div className="block md:hidden p-3 space-y-3 pb-24">
                        {completedItems.map((item) => {
                          const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
                          const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                          const accumulatedQty = Number(item.received_quantity || 0);

                          return (
                            <div key={item.id} className="bg-green-50/10 p-4 border border-green-150 rounded-2xl shadow-sm space-y-3 opacity-90">
                              <div className="flex justify-between items-start border-b border-green-100/30 pb-2">
                                <div>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Orden</span>
                                  <span className="text-xs font-mono font-bold text-procarni-dark">{orderNum}</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Proveedor</span>
                                  <span className="text-xs text-gray-600 font-semibold block truncate max-w-[140px]">{supplierName}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center">
                                <div>
                                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Material</span>
                                  <span className="text-xs font-semibold text-slate-800">{item.material_name}</span>
                                </div>
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                                  <Check className="h-3 w-3 shrink-0" /> Recibido
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 bg-green-100/10 p-2 rounded-xl border border-green-100/20">
                                <div className="text-center">
                                  <span className="text-[9px] font-bold text-green-700 uppercase tracking-wider block">Pedida</span>
                                  <span className="text-xs font-bold font-mono text-green-800">{item.quantity}</span>
                                </div>
                                <div className="text-center border-l border-green-100/20">
                                  <span className="text-[9px] font-bold text-green-700 uppercase tracking-wider block">Recibido Total</span>
                                  <span className="text-xs font-bold font-mono text-green-800">{accumulatedQty}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {/* Spacer to guarantee scroll clearance over fixed footer */}
                        <div className="h-16 w-full" />
                      </div>
                    </>
                  );
                })()}
              </ScrollArea>
            </div>

            <DialogFooter className="pt-2 border-t border-gray-100 mt-2 w-full">
              {/* Mobile Compact Footer Row */}
              <div className="grid grid-cols-3 gap-2 w-full md:hidden">
                <Button 
                  variant="ghost" 
                  onClick={onClose} 
                  className="h-9 px-2 rounded-xl text-slate-500 text-xs font-bold w-full"
                >
                  Cerrar
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSetInTransit}
                  disabled={isSaving || items.length === 0 || !canSetInTransit}
                  className="h-9 border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/10 px-1 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all w-full truncate"
                  title="Establecer en Tránsito"
                >
                  <Truck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Tránsito</span>
                </Button>
                <Button
                  onClick={handleSaveReception}
                  disabled={isSaving || items.length === 0}
                  className="h-9 bg-green-700 hover:bg-green-800 text-white px-1 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all w-full truncate"
                  title="Guardar Recepción"
                >
                  <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Recibir</span>
                </Button>
              </div>

              {/* Desktop Standard Footer Layout */}
              <div className="hidden md:flex md:flex-row gap-2 items-end justify-between w-full">
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
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default TransitReportDialog;
