import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Loader2, FileSpreadsheet, FileText, AlertCircle, Truck, Package, PackageCheck, 
  Check, CheckCircle, ChevronDown, ChevronUp, Upload, Paperclip, AlertTriangle, PlusCircle, CheckCircle2 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showError, showSuccess } from '@/utils/toast';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { logAudit } from '@/integrations/supabase/services/auditLogService';
import { registrarRecepcion, enableMaterialForInventory } from '@/integrations/supabase/services/inventoryService';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { OrderDocumentService } from '@/integrations/supabase/services/orderDocumentService';

interface TransitItem {
  id: string;
  order_id: string;
  material_id?: string | null;
  material_name: string;
  quantity: number;
  unit_price: number;
  unit: string | null;
  unit_id: string | null;
  supplier_code: string | null;
  description: string | null;
  received_quantity?: number | null;
  materials?: {
    id: string;
    code: string | null;
    name: string;
    category: string | null;
    unit: string | null;
    materials_inventory?: {
      material_id: string;
      sku: string;
      inventory_category: string;
      current_stock: number;
      average_unit_cost: number;
    } | null;
  } | null;
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

// --- HELPERS PARA REGLAS POR CATEGORÍA ---
// Regla 1: Ajustes avanzados (Guía vs Real, Merma) solo para SECA (MPS) y FRESCA (MPF)
const isSecaOrFrescaCategory = (category?: string | null, invCategory?: string | null): boolean => {
  const cat = (invCategory || category || '').toUpperCase().trim();
  return ['MPF', 'MPS', 'SECA', 'FRESCA', 'MATERIA PRIMA FRESCA', 'MATERIA PRIMA SECA'].includes(cat);
};

// Regla 2: Botón de "Habilitar en Inventario" disponible solo para SECA (MPS), FRESCA (MPF) y EMPAQUE (EMP)
const isHabilitableCategory = (category?: string | null, invCategory?: string | null): boolean => {
  const cat = (invCategory || category || '').toUpperCase().trim();
  if (isSecaOrFrescaCategory(category, invCategory)) return true;
  return ['EMP', 'EMPAQUE', 'EMPAQUES'].includes(cat);
};

interface DocEntry {
  id: string;
  docType: 'Factura' | 'Nota de Entrega' | 'Otro';
  docNumber: string;
  selectedOrderIds: string[];
  evidenceFile: File | null;
  notes: string;
}

export const TransitReportDialog: React.FC<TransitReportDialogProps> = ({
  isOpen,
  onClose,
  orderIds,
}) => {
  // Wizard Step State (1: Materiales & Mermas, 2: Consolidado de Documentos & OCs)
  const [step, setStep] = useState<1 | 2>(1);

  const [items, setItems] = useState<TransitItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [receptionQuantities, setReceptionQuantities] = useState<Record<string, number | string>>({});
  const [guiaQuantities, setGuiaQuantities] = useState<Record<string, number | string>>({});
  const [acceptedMermas, setAcceptedMermas] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Paso 2: Entradas dinámicas de Guías / Facturas consolidadas por grupos de OCs
  const queryClient = useQueryClient();
  const [docEntries, setDocEntries] = useState<DocEntry[]>([]);

  // Estado para el modal rápido de Habilitar Material
  const [enablingMaterial, setEnablingMaterial] = useState<{ id: string; name: string; unit: string; price: number } | null>(null);
  const [enableCategory, setEnableCategory] = useState<'MPF' | 'MPS' | 'EMP'>('MPS');
  const [enableInventoryType, setEnableInventoryType] = useState<'Producción' | 'Suministro'>('Producción');
  const [enableUnit, setEnableUnit] = useState('KG');
  const [enableMinStock, setEnableMinStock] = useState('0');
  const [enableCost, setEnableCost] = useState('0');
  const [isEnabling, setIsEnabling] = useState(false);

  // Inicializar Paso 2 con una entrada de documento por defecto amparando a todas las OCs
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setAcceptedMermas({});
      setDocEntries([
        {
          id: 'doc-1',
          docType: 'Nota de Entrega',
          docNumber: '',
          selectedOrderIds: [...orderIds],
          evidenceFile: null,
          notes: '',
        }
      ]);
    }
  }, [isOpen, orderIds]);


  const fetchTransitItems = async () => {
    if (orderIds.length === 0 || !isOpen) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          order_id,
          material_id,
          material_name,
          quantity,
          unit_price,
          unit,
          unit_id,
          supplier_code,
          description,
          received_quantity,
          materials (
            id,
            code,
            name,
            category,
            unit,
            materials_inventory (
              material_id,
              sku,
              inventory_category,
              current_stock,
              average_unit_cost
            )
          ),
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
      const initialGuia: Record<string, number | string> = {};

      fetchedItems.forEach(item => {
        initialQuantities[item.id] = '';
        const pending = Math.max(0, item.quantity - Number(item.received_quantity || 0));
        initialGuia[item.id] = pending > 0 ? pending : '';
      });

      setReceptionQuantities(initialQuantities);
      setGuiaQuantities(initialGuia);
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

  const handleEnableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enablingMaterial) return;

    setIsEnabling(true);
    try {
      await enableMaterialForInventory({
        material_id: enablingMaterial.id,
        inventory_category: enableCategory,
        inventory_type: enableInventoryType,
        unit: enableUnit || enablingMaterial.unit || 'KG',
        min_stock_alert: parseFloat(enableMinStock) || 0,
        last_purchase_price: parseFloat(enableCost) || enablingMaterial.price || 0,
      });

      // Vincular material_id en purchase_order_items para los ítems que tenían material_id nulo
      const itemsToUpdate = items.filter(i => 
        !i.material_id && i.material_name.trim().toLowerCase() === enablingMaterial.name.trim().toLowerCase()
      );
      if (itemsToUpdate.length > 0) {
        await supabase
          .from('purchase_order_items')
          .update({ material_id: enablingMaterial.id })
          .in('id', itemsToUpdate.map(i => i.id));
      }

      showSuccess(`Material "${enablingMaterial.name}" habilitado exitosamente en inventario.`);
      setEnablingMaterial(null);
      await fetchTransitItems();
    } catch (err: any) {
      console.error(err);
      showError(err.message || 'Error al habilitar material en inventario.');
    } finally {
      setIsEnabling(false);
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
      const isStep1DirectSave = (step === 1);

      const payload = items
        .map(item => {
          const rawVal = receptionQuantities[item.id];
          const pendingQty = Math.max(0, item.quantity - Number(item.received_quantity || 0));
          
          let effectiveNewQty = 0;
          if (rawVal !== '' && rawVal !== undefined) {
            effectiveNewQty = Number(rawVal || 0);
          } else if (isStep1DirectSave) {
            effectiveNewQty = pendingQty;
          } else {
            effectiveNewQty = 0;
          }

          const currentAccumulated = Number(item.received_quantity || 0);
          const isMermaAccepted = acceptedMermas[item.id];

          if (effectiveNewQty <= 0 && !isMermaAccepted) {
            return null;
          }

          // Si la merma fue aceptada para finalizar, la cantidad recibida satisface el total pedido
          const finalReceived = isMermaAccepted 
            ? item.quantity 
            : (currentAccumulated + effectiveNewQty);

          return {
            id: item.id,
            effectiveNewQty,
            received_quantity: finalReceived
          };
        })
        .filter((p): p is { id: string; effectiveNewQty: number; received_quantity: number } => p !== null);

      const hasDocEntries = docEntries.some(d => d.docNumber.trim() !== '' || d.evidenceFile !== null);

      if (payload.length === 0 && !hasDocEntries) {
        showError('Por favor ingrese al menos una cantidad a recibir, acepte una merma o adjunte un documento de consolidado.');
        setIsSaving(false);
        return;
      }

      if (payload.length > 0) {
        const successItems = await purchaseOrderService.updateReceivedQuantities(payload);
        if (!successItems) throw new Error("Error updating quantities");
      }

      // 1. Guardar cada entrada de documento (Factura/Guía) para las OCs seleccionadas en el Paso 2
      for (const entry of docEntries) {
        if (!entry.selectedOrderIds || entry.selectedOrderIds.length === 0) continue;

        let fileUrl: string | undefined = undefined;
        let cloudinaryId: string | undefined = undefined;

        if (entry.evidenceFile) {
          try {
            const uploadRes = await uploadToCloudinary(entry.evidenceFile);
            fileUrl = uploadRes.secure_url;
            cloudinaryId = uploadRes.public_id;
          } catch (uploadErr) {
            console.error('[TransitReportDialog] Error al subir archivo para documento:', entry.docNumber, uploadErr);
          }
        }

        if (fileUrl || entry.docNumber.trim()) {
          const docPromises = entry.selectedOrderIds.map(oId =>
            OrderDocumentService.saveDocument({
              purchase_order_id: oId,
              document_type: entry.docType,
              document_number: entry.docNumber.trim() || undefined,
              file_url: fileUrl || '',
              cloudinary_public_id: cloudinaryId,
            })
          );
          await Promise.all(docPromises);
        }
      }

      // 2. Registro de auditoría y sincronización atómica con Kardex de Inventario
      let totalMermas = 0;

      const syncPromises = payload.map(async p => {
        const item = items.find(i => i.id === p.id);
        if (!item) return;

        const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
        const addedQty = p.effectiveNewQty;
        const cat = item.materials?.materials_inventory?.inventory_category || item.materials?.category;
        const isSecaFresca = isSecaOrFrescaCategory(cat, item.materials?.materials_inventory?.inventory_category);
        const isMermaAccepted = acceptedMermas[item.id];

        try {
          await logAudit('update_received_quantity', {
            table: 'purchase_order_items',
            record_id: p.id,
            description: `Recibió ${addedQty} unidades del material '${item.material_name}' en la orden de compra ${orderNum}.${isMermaAccepted ? ' (Merma Aceptada y Finalizada)' : ''}`,
            new_data: { received_quantity: p.received_quantity },
            old_data: { received_quantity: item.received_quantity || 0 },
            material_name: item.material_name,
            order_number: orderNum,
            quantity_received: addedQty
          });
        } catch (e) {
          console.error('[TransitReportDialog] Audit logging error:', e);
        }

        // Si el material está asociado a inventario (o se resuelve por catálogo) y hay cantidad a procesar
        let targetMatId = item.material_id;

        if (!targetMatId) {
          try {
            const { data: catMat } = await supabase
              .from('materials')
              .select('id')
              .ilike('name', item.material_name.trim())
              .maybeSingle();

            if (catMat?.id) {
              targetMatId = catMat.id;
              await supabase
                .from('purchase_order_items')
                .update({ material_id: targetMatId })
                .eq('id', item.id);
            }
          } catch (e) {
            console.error('[TransitReportDialog] Error resolving material_id:', e);
          }
        }

        if (targetMatId && (addedQty > 0 || isMermaAccepted)) {
          const guiaInput = Number(guiaQuantities[item.id] || addedQty);
          const pesoGuia = isSecaFresca ? guiaInput : addedQty;
          const pesoRecibido = addedQty;
          const merma = Math.max(0, pesoGuia - pesoRecibido);
          if (merma > 0) totalMermas += merma;

          const docRefStr = docEntries.map(d => d.docNumber.trim()).filter(Boolean).join(', ');

          try {
            await registrarRecepcion({
              p_material_id: targetMatId,
              p_transaction_type: 'IN_PURCHASE',
              p_peso_guia: pesoGuia,
              p_peso_recibido: pesoRecibido,
              p_unit_cost: item.unit_price,
              p_reference_doc: docRefStr ? `${orderNum} / Guía: ${docRefStr}` : orderNum,
              p_notes: isMermaAccepted ? `Merma aceptada y finalizada: ${merma.toFixed(2)} ${item.unit || 'KG'}` : undefined,
            });
          } catch (invErr) {
            console.error('[TransitReportDialog] Inventory Kardex sync error:', invErr);
          }
        }
      });
      await Promise.all(syncPromises);

      const updateOrderPromises = orderIds.map(orderId =>
        purchaseOrderService.updateOrderReceptionState(orderId)
      );
      await Promise.all(updateOrderPromises);

      // Refrescar caché global de TanStack Query para que los detalles de la OC y el Kardex se actualicen de inmediato
      await queryClient.invalidateQueries();

      const mermaNotice = totalMermas > 0 ? ` (Mermas registradas: ${totalMermas.toFixed(2)})` : '';
      showSuccess(`Recepción registrada exitosamente${mermaNotice}.`);

      setStep(1);
      setAcceptedMermas({});
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
          'Estado Orden': item.purchase_orders?.status || 'N/A',
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

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado electrónicamente desde el panel administrativo de Procarni System.', 105, finalY + totalsBoxHeight + 20, { align: 'center' });

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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <DialogTitle className="text-xl font-extrabold text-procarni-dark flex items-center gap-2">
                <Package className="h-5 w-5 text-procarni-primary" />
                Consolidador de Materiales y Recepción
              </DialogTitle>
              <DialogDescription className="text-xs italic text-gray-500 font-medium">
                Gestiona la recepción y visualiza los materiales en tránsito de las {orderIds.length} órdenes seleccionadas.
              </DialogDescription>
            </div>

            {/* Stepper Control Badges */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5",
                  step === 1 
                    ? "bg-procarni-dark text-white shadow-xs" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                <span className="w-4 h-4 rounded-full bg-white/20 text-center text-[10px] leading-4">1</span>
                <span>Materiales</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(2)}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5",
                  step === 2 
                    ? "bg-procarni-dark text-white shadow-xs" 
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                )}
              >
                <span className="w-4 h-4 rounded-full bg-white/20 text-center text-[10px] leading-4">2</span>
                <span>Consolidado OCs ({docEntries.length})</span>
              </button>
            </div>
          </div>
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
            <div className="flex-1 border border-gray-100 rounded-2xl overflow-hidden mt-2 bg-slate-50/50 min-h-0">
              <ScrollArea className="h-[55vh] md:h-[48vh] w-full">
                {step === 1 ? (
                  /* ========================================================================= */
                  /* PASO 1: RECEPCIÓN FÍSICA DE MATERIALES & MERMAS                           */
                  /* ========================================================================= */
                  (() => {
                    const pendingItems = items.filter(item => Number(item.received_quantity || 0) < item.quantity);
                    const completedItems = items.filter(item => Number(item.received_quantity || 0) >= item.quantity);

                    return (
                      <>
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
                                  const maxAllowed = Math.max(0, item.quantity - accumulatedQty);
                                  const isEditable = item.purchase_orders?.reception_status === 'En tránsito' || item.purchase_orders?.reception_status === 'Parcial';

                                  const cat = item.materials?.materials_inventory?.inventory_category || item.materials?.category;
                                  const isEnabledInInv = !!item.materials?.materials_inventory;
                                  const isSecaFresca = isSecaOrFrescaCategory(item.materials?.category, item.materials?.materials_inventory?.inventory_category);
                                  const canEnable = !isEnabledInInv && isHabilitableCategory(item.materials?.category, item.materials?.materials_inventory?.inventory_category);

                                  const pesoGuiaVal = Number(guiaQuantities[item.id] ?? (maxAllowed > 0 ? maxAllowed : item.quantity));
                                  const mermaVal = isSecaFresca && newQty > 0 ? Math.max(0, pesoGuiaVal - newQty) : 0;

                                  return (
                                    <TableRow key={item.id} className="hover:bg-slate-100/30 transition-colors">
                                      <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                                      <TableCell className="text-xs text-gray-600 font-medium max-w-[120px] truncate" title={supplierName}>{supplierName}</TableCell>
                                      <TableCell className="text-xs">
                                        <div className="flex flex-col gap-1">
                                          <span className="font-semibold text-slate-800">{item.material_name}</span>
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            {isEnabledInInv && item.materials?.materials_inventory?.sku && (
                                              <Badge variant="outline" className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200">
                                                SKU: {item.materials.materials_inventory.sku}
                                              </Badge>
                                            )}
                                            {canEnable && item.material_id && (
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                  setEnablingMaterial({
                                                    id: item.material_id!,
                                                    name: item.material_name,
                                                    unit: item.unit || 'KG',
                                                    price: item.unit_price,
                                                  });
                                                  setEnableUnit(item.unit || 'KG');
                                                  setEnableCost(String(item.unit_price || 0));
                                                }}
                                                className="h-5 px-1.5 text-[9px] font-bold border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md flex items-center gap-1 shadow-2xs"
                                              >
                                                <PlusCircle className="h-3 w-3" /> Habilitar en Almacén
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs text-center font-bold font-mono">
                                        {item.quantity} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                                      </TableCell>
                                      <TableCell className="text-xs text-center font-bold font-mono bg-slate-100/30 border-x border-gray-100">
                                        {accumulatedQty} <span className="text-[10px] text-gray-400 font-normal">{item.unit || 'UND'}</span>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
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
                                          {isSecaFresca && mermaVal > 0 && (
                                            <div className="flex flex-col items-center gap-1">
                                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded-full">
                                                <AlertTriangle className="h-2.5 w-2.5" /> Merma: {mermaVal.toFixed(2)} {item.unit || 'KG'}
                                              </span>
                                              <Button
                                                type="button"
                                                size="sm"
                                                variant={acceptedMermas[item.id] ? "default" : "outline"}
                                                onClick={() => {
                                                  setAcceptedMermas(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                                }}
                                                className={cn(
                                                  "h-6 px-2 text-[9px] font-bold rounded-lg transition-all flex items-center gap-1",
                                                  acceptedMermas[item.id] 
                                                    ? "bg-amber-500 hover:bg-amber-600 text-white shadow-xs" 
                                                    : "border-amber-300 text-amber-800 hover:bg-amber-50"
                                                )}
                                              >
                                                <CheckCircle2 className="h-3 w-3" />
                                                {acceptedMermas[item.id] ? "Merma Aceptada ✓" : "Aceptar Merma & Finalizar"}
                                              </Button>
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-xs text-center">
                                        {(() => {
                                          const isMermaAccepted = acceptedMermas[item.id];
                                          const recPercent = Math.min(100, Math.max(0, Math.round((totalProjected / item.quantity) * 100)));
                                          const mermaPercent = isMermaAccepted && mermaVal > 0 
                                            ? Math.min(100 - recPercent, Math.round((mermaVal / item.quantity) * 100)) 
                                            : 0;

                                          return (
                                            <div className="flex flex-col items-center gap-1 min-w-[125px]">
                                              <span className="font-bold font-mono text-xs">
                                                {isMermaAccepted ? (
                                                  <span className="text-amber-700">{totalProjected} + {mermaVal.toFixed(1)}m / {item.quantity}</span>
                                                ) : (
                                                  <span>{totalProjected} / {item.quantity}</span>
                                                )}
                                                <span className="text-[9px] text-gray-400 font-normal"> ({recPercent + mermaPercent}%)</span>
                                              </span>
                                              
                                              {/* Barra de Progreso Bicolor (Verde: Recibido + Amarillo: Merma Aceptada) */}
                                              <div className="w-28 bg-gray-200/70 rounded-full h-2 overflow-hidden flex shadow-2xs">
                                                <div className="bg-green-600 h-full transition-all duration-300" style={{ width: `${recPercent}%` }} title={`Recibido real: ${recPercent}%`} />
                                                {mermaPercent > 0 && (
                                                  <div className="bg-amber-400 h-full transition-all duration-300" style={{ width: `${mermaPercent}%` }} title={`Merma aceptada: ${mermaPercent}%`} />
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })()}
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

                        {/* Completed Items Section */}
                        {completedItems.length > 0 && (
                          <div className="px-4 py-2 bg-green-50 border-y border-green-100 text-[11px] font-black uppercase tracking-wider text-green-800 flex items-center gap-1.5 mt-6">
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                            <span>Materiales Completamente Recibidos ({completedItems.length})</span>
                          </div>
                        )}
                        <div className="hidden md:block">
                          {completedItems.length > 0 && (
                            <Table>
                              <TableBody>
                                {completedItems.map((item) => {
                                  const orderNum = formatSequenceNumber(item.purchase_orders?.sequence_number, item.purchase_orders?.created_at);
                                  const supplierName = item.purchase_orders?.suppliers?.name || 'N/A';
                                  const accumulatedQty = Number(item.received_quantity || 0);

                                  return (
                                    <TableRow key={item.id} className="bg-green-50/20 hover:bg-green-50/30 transition-colors">
                                      <TableCell className="font-semibold text-xs text-procarni-dark pl-4">{orderNum}</TableCell>
                                      <TableCell className="text-xs text-gray-600 font-medium max-w-[120px] truncate">{supplierName}</TableCell>
                                      <TableCell className="text-xs font-semibold text-slate-800">{item.material_name}</TableCell>
                                      <TableCell className="text-xs text-center font-bold font-mono">{item.quantity} <span className="text-[10px] text-gray-400">{item.unit || 'UND'}</span></TableCell>
                                      <TableCell className="text-xs text-center font-bold font-mono bg-emerald-100/10 border-x border-gray-100">{accumulatedQty} <span className="text-[10px] text-gray-400">{item.unit || 'UND'}</span></TableCell>
                                      <TableCell className="text-center">
                                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                                          <Check className="h-3 w-3 shrink-0" /> Recibido
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-xs text-right font-mono font-semibold">{formatCurrencyVal(item.unit_price, item.purchase_orders?.currency)}</TableCell>
                                      <TableCell className="text-xs text-right text-muted-foreground pr-4"></TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  /* ========================================================================= */
                  /* PASO 2: CONSOLIDADOR DE FACTURAS, NOTAS DE ENTREGA Y OCs                   */
                  /* ========================================================================= */
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between bg-blue-50/80 p-3 rounded-2xl border border-blue-100">
                      <div>
                        <h4 className="text-xs font-extrabold text-blue-900 flex items-center gap-1.5">
                          <Paperclip className="h-4 w-4 text-blue-700" />
                          Consolidador de Documentos y Evidencias
                        </h4>
                        <p className="text-[11px] text-blue-700 font-medium">
                          Ingresa las notas de entrega / facturas y selecciona qué Órdenes de Compra ampara cada documento.
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDocEntries(prev => [
                            ...prev,
                            {
                              id: `doc-${Date.now()}`,
                              docType: 'Nota de Entrega',
                              docNumber: '',
                              selectedOrderIds: [...orderIds],
                              evidenceFile: null,
                              notes: '',
                            }
                          ]);
                        }}
                        className="h-8 border-blue-300 text-blue-800 hover:bg-blue-100 text-xs font-bold rounded-xl flex items-center gap-1"
                      >
                        <PlusCircle className="h-3.5 w-3.5" /> + Agregar otra Guía/Factura
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {docEntries.map((entry, idx) => (
                        <div key={entry.id} className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                              <Badge className="bg-slate-800 text-white text-[10px]">#{idx + 1}</Badge>
                              Comprobante / Documento
                            </span>

                            {docEntries.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setDocEntries(prev => prev.filter(d => d.id !== entry.id))}
                                className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg text-xs font-bold"
                              >
                                Eliminar
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Tipo Documento</Label>
                              <Select
                                value={entry.docType}
                                onValueChange={(val: any) => {
                                  setDocEntries(prev => prev.map(d => d.id === entry.id ? { ...d, docType: val } : d));
                                }}
                              >
                                <SelectTrigger className="h-9 bg-slate-50 text-xs font-medium rounded-xl border-slate-200">
                                  <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Nota de Entrega">Nota de Entrega</SelectItem>
                                  <SelectItem value="Factura">Factura</SelectItem>
                                  <SelectItem value="Otro">Otro Comprobante</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block"># Guía / Factura</Label>
                              <Input
                                type="text"
                                placeholder="Ej. NE-9482 / FAC-1049"
                                value={entry.docNumber}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setDocEntries(prev => prev.map(d => d.id === entry.id ? { ...d, docNumber: val } : d));
                                }}
                                className="h-9 bg-slate-50 text-xs font-semibold rounded-xl border-slate-200"
                              />
                            </div>

                            <div>
                              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Comprobante Foto/PDF</Label>
                              <div className="flex items-center gap-2">
                                <label className="flex-1 cursor-pointer flex items-center justify-center gap-2 h-9 px-3 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl text-xs font-medium text-slate-600 transition-all truncate">
                                  <Upload className="h-3.5 w-3.5 text-procarni-primary shrink-0" />
                                  <span className="truncate">{entry.evidenceFile ? entry.evidenceFile.name : "Subir archivo..."}</span>
                                  <input
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files[0]) {
                                        const file = e.target.files[0];
                                        setDocEntries(prev => prev.map(d => d.id === entry.id ? { ...d, evidenceFile: file } : d));
                                      }
                                    }}
                                  />
                                </label>
                                {entry.evidenceFile && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setDocEntries(prev => prev.map(d => d.id === entry.id ? { ...d, evidenceFile: null } : d));
                                    }}
                                    className="h-9 px-2 text-red-500 hover:bg-red-50 rounded-xl text-xs"
                                  >
                                    ✕
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Chips de Selección de OCs Amparadas por este documento */}
                          <div>
                            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">
                              Órdenes de Compra amparadas por esta {entry.docType}:
                            </Label>
                            <div className="flex flex-wrap gap-1.5">
                              {orderIds.map(oId => {
                                const isSelected = entry.selectedOrderIds.includes(oId);
                                const orderItem = items.find(i => i.order_id === oId);
                                const seqNum = formatSequenceNumber(orderItem?.purchase_orders?.sequence_number, orderItem?.purchase_orders?.created_at);

                                return (
                                  <button
                                    key={oId}
                                    type="button"
                                    onClick={() => {
                                      const newSelected = isSelected
                                        ? entry.selectedOrderIds.filter(id => id !== oId)
                                        : [...entry.selectedOrderIds, oId];
                                      setDocEntries(prev => prev.map(d => d.id === entry.id ? { ...d, selectedOrderIds: newSelected } : d));
                                    }}
                                    className={cn(
                                      "px-3 py-1 rounded-xl text-xs font-mono font-bold transition-all border flex items-center gap-1.5 cursor-pointer select-none",
                                      isSelected
                                        ? "bg-procarni-dark text-white border-procarni-dark shadow-xs"
                                        : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                                    )}
                                  >
                                    {isSelected ? <Check className="h-3 w-3 text-emerald-400" /> : <PlusCircle className="h-3 w-3 text-slate-400" />}
                                    <span>{seqNum}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* ========================================================================= */}
            {/* WIZARD DIALOG FOOTER                                                      */}
            {/* ========================================================================= */}
            <DialogFooter className="pt-3 border-t border-gray-100 mt-2 w-full">
              <div className="flex flex-col sm:flex-row gap-2 items-center justify-between w-full">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button variant="ghost" onClick={onClose} className="h-10 px-4 rounded-xl text-slate-500 text-xs font-bold">
                    Cerrar
                  </Button>

                  {step === 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setStep(1)}
                      className="h-10 border-slate-300 text-slate-700 hover:bg-slate-100 px-4 rounded-xl text-xs font-bold"
                    >
                      ← Volver a Materiales (Paso 1)
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto ml-auto">
                  {step === 1 ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleSetInTransit}
                        disabled={isSaving || items.length === 0 || !canSetInTransit}
                        className="h-10 border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary/10 px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-xs transition-all text-xs"
                      >
                        <Truck className="h-4 w-4" />
                        Establecer En Tránsito
                      </Button>

                      <Button
                        onClick={handleSaveReception}
                        disabled={isSaving || items.length === 0}
                        className="h-10 bg-green-700 hover:bg-green-800 text-white px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all text-xs"
                      >
                        <PackageCheck className="h-4 w-4" />
                        Guardar Directo (1 Clic)
                      </Button>

                      <Button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={items.length === 0}
                        className="h-10 bg-procarni-dark hover:bg-slate-800 text-white px-4 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all text-xs"
                      >
                        Consolidar Facturas / Evidencias →
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleSaveReception}
                      disabled={isSaving || items.length === 0}
                      className="h-10 bg-green-700 hover:bg-green-800 text-white px-5 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md hover:shadow-lg transition-all text-xs"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Finalizar Recepción & Guardar Todo
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {/* ========================================================================= */}
      {/* OPCIÓN A: MODAL RÁPIDO PARA HABILITAR MATERIAL EN ALMACÉN                */}
      {/* ========================================================================= */}
      <Dialog open={!!enablingMaterial} onOpenChange={(val) => !val && setEnablingMaterial(null)}>
        <DialogContent className="max-w-md bg-white rounded-2xl p-6 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold text-procarni-dark flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-blue-600" />
              Habilitar Material para Almacén
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registra <strong>{enablingMaterial?.name}</strong> en el inventario para controlar su stock y kardex.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleEnableSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Categoría Almacén *</Label>
                <Select value={enableCategory} onValueChange={(val: any) => setEnableCategory(val)}>
                  <SelectTrigger className="h-9 bg-slate-50 text-xs font-bold rounded-xl border-slate-200">
                    <SelectValue placeholder="Categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MPS">
                      <span className="font-bold text-amber-700">MPS</span> - Seca
                    </SelectItem>
                    <SelectItem value="MPF">
                      <span className="font-bold text-red-700">MPF</span> - Fresca
                    </SelectItem>
                    <SelectItem value="EMP">
                      <span className="font-bold text-blue-700">EMP</span> - Empaques
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Tipo de Inventario *</Label>
                <Select value={enableInventoryType} onValueChange={(val: any) => setEnableInventoryType(val)}>
                  <SelectTrigger className="h-9 bg-slate-50 text-xs font-bold rounded-xl border-slate-200">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Producción">
                      <span className="font-bold text-procarni-dark">Producción</span>
                    </SelectItem>
                    <SelectItem value="Suministro">
                      <span className="font-bold text-slate-700">Suministro</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Unidad *</Label>
                <Input
                  type="text"
                  value={enableUnit}
                  onChange={(e) => setEnableUnit(e.target.value)}
                  className="h-9 bg-slate-50 text-xs font-semibold rounded-xl border-slate-200"
                  required
                />
              </div>

              <div>
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Alerta Stock Mín.</Label>
                <Input
                  type="number"
                  min="0"
                  value={enableMinStock}
                  onChange={(e) => setEnableMinStock(e.target.value)}
                  className="h-9 bg-slate-50 text-xs font-semibold rounded-xl border-slate-200"
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Costo Inicial / Referencia ($)</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={enableCost}
                onChange={(e) => setEnableCost(e.target.value)}
                className="h-9 bg-slate-50 text-xs font-semibold rounded-xl border-slate-200"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEnablingMaterial(null)} className="h-9 rounded-xl text-xs">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isEnabling}
                className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
              >
                {isEnabling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Habilitar y Guardar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default TransitReportDialog;

