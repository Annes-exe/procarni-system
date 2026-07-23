import React, { useState, useMemo } from 'react';
import { m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Calendar,
  Search,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowRight,
  ArrowUpDown,
  DollarSign,
  User,
  PlusCircle,
  TrendingUp,
  History,
  ArrowUpRight,
  FileText,
  FileSpreadsheet,
  ShieldCheck,
  CheckCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { cn } from '@/lib/utils';
import { currencyService } from '@/services/currencyService';
import { calculateTotals } from '@/utils/calculations';
import { showError, showSuccess, showLoading, dismissToast, showWarning } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OrderItem {
  id: string;
  sequence_number: number | null;
  issue_date: string | null;
  credit_days: number | null;
  created_at: string | null;
  status: string;
  payment_terms: string | null;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  paid_amount: number | null;
  observations: string | null;
  suppliers: { name: string } | null;
  type: 'purchase_order' | 'service_order';
  displayId: string;
  totalAmount: number;
  baseImponible: number;
  montoIVA: number;
}

interface PaymentTransaction {
  id: string;
  order_id: string;
  order_type: 'purchase_order' | 'service_order';
  payment_date: string;
  amount: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  converted_amount: number;
  registered_by: string | null;
  previous_paid: number;
  new_paid: number;
  notes: string | null;
  created_at: string;
}

type SortOption = 'urgency' | 'number_asc' | 'number_desc' | 'value_desc' | 'date_desc';

// Helper to get local date string YYYY-MM-DD to avoid timezone shifts
const getLocalDateString = (dateObjOrStr: Date | string) => {
  if (!dateObjOrStr) return '';
  const d = new Date(dateObjOrStr);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PaymentRemindersDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, session, isLoadingSession } = useSession();
  const isAdmin = role === 'admin' || role === 'administrador';
  const isAuthorized = isAdmin || role === 'payment_viewer';

  React.useEffect(() => {
    if (!isLoadingSession && !isAuthorized) {
      showError('No tiene permisos para acceder al apartado de Cuentas por Pagar (CXP).');
      navigate('/');
    }
  }, [role, isLoadingSession, isAuthorized, navigate]);

  const [searchTerm, setSearchTerm] = useState('');

  // Sorting and filtering states
  const [sortBy, setSortBy] = useState<SortOption>('urgency');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');

  // Prepago Report Dialog states
  const [isPrepagoDialogOpen, setIsPrepagoDialogOpen] = useState(false);
  const [prepagoSort, setPrepagoSort] = useState<string>('urgency');
  const [prepagoSupplier, setPrepagoSupplier] = useState<string>('all');
  const [prepagoStartDate, setPrepagoStartDate] = useState<string>('');
  const [prepagoEndDate, setPrepagoEndDate] = useState<string>('');
  const [prepagoSearchFact, setPrepagoSearchFact] = useState<string>('');

  // Abono dialog states
  const [isAbonoDialogOpen, setIsAbonoDialogOpen] = useState(false);
  const [selectedOrderForAbono, setSelectedOrderForAbono] = useState<OrderItem | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoCurrency, setAbonoCurrency] = useState<'USD' | 'VES' | 'EUR'>('VES');
  const [abonoExchangeRate, setAbonoExchangeRate] = useState('');
  const [orderCurrencyDailyRate, setOrderCurrencyDailyRate] = useState<number | null>(null);
  const [isSubmittingAbono, setIsSubmittingAbono] = useState(false);

  // Admin Simulated Payment dialog states (Individual & Batch)
  const [isSimulatedDialogOpen, setIsSimulatedDialogOpen] = useState(false);
  const [selectedOrderForSimulated, setSelectedOrderForSimulated] = useState<OrderItem | null>(null);
  const [simulatedNotes, setSimulatedNotes] = useState('[PAGO TRANSITORIO POR SISTEMA - MÓDULO CXP EN DESARROLLO]');
  const [isSubmittingSimulated, setIsSubmittingSimulated] = useState(false);

  const [isBatchSimulatedDialogOpen, setIsBatchSimulatedDialogOpen] = useState(false);
  const [selectedOrderIdsForBatch, setSelectedOrderIdsForBatch] = useState<string[]>([]);
  const [batchSimulatedNotes, setBatchSimulatedNotes] = useState('[PAGO TRANSITORIO MASIVO POR SISTEMA - MÓDULO CXP EN DESARROLLO]');
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [isBatchSelectionActive, setIsBatchSelectionActive] = useState(false);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  // Fetch Credit Orders (Pending Payment and Paid) with item details to calculate totals
  const { data: orders, isLoading, isError, refetch } = useQuery<OrderItem[]>({
    queryKey: ['creditOrdersDashboardFull'],
    queryFn: async () => {
      const [posResponse, sosResponse] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, currency, exchange_rate, paid_amount, observations, suppliers(name), purchase_order_items(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage)')
          .eq('payment_terms', 'Crédito')
          .in('status', ['Credit', 'ToPay', 'Paid']),
        supabase
          .from('service_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, currency, exchange_rate, paid_amount, observations, suppliers(name), service_order_items(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage), service_order_materials(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage)'),
      ]);

      if (posResponse.error) console.error('Error fetching POs:', posResponse.error);
      if (sosResponse.error) console.error('Error fetching SOs:', sosResponse.error);

      const pos = (posResponse.data || []).map((po) => {
        const year = po.created_at ? new Date(po.created_at).getFullYear() : new Date().getFullYear();
        const month = po.created_at ? String(new Date(po.created_at).getMonth() + 1).padStart(2, '0') : '01';
        const totals = calculateTotals(po.purchase_order_items || []);
        return {
          ...po,
          totalAmount: totals.total,
          baseImponible: totals.baseImponible,
          montoIVA: totals.montoIVA,
          type: 'purchase_order' as const,
          displayId: `OC-${year}-${month}-${String(po.sequence_number).padStart(3, '0')}`,
        };
      });

      // Service Orders credit payment terms check
      const sos = (sosResponse.data || [])
        .filter((so) => so.payment_terms === 'Crédito' && ['Credit', 'ToPay', 'Paid'].includes(so.status))
        .map((so) => {
          const year = so.created_at ? new Date(so.created_at).getFullYear() : new Date().getFullYear();
          const month = so.created_at ? String(new Date(so.created_at).getMonth() + 1).padStart(2, '0') : '01';
          const items = [
            ...(so.service_order_items || []),
            ...(so.service_order_materials || [])
          ];
          const totals = calculateTotals(items);
          return {
            ...so,
            totalAmount: totals.total,
            baseImponible: totals.baseImponible,
            montoIVA: totals.montoIVA,
            type: 'service_order' as const,
            displayId: `OS-${year}-${month}-${String(so.sequence_number).padStart(3, '0')}`,
          };
        });

      return [...pos, ...sos] as OrderItem[];
    },
  });

  // Fetch Kardex Payment Transactions
  const { data: rawTransactions, isLoading: isLoadingKardex, isError: isErrorKardex, refetch: refetchKardex } = useQuery<PaymentTransaction[]>({
    queryKey: ['paymentTransactionsKardex'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_transactions')
        .select('*')
        .order('payment_date', { ascending: false });
      if (error) throw error;
      return data as PaymentTransaction[];
    }
  });

  // Join Kardex with suppliers and displayId in memory
  const kardexRecords = useMemo(() => {
    if (!rawTransactions || !orders) return [];

    return rawTransactions.map(tx => {
      const matchedOrder = orders.find(o => o.id === tx.order_id);
      return {
        ...tx,
        displayId: matchedOrder?.displayId || `Documento`,
        supplierName: matchedOrder?.suppliers?.name || 'Desconocido',
        totalAmount: matchedOrder?.totalAmount || 0,
        orderCurrency: matchedOrder?.currency || tx.currency
      };
    });
  }, [rawTransactions, orders]);

  // Filter Kardex based on search, supplier, and dates
  const filteredKardex = useMemo(() => {
    let result = [...kardexRecords];

    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        r => r.displayId.toLowerCase().includes(lower) || r.supplierName.toLowerCase().includes(lower)
      );
    }

    if (selectedSupplierFilter !== 'all') {
      result = result.filter(r => r.supplierName === selectedSupplierFilter);
    }

    if (startDateFilter) {
      result = result.filter(r => {
        const localDate = getLocalDateString(r.payment_date);
        return localDate >= startDateFilter;
      });
    }

    if (endDateFilter) {
      result = result.filter(r => {
        const localDate = getLocalDateString(r.payment_date);
        return localDate <= endDateFilter;
      });
    }

    return result;
  }, [kardexRecords, searchTerm, selectedSupplierFilter, startDateFilter, endDateFilter]);

  // Trigger urgent alerts upon loading
  React.useEffect(() => {
    if (!orders || orders.length === 0) return;

    const pending = orders.filter(o => o.status !== 'Paid');
    let vencidosCount = 0;
    let vencenHoyCount = 0;
    let vencenProntoCount = 0;

    pending.forEach(order => {
      const issueDateObj = new Date(order.issue_date || '');
      const creditDaysVal = order.credit_days || 0;
      const dueDateVal = issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000;
      const daysLeft = Math.ceil((dueDateVal - new Date().getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft < 0) {
        vencidosCount++;
      } else if (daysLeft === 0) {
        vencenHoyCount++;
      } else if (daysLeft > 0 && daysLeft <= 3) {
        vencenProntoCount++;
      }
    });

    if (vencidosCount > 0) {
      showWarning(`Hay ${vencidosCount} factura(s) de crédito VENCIDA(S). Por favor revise las cuentas por pagar.`);
    }
    if (vencenHoyCount > 0) {
      showWarning(`Hay ${vencenHoyCount} factura(s) de crédito que VENCE(N) HOY.`);
    }
    if (vencenProntoCount > 0) {
      showWarning(`Hay ${vencenProntoCount} factura(s) de crédito por vencer en los próximos 3 días.`);
    }
  }, [orders]);

  // Export History to XLSX (Excel format)
  const handleExportKardexXLSX = () => {
    if (filteredKardex.length === 0) {
      showError('No hay datos para exportar.');
      return;
    }

    const data = filteredKardex.map(tx => ({
      'Fecha/Hora': new Date(tx.payment_date).toLocaleString('es-VE'),
      'Nro Documento': tx.displayId,
      'Proveedor': tx.supplierName,
      'Monto Aportado': tx.amount,
      'Moneda Pago': tx.currency,
      'Tasa de Cambio': tx.exchange_rate || 'N/A',
      'Monto Acreditado': tx.converted_amount,
      'Moneda Documento': tx.orderCurrency,
      'Notas': tx.notes || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial de Pagos');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `reporte_cxp_pagos_${dateStr}.xlsx`);
    showSuccess('Reporte de Pagos en Excel (.xlsx) descargado exitosamente.');
  };

  // Export History to PDF (Direct PDF download via jsPDF)
  const handleExportKardexPDF = () => {
    if (filteredKardex.length === 0) {
      showError('No hay datos para exportar.');
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const dateStr = new Date().toLocaleDateString('es-VE');

      const rangeStr = startDateFilter || endDateFilter
        ? `Período: ${startDateFilter || 'Inicio'} al ${endDateFilter || 'Fin'}`
        : 'Período: Histórico Completo';

      const supplierStr = selectedSupplierFilter !== 'all'
        ? `Proveedor: ${selectedSupplierFilter}`
        : 'Proveedores: Todos';

      const searchStr = searchTerm.trim()
        ? `Búsqueda: "${searchTerm}"`
        : '';

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
      doc.text('Historial de Transacciones de Pago', 280, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, 280, 23, { align: 'right' });

      // Filters summary line
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${rangeStr}  |  ${supplierStr}${searchStr ? '  |  ' + searchStr : ''}`, 14, 32);

      // Extract rows
      const tableRows = filteredKardex.map(tx => [
        new Date(tx.payment_date).toLocaleString('es-VE'),
        tx.displayId,
        tx.supplierName,
        formatCurrency(tx.amount, tx.currency),
        tx.exchange_rate ? `@ ${tx.exchange_rate.toFixed(4)}` : 'N/A',
        formatCurrency(tx.converted_amount, tx.orderCurrency),
        tx.notes || ''
      ]);

      // Totals by transaction currency (Monto Transacción)
      const totalVES = filteredKardex.filter(tx => tx.currency === 'VES').reduce((sum, tx) => sum + tx.amount, 0);
      const totalUSD = filteredKardex.filter(tx => tx.currency === 'USD').reduce((sum, tx) => sum + tx.amount, 0);
      const totalEUR = filteredKardex.filter(tx => tx.currency === 'EUR').reduce((sum, tx) => sum + tx.amount, 0);

      const transaccionSummaryArr: string[] = [];
      if (totalVES > 0) transaccionSummaryArr.push(`Bs. ${totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      if (totalUSD > 0) transaccionSummaryArr.push(`$ ${totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      if (totalEUR > 0) transaccionSummaryArr.push(`€ ${totalEUR.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      const summaryTransaccionText = transaccionSummaryArr.length > 0
        ? transaccionSummaryArr.join('\n')
        : '-';

      // Totals by document currency (Monto Acreditado)
      const totalAcreditadoVES = filteredKardex.filter(tx => tx.orderCurrency === 'VES').reduce((sum, tx) => sum + tx.converted_amount, 0);
      const totalAcreditadoUSD = filteredKardex.filter(tx => tx.orderCurrency === 'USD').reduce((sum, tx) => sum + tx.converted_amount, 0);
      const totalAcreditadoEUR = filteredKardex.filter(tx => tx.orderCurrency === 'EUR').reduce((sum, tx) => sum + tx.converted_amount, 0);

      const acreditadoSummaryArr: string[] = [];
      if (totalAcreditadoVES > 0) acreditadoSummaryArr.push(`Bs. ${totalAcreditadoVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      if (totalAcreditadoUSD > 0) acreditadoSummaryArr.push(`$ ${totalAcreditadoUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      if (totalAcreditadoEUR > 0) acreditadoSummaryArr.push(`€ ${totalAcreditadoEUR.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

      const summaryAcreditadoText = acreditadoSummaryArr.length > 0
        ? acreditadoSummaryArr.join('\n')
        : '-';

      // Append summary row at bottom of table
      tableRows.push([
        'TOTALES',
        '',
        '',
        summaryTransaccionText,
        '',
        summaryAcreditadoText,
        ''
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Fecha/Hora', 'Documento', 'Proveedor', 'Monto Transacción', 'Tasa de Cambio', 'Monto Acreditado', 'Observaciones / Notas']],
        body: tableRows,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
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
          0: { cellWidth: 35 },
          1: { cellWidth: 28, fontStyle: 'bold' },
          2: { cellWidth: 55, fontStyle: 'bold', textColor: [27, 41, 74] },
          3: { cellWidth: 32, halign: 'right', fontStyle: 'bold', textColor: [14, 87, 8] },
          4: { cellWidth: 25, halign: 'right' },
          5: { cellWidth: 35, halign: 'right', fontStyle: 'bold', textColor: [27, 41, 74] },
          6: { cellWidth: 'auto' }
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
            if (data.column.index === 3) {
              data.cell.styles.textColor = [14, 87, 8];
            }
            if (data.column.index === 5) {
              data.cell.styles.textColor = [27, 41, 74];
            }
          }
        }
      });

      // @ts-expect-error - lastAutoTable is injected dynamically by jspdf-autotable
      const finalY = doc.lastAutoTable?.finalY || 120;

      // Subtle explanatory notes below table totals
      doc.setFont('Helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('* Monto Transacción: Muestra el acumulado abonado según la moneda del pago (Bs., $, €).', 14, finalY + 7);
      doc.text('* Monto Acreditado: Muestra el acumulado abonado equivalente según la moneda original del documento (Bs., $, €).', 14, finalY + 12);

      // System Footer
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado automáticamente desde el panel de control de CXP.', 148, finalY + 22, { align: 'center' });

      const fileDate = new Date().toISOString().split('T')[0];
      doc.save(`Reporte_Historial_Pagos_CXP_${fileDate}.pdf`);
      showSuccess('Reporte PDF del Historial de Pagos descargado exitosamente.');
    } catch (error) {
      console.error('Kardex PDF Export Error:', error);
      showError('Ocurrió un error al generar el PDF del historial de pagos.');
    }
  };

  // Export Prepago Report to XLSX
  const handleExportPrepagoXLSX = () => {
    if (processedPrepagoOrders.length === 0) {
      showError('No hay datos para exportar.');
      return;
    }

    const data = processedPrepagoOrders.map(order => {
      const issueDateObj = new Date(order.issue_date || order.created_at || '');
      const creditDaysVal = order.credit_days || 0;
      const dueDateVal = new Date(issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000);

      // Calculations converted to USD if VES
      const rate = (order.currency === 'VES' && order.exchange_rate) ? order.exchange_rate : 1;
      const baseUSD = order.baseImponible / rate;
      const ivaUSD = order.montoIVA / rate;
      const totalUSD = order.totalAmount / rate;

      return {
        'FECHA': issueDateObj.toLocaleDateString('es-VE'),
        'FACT Nº': '-',
        'DESCRIPCION': order.observations || order.displayId,
        'BASE ($)': Number(baseUSD.toFixed(2)),
        '75% IVA ($)': Number((ivaUSD * 0.75).toFixed(2)),
        '25% IVA ($)': Number((ivaUSD * 0.25).toFixed(2)),
        'TOTAL $': Number(totalUSD.toFixed(2)),
        'FECHA TOPE': dueDateVal.toLocaleDateString('es-VE'),
        'PROVEEDOR': order.suppliers?.name || 'Desconocido',
        'MONEDA ORIGEN': order.currency
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Prepago');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `reporte_prepago_cxp_${dateStr}.xlsx`);
    showSuccess('Reporte Prepago en Excel (.xlsx) descargado exitosamente.');
  };

  // Export Prepago Report to PDF
  const handleExportPrepagoPDF = () => {
    if (processedPrepagoOrders.length === 0) {
      showError('No hay datos para exportar.');
      return;
    }

    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const dateStr = new Date().toLocaleDateString('es-VE');
      
      const rangeStr = prepagoStartDate || prepagoEndDate
        ? `Período: ${prepagoStartDate || 'Inicio'} al ${prepagoEndDate || 'Fin'}`
        : 'Período: Completo';

      const supplierStr = prepagoSupplier !== 'all'
        ? `Proveedor: ${prepagoSupplier}`
        : 'Proveedores: Todos';

      const filterSortStr = prepagoSort === 'urgency' ? 'Criterio: Más urgentes primero' :
                            prepagoSort === 'amount_desc' ? 'Criterio: Montos más altos' :
                            prepagoSort === 'number_asc' ? 'Criterio: Nro de Orden (Asc)' :
                            prepagoSort === 'number_desc' ? 'Criterio: Nro de Orden (Desc)' : 'Criterio: Todas';

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
      doc.text('Reporte de Cuentas por Pagar', 280, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, 280, 23, { align: 'right' });

      // Filters summary line
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`${rangeStr}  |  ${supplierStr}  |  ${filterSortStr}`, 14, 32);

      let sumBaseUSD = 0;
      let sumIva75USD = 0;
      let sumIva25USD = 0;
      let sumTotalUSD = 0;

      // Extract rows
      const tableRows = processedPrepagoOrders.map(order => {
        const issueDateObj = new Date(order.issue_date || order.created_at || '');
        const creditDaysVal = order.credit_days || 0;
        const dueDateVal = new Date(issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000);

        const rate = (order.currency === 'VES' && order.exchange_rate) ? order.exchange_rate : 1;
        const baseUSD = order.baseImponible / rate;
        const ivaUSD = order.montoIVA / rate;
        const totalUSD = order.totalAmount / rate;

        sumBaseUSD += baseUSD;
        sumIva75USD += ivaUSD * 0.75;
        sumIva25USD += ivaUSD * 0.25;
        sumTotalUSD += totalUSD;

        const descriptionStr = `${order.suppliers?.name || 'Desconocido'} (${order.displayId}${order.observations ? ' - ' + order.observations : ''})`;

        return [
          issueDateObj.toLocaleDateString('es-VE'),
          '-',
          descriptionStr,
          `$${baseUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(ivaUSD * 0.75).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${(ivaUSD * 0.25).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `$${totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          dueDateVal.toLocaleDateString('es-VE')
        ];
      });

      // Append totals row
      tableRows.push([
        'TOTAL',
        '',
        'TOTAL DE CADA COLUMNA',
        `$${sumBaseUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${sumIva75USD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${sumIva25USD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `$${sumTotalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        ''
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Fecha', 'Fact Nº', 'Descripción / Orden / Proveedor', 'Base ($)', '75% IVA ($)', '25% IVA ($)', 'Total $', 'Fecha Tope']],
        body: tableRows,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
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
          0: { cellWidth: 22 },
          1: { cellWidth: 18 },
          2: { cellWidth: 100 },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 28, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
          6: { cellWidth: 28, halign: 'right', fontStyle: 'bold', textColor: [27, 41, 74] },
          7: { cellWidth: 22 }
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
            if (data.column.index === 6) {
              data.cell.styles.textColor = [14, 87, 8];
            }
          }
        }
      });

      // @ts-expect-error - lastAutoTable is injected dynamically by jspdf-autotable
      const finalY = doc.lastAutoTable?.finalY || 120;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado automáticamente desde el panel de control de CXP.', 148, finalY + 15, { align: 'center' });

      doc.save(`Reporte_Prepago_CXP_${new Date().toISOString().split('T')[0]}.pdf`);
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error) {
      console.error('PDF Error:', error);
      showError('Ocurrió un error al generar el PDF.');
    }
  };

  // Calculate frequent suppliers (Dynamic Top 5)
  const frequentSuppliers = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const counts: Record<string, { count: number; name: string }> = {};
    orders.forEach(order => {
      const name = order.suppliers?.name || 'Desconocido';
      if (!counts[name]) {
        counts[name] = { count: 0, name };
      }
      counts[name].count += 1;
    });

    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Take top 5
  }, [orders]);

  // Handle Abono (Partial Payment) Mutation
  const addAbonoMutation = useMutation({
    mutationFn: async ({
      order,
      amount,
      convertedAmount,
      paymentCurrency,
      exchangeRate
    }: {
      order: OrderItem;
      amount: number;
      convertedAmount: number;
      paymentCurrency: 'USD' | 'VES' | 'EUR';
      exchangeRate: number | null;
    }) => {
      const currentPaid = order.paid_amount || 0;
      const newPaid = Number((currentPaid + convertedAmount).toFixed(2));

      // If payment meets or exceeds total, mark as Paid
      const shouldMarkAsPaid = newPaid >= (order.totalAmount - 0.01);
      const updatedStatus = shouldMarkAsPaid ? 'Paid' : order.status;

      const tableName = order.type === 'purchase_order' ? 'purchase_orders' : 'service_orders';

      const updateData = {
        paid_amount: newPaid,
        status: updatedStatus
      };

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Register payment transaction in Kardex
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id || null;

      const { error: txError } = await supabase
        .from('payment_transactions')
        .insert({
          order_id: order.id,
          order_type: order.type,
          amount: amount,
          currency: paymentCurrency,
          exchange_rate: exchangeRate,
          converted_amount: convertedAmount,
          registered_by: userId,
          previous_paid: currentPaid,
          new_paid: newPaid,
          notes: `Abono registrado en ${paymentCurrency}`
        });

      if (txError) throw txError;

      return { shouldMarkAsPaid };
    },
    onSuccess: (result) => {
      showSuccess(
        result.shouldMarkAsPaid
          ? '¡Abono registrado! El saldo total ha sido cubierto y la orden se marcó como Pagada.'
          : 'Abono registrado exitosamente.'
      );
      queryClient.invalidateQueries({ queryKey: ['creditOrdersDashboardFull'] });
      queryClient.invalidateQueries({ queryKey: ['paymentTransactionsKardex'] });
      setIsAbonoDialogOpen(false);
      setSelectedOrderForAbono(null);
      setAbonoAmount('');
    },
    onError: (error) => {
      console.error('Error recording abono:', error);
      showError('Ocurrió un error al registrar el abono.');
    }
  });

  const handleOpenAbonoDialog = (order: OrderItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOrderForAbono(order);
    setAbonoCurrency('VES');
    setAbonoExchangeRate(String(order.exchange_rate || ''));
    setAbonoAmount('');
    setIsAbonoDialogOpen(true);
  };

  // Load daily rates when dialog opens or payment currency changes
  React.useEffect(() => {
    if (!selectedOrderForAbono || !isAbonoDialogOpen) return;

    // Fetch order currency rate (for summary conversion to VES)
    const fetchOrderRate = async () => {
      if (selectedOrderForAbono.currency === 'VES') {
        setOrderCurrencyDailyRate(1);
        return;
      }
      try {
        let r = 1;
        if (selectedOrderForAbono.currency === 'EUR') {
          const eurObj = await currencyService.getEurRate();
          r = eurObj.promedio || eurObj.valor;
        } else {
          const usdObj = await currencyService.getUsdRate();
          r = usdObj.promedio || usdObj.valor;
        }
        setOrderCurrencyDailyRate(r);
      } catch (e) {
        console.error('Error loading order daily rate:', e);
        setOrderCurrencyDailyRate(selectedOrderForAbono.exchange_rate || 1);
      }
    };
    fetchOrderRate();

    // Fetch conversion rate for the payment input
    if (selectedOrderForAbono.currency === abonoCurrency) {
      setAbonoExchangeRate('');
      return;
    }

    const fetchRate = async () => {
      try {
        let rate = 1;
        if (abonoCurrency === 'VES') {
          if (selectedOrderForAbono.currency === 'EUR') {
            const eurRateObj = await currencyService.getEurRate();
            rate = eurRateObj.promedio || eurRateObj.valor;
          } else {
            const usdRateObj = await currencyService.getUsdRate();
            rate = usdRateObj.promedio || usdRateObj.valor;
          }
        } else if (selectedOrderForAbono.currency === 'VES') {
          if (abonoCurrency === 'EUR') {
            const eurRateObj = await currencyService.getEurRate();
            rate = eurRateObj.promedio || eurRateObj.valor;
          } else {
            const usdRateObj = await currencyService.getUsdRate();
            rate = usdRateObj.promedio || usdRateObj.valor;
          }
        } else {
          // USD vs EUR
          const [eurObj, usdObj] = await Promise.all([
            currencyService.getEurRate(),
            currencyService.getUsdRate()
          ]);
          const eur = eurObj.promedio || eurObj.valor;
          const usd = usdObj.promedio || usdObj.valor;
          rate = eur / usd;
        }

        if (rate && rate > 0) {
          setAbonoExchangeRate(rate.toFixed(4));
        }
      } catch (e) {
        console.error('Error fetching conversion exchange rate:', e);
        setAbonoExchangeRate(String(selectedOrderForAbono.exchange_rate || ''));
      }
    };

    fetchRate();
  }, [abonoCurrency, selectedOrderForAbono, isAbonoDialogOpen]);

  const handleRegisterAbono = async () => {
    if (!selectedOrderForAbono || !abonoAmount || Number(abonoAmount) <= 0) {
      showError('Por favor ingrese un monto válido.');
      return;
    }

    // Concurrency verification
    try {
      const tableName = selectedOrderForAbono.type === 'purchase_order' ? 'purchase_orders' : 'service_orders';
      const { data: latestOrder, error } = await supabase
        .from(tableName)
        .select('paid_amount, status')
        .eq('id', selectedOrderForAbono.id)
        .single();

      if (error) throw error;

      if (latestOrder) {
        const latestPaid = latestOrder.paid_amount || 0;
        const currentPaidLocal = selectedOrderForAbono.paid_amount || 0;
        if (Math.abs(latestPaid - currentPaidLocal) > 0.01 || latestOrder.status !== selectedOrderForAbono.status) {
          showError('Los datos de este documento han cambiado. La vista se recargará.');
          queryClient.invalidateQueries({ queryKey: ['creditOrdersDashboardFull'] });
          setIsAbonoDialogOpen(false);
          return;
        }
      }
    } catch (e) {
      console.error('Error verifying concurrency:', e);
    }

    const inputAmt = Number(abonoAmount);
    let convertedAmount = inputAmt;

    // Handle currency conversion
    if (selectedOrderForAbono.currency !== abonoCurrency) {
      const rate = Number(abonoExchangeRate);
      if (!rate || rate <= 0) {
        showError('Por favor ingrese una tasa de cambio válida para la conversión.');
        return;
      }

      if (selectedOrderForAbono.currency === 'VES') {
        convertedAmount = inputAmt * rate;
      } else if (abonoCurrency === 'VES') {
        convertedAmount = inputAmt / rate;
      } else if (selectedOrderForAbono.currency === 'USD' && abonoCurrency === 'EUR') {
        convertedAmount = inputAmt * rate;
      } else if (selectedOrderForAbono.currency === 'EUR' && abonoCurrency === 'USD') {
        convertedAmount = inputAmt / rate;
      }
    }

    // Check if new total paid exceeds total amount
    const currentPaid = selectedOrderForAbono.paid_amount || 0;
    const remaining = selectedOrderForAbono.totalAmount - currentPaid;

    if (convertedAmount > (remaining + 0.05)) {
      showError(`El monto ingresado (${convertedAmount.toFixed(2)} ${selectedOrderForAbono.currency}) supera el saldo pendiente de ${remaining.toFixed(2)} ${selectedOrderForAbono.currency}.`);
      return;
    }

    setIsSubmittingAbono(true);
    const toastId = showLoading('Procesando abono...');

    try {
      await addAbonoMutation.mutateAsync({
        order: selectedOrderForAbono,
        amount: inputAmt,
        convertedAmount: convertedAmount,
        paymentCurrency: abonoCurrency,
        exchangeRate: selectedOrderForAbono.currency !== abonoCurrency ? Number(abonoExchangeRate) : null
      });
    } finally {
      dismissToast(toastId);
      setIsSubmittingAbono(false);
    }
  };

  // Convert input abono preview for user
  const convertedAbonoPreview = useMemo(() => {
    if (!selectedOrderForAbono || !abonoAmount || isNaN(Number(abonoAmount))) return null;
    const inputAmt = Number(abonoAmount);

    if (selectedOrderForAbono.currency === abonoCurrency) return null;

    const rate = Number(abonoExchangeRate);
    if (!rate || rate <= 0) return 'Tasa inválida';

    if (selectedOrderForAbono.currency === 'VES') {
      return `${(inputAmt * rate).toFixed(2)} VES`;
    } else if (abonoCurrency === 'VES') {
      return `${(inputAmt / rate).toFixed(2)} ${selectedOrderForAbono.currency}`;
    } else if (selectedOrderForAbono.currency === 'USD' && abonoCurrency === 'EUR') {
      return `${(inputAmt * rate).toFixed(2)} USD`;
    } else if (selectedOrderForAbono.currency === 'EUR' && abonoCurrency === 'USD') {
      return `${(inputAmt / rate).toFixed(2)} EUR`;
    }
    return null;
  }, [selectedOrderForAbono, abonoAmount, abonoCurrency, abonoExchangeRate]);

  // Admin Simulated Payment Handlers (Individual & Batch)
  const handleOpenSimulatedDialog = (order: OrderItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedOrderForSimulated(order);
    setSimulatedNotes(`[PAGO TRANSITORIO POR SISTEMA - MÓDULO CXP EN DESARROLLO] Documento: ${order.displayId}`);
    setIsSimulatedDialogOpen(true);
  };

  const handleExecuteSimulatedPayment = async () => {
    if (!selectedOrderForSimulated) return;
    setIsSubmittingSimulated(true);
    const toastId = showLoading('Procesando pago transitorio por sistema...');

    try {
      const order = selectedOrderForSimulated;
      const currentPaid = order.paid_amount || 0;
      const remaining = Number((order.totalAmount - currentPaid).toFixed(2));
      const tableName = order.type === 'purchase_order' ? 'purchase_orders' : 'service_orders';

      // Update Order Status to Paid
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          paid_amount: order.totalAmount,
          status: 'Paid'
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Insert transaction into payment_transactions Kardex
      const { error: txError } = await supabase
        .from('payment_transactions')
        .insert({
          order_id: order.id,
          order_type: order.type,
          amount: remaining > 0 ? remaining : order.totalAmount,
          currency: order.currency,
          exchange_rate: order.exchange_rate,
          converted_amount: remaining > 0 ? remaining : order.totalAmount,
          registered_by: session?.user?.id || null,
          previous_paid: currentPaid,
          new_paid: order.totalAmount,
          notes: simulatedNotes.trim() || '[PAGO TRANSITORIO POR SISTEMA - MÓDULO CXP EN DESARROLLO]'
        });

      if (txError) throw txError;

      showSuccess(`¡Orden ${order.displayId} marcada como Pagada con etiqueta transitoria de sistema!`);
      queryClient.invalidateQueries({ queryKey: ['creditOrdersDashboardFull'] });
      queryClient.invalidateQueries({ queryKey: ['paymentTransactionsKardex'] });
      setIsSimulatedDialogOpen(false);
      setSelectedOrderForSimulated(null);
    } catch (err) {
      console.error('Error executing simulated payment:', err);
      showError('Ocurrió un error al registrar el pago transitorio por sistema.');
    } finally {
      dismissToast(toastId);
      setIsSubmittingSimulated(false);
    }
  };

  const handleOpenBatchSimulatedDialog = () => {
    setBatchSimulatedNotes(`[PAGO TRANSITORIO MASIVO POR SISTEMA - MÓDULO CXP EN DESARROLLO] (${selectedOrderIdsForBatch.length > 0 ? selectedOrderIdsForBatch.length : processedPending.length} documentos)`);
    setIsBatchSimulatedDialogOpen(true);
  };

  const handleToggleSelectOrderForBatch = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedOrderIdsForBatch(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPendingForBatch = () => {
    if (selectedOrderIdsForBatch.length === processedPending.length) {
      setSelectedOrderIdsForBatch([]);
    } else {
      setSelectedOrderIdsForBatch(processedPending.map(o => o.id));
    }
  };

  const handleExecuteBatchSimulatedPayment = async () => {
    const targetIds = selectedOrderIdsForBatch.length > 0
      ? selectedOrderIdsForBatch
      : processedPending.map(o => o.id);

    if (targetIds.length === 0) {
      showError('No hay órdenes seleccionadas para procesar.');
      return;
    }

    setIsSubmittingBatch(true);
    const toastId = showLoading(`Procesando ${targetIds.length} pago(s) transitorio(s)...`);

    try {
      const ordersToPay = pendingOrders.filter(o => targetIds.includes(o.id));
      let successCount = 0;

      for (const order of ordersToPay) {
        const currentPaid = order.paid_amount || 0;
        const remaining = Number((order.totalAmount - currentPaid).toFixed(2));
        const tableName = order.type === 'purchase_order' ? 'purchase_orders' : 'service_orders';

        const { error: updateError } = await supabase
          .from(tableName)
          .update({
            paid_amount: order.totalAmount,
            status: 'Paid'
          })
          .eq('id', order.id);

        if (updateError) {
          console.error(`Error actualizando orden ${order.displayId}:`, updateError);
          continue;
        }

        await supabase
          .from('payment_transactions')
          .insert({
            order_id: order.id,
            order_type: order.type,
            amount: remaining > 0 ? remaining : order.totalAmount,
            currency: order.currency,
            exchange_rate: order.exchange_rate,
            converted_amount: remaining > 0 ? remaining : order.totalAmount,
            registered_by: session?.user?.id || null,
            previous_paid: currentPaid,
            new_paid: order.totalAmount,
            notes: batchSimulatedNotes.trim() || '[PAGO TRANSITORIO MASIVO POR SISTEMA - MÓDULO CXP EN DESARROLLO]'
          });

        successCount++;
      }

      showSuccess(`¡Procesadas exitosamente ${successCount} órdenes como Pago Transitorio por Sistema!`);
      queryClient.invalidateQueries({ queryKey: ['creditOrdersDashboardFull'] });
      queryClient.invalidateQueries({ queryKey: ['paymentTransactionsKardex'] });
      setIsBatchSimulatedDialogOpen(false);
      setSelectedOrderIdsForBatch([]);
      setIsBatchSelectionActive(false);
    } catch (err) {
      console.error('Error executing batch simulated payment:', err);
      showError('Ocurrió un error al procesar el lote de pagos simulados.');
    } finally {
      dismissToast(toastId);
      setIsSubmittingBatch(false);
    }
  };

  // Filter and sort core logic
  const processOrders = (list: OrderItem[]) => {
    let result = [...list];

    // 1. Search text filter
    if (searchTerm.trim()) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(
        (order) =>
          order.displayId.toLowerCase().includes(lowerSearch) ||
          (order.suppliers?.name || '').toLowerCase().includes(lowerSearch)
      );
    }

    // 2. Frequent supplier filter
    if (selectedSupplierFilter !== 'all') {
      result = result.filter(
        (order) => order.suppliers?.name === selectedSupplierFilter
      );
    }

    // Date range filter
    if (startDateFilter) {
      result = result.filter((order) => {
        const localDate = getLocalDateString(order.issue_date || order.created_at);
        return localDate >= startDateFilter;
      });
    }
    if (endDateFilter) {
      result = result.filter((order) => {
        const localDate = getLocalDateString(order.issue_date || order.created_at);
        return localDate <= endDateFilter;
      });
    }

    // 3. Sort logic
    result.sort((a, b) => {
      if (sortBy === 'urgency') {
        const getDueDate = (order: OrderItem) => {
          const issueDateObj = new Date(order.issue_date || order.created_at || '');
          const creditDaysVal = order.credit_days || 0;
          return issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000;
        };
        return getDueDate(a) - getDueDate(b);
      }
      if (sortBy === 'number_asc') {
        return (a.sequence_number || 0) - (b.sequence_number || 0);
      }
      if (sortBy === 'number_desc') {
        return (b.sequence_number || 0) - (a.sequence_number || 0);
      }
      if (sortBy === 'value_desc') {
        // Normalize to USD to sort by actual value
        const valA = a.currency === 'VES' ? (a.totalAmount / (a.exchange_rate || 1)) : a.totalAmount;
        const valB = b.currency === 'VES' ? (b.totalAmount / (b.exchange_rate || 1)) : b.totalAmount;
        return valB - valA;
      }
      // Default: date_desc (newest first)
      const dateA = new Date(a.created_at || '').getTime();
      const dateB = new Date(b.created_at || '').getTime();
      return dateB - dateA;
    });

    return result;
  };

  const pendingOrders = useMemo(() => {
    return orders?.filter((o) => o.status !== 'Paid') || [];
  }, [orders]);

  const paidOrders = useMemo(() => {
    return orders?.filter((o) => o.status === 'Paid') || [];
  }, [orders]);

  const processedPrepagoOrders = useMemo(() => {
    let result = [...pendingOrders];

    // 1. Supplier filter
    if (prepagoSupplier !== 'all') {
      result = result.filter(
        (order) => order.suppliers?.name === prepagoSupplier
      );
    }

    // 2. Date range filter (issue date)
    if (prepagoStartDate) {
      result = result.filter((order) => {
        const localDate = getLocalDateString(order.issue_date || order.created_at || '');
        return localDate >= prepagoStartDate;
      });
    }
    if (prepagoEndDate) {
      result = result.filter((order) => {
        const localDate = getLocalDateString(order.issue_date || order.created_at || '');
        return localDate <= prepagoEndDate;
      });
    }

    // 3. Invoice / delivery note number filter (pending development text search)
    if (prepagoSearchFact.trim()) {
      const lower = prepagoSearchFact.toLowerCase();
      // Since invoice field is pending, we can search displayId or observations
      result = result.filter(
        (order) =>
          order.displayId.toLowerCase().includes(lower) ||
          (order.observations || '').toLowerCase().includes(lower)
      );
    }

    // 4. Sort logic
    result.sort((a, b) => {
      if (prepagoSort === 'urgency') {
        const getDueDate = (order: OrderItem) => {
          const issueDateObj = new Date(order.issue_date || order.created_at || '');
          const creditDaysVal = order.credit_days || 0;
          return issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000;
        };
        return getDueDate(a) - getDueDate(b);
      }
      if (prepagoSort === 'amount_desc') {
        // Normalize to USD for accurate sorting by amount
        const valA = a.currency === 'VES' ? (a.totalAmount / (a.exchange_rate || 1)) : a.totalAmount;
        const valB = b.currency === 'VES' ? (b.totalAmount / (b.exchange_rate || 1)) : b.totalAmount;
        return valB - valA;
      }
      if (prepagoSort === 'number_asc') {
        return (a.sequence_number || 0) - (b.sequence_number || 0);
      }
      if (prepagoSort === 'number_desc') {
        return (b.sequence_number || 0) - (a.sequence_number || 0);
      }
      // 'all' or default: sort by sequence number / date asc
      return (a.sequence_number || 0) - (b.sequence_number || 0);
    });

    return result;
  }, [pendingOrders, prepagoSort, prepagoSupplier, prepagoStartDate, prepagoEndDate, prepagoSearchFact]);

  const processedPending = processOrders(pendingOrders);
  const processedPaid = processOrders(paidOrders);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const renderOrderCard = (order: OrderItem) => {
    const issueDateObj = new Date(order.issue_date || '');
    const creditDaysVal = order.credit_days || 0;
    const dueDateVal = issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000;

    // Days calculations
    const daysElapsed = Math.floor((new Date().getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const daysLeft = Math.ceil((dueDateVal - new Date().getTime()) / (1000 * 60 * 60 * 24));

    let urgencyColor = "border-gray-150 bg-white shadow-sm ring-1 ring-gray-100/50";
    let badgeText = "";
    let badgeColor = "bg-gray-100 text-gray-700";

    if (order.status === 'Paid') {
      urgencyColor = "border-green-200 bg-green-50/45 shadow-sm ring-1 ring-green-200/55";
      badgeText = "Pagada";
      badgeColor = "bg-green-100 text-green-700 font-extrabold";
    } else if (daysLeft < 0) {
      urgencyColor = "border-red-200 bg-red-50/45 shadow-sm ring-1 ring-red-200/55";
      badgeText = `Vencido hace ${Math.abs(daysLeft)} días`;
      badgeColor = "bg-red-100 text-red-700 font-extrabold";
    } else if (daysLeft === 0) {
      urgencyColor = "border-amber-200 bg-amber-50/45 shadow-sm ring-1 ring-amber-200/55";
      badgeText = "Vence hoy";
      badgeColor = "bg-amber-100 text-amber-700 font-extrabold";
    } else if (daysLeft <= 3) {
      urgencyColor = "border-orange-200 bg-orange-50/45 shadow-sm ring-1 ring-orange-200/55";
      badgeText = `Vence en ${daysLeft} días`;
      badgeColor = "bg-orange-100 text-orange-700 font-extrabold";
    } else {
      urgencyColor = "border-gray-150 bg-white shadow-sm ring-1 ring-gray-100/50";
      badgeText = `Quedan ${daysLeft} días`;
      badgeColor = "bg-indigo-100 text-indigo-700 font-extrabold";
    }

    const typeLabel = order.type === 'purchase_order' ? 'Compra' : 'Servicio';
    const typeColor = order.type === 'purchase_order'
      ? 'bg-procarni-primary/10 text-procarni-primary border border-procarni-primary/20'
      : 'bg-procarni-blue/10 text-procarni-blue border border-procarni-blue/20';

    // Abono progress calculation
    const paidAmt = order.paid_amount || 0;
    const progressPercent = Math.min(100, Math.max(0, Math.round((paidAmt / order.totalAmount) * 100)));

    const isSelectedForBatch = selectedOrderIdsForBatch.includes(order.id);

    return (
      <Card
        key={order.id}
        className={cn(
          "group relative p-6 border rounded-[1.75rem] transition-all duration-300 hover:shadow-lg flex flex-col justify-between min-h-[300px]",
          urgencyColor,
          isSelectedForBatch && "ring-2 ring-amber-500 bg-amber-50/20"
        )}
      >
        <div>
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-2 min-w-0">
              {isAdmin && order.status !== 'Paid' && (
                <button
                  onClick={(e) => handleToggleSelectOrderForBatch(order.id, e)}
                  className="text-amber-600 hover:text-amber-800 transition-colors p-0.5"
                  title="Seleccionar para pago simulado en lote"
                >
                  {isSelectedForBatch ? (
                    <CheckSquare className="h-5 w-5 text-amber-600 fill-amber-100" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-300 hover:text-amber-500" />
                  )}
                </button>
              )}
              <div className="flex flex-col gap-1.5 min-w-0">
                <span className="font-mono text-sm font-black text-procarni-dark leading-none truncate">{order.displayId}</span>
                <span className={cn("px-2 py-0.5 text-[9px] font-bold rounded-md uppercase tracking-wider text-center w-fit", typeColor)}>
                  {typeLabel}
                </span>
              </div>
            </div>
            <span className={cn("px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0", badgeColor)}>
              {badgeText}
            </span>
          </div>

          <h4 className="font-extrabold text-procarni-blue text-base mb-2 group-hover:text-procarni-primary transition-colors line-clamp-1 truncate min-w-0">
            {order.suppliers?.name || 'Proveedor Desconocido'}
          </h4>

          <div className="space-y-1.5 text-xs text-gray-500 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>Emitido: {new Date(order.issue_date || '').toLocaleDateString('es-VE')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Plazo: {order.credit_days} días crédito</span>
            </div>
            <div className="flex items-center gap-2 text-procarni-dark font-extrabold">
              <DollarSign className="h-3.5 w-3.5 shrink-0" />
              <span>Total: {formatCurrency(order.totalAmount, order.currency)}</span>
            </div>
          </div>

          {/* Abonos Progress Bar */}
          <div className="space-y-1.5 bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex justify-between text-[11px] font-bold text-gray-500">
              <span>Abonado: {formatCurrency(paidAmt, order.currency)}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-gray-200/70 rounded-full h-2 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  order.status === 'Paid' ? "bg-green-500" : "bg-procarni-primary"
                )}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-[10px] text-right text-gray-400 font-medium italic">
              Pendiente: {formatCurrency(order.totalAmount - paidAmt, order.currency)}
            </div>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-gray-100/80 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* View Details Link */}
            <button
              onClick={() => navigate(order.type === 'purchase_order' ? `/purchase-orders/${order.id}` : `/service-orders/${order.id}`)}
              className="flex items-center gap-1 px-2 py-1.5 text-xs font-bold text-procarni-blue hover:text-procarni-primary hover:bg-slate-50 rounded-xl transition-all h-10 shrink-0 justify-center"
            >
              Ver <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {/* Registrar Abono Button */}
              {order.status !== 'Paid' && (
                <Button
                  onClick={(e) => handleOpenAbonoDialog(order, e)}
                  size="sm"
                  variant="outline"
                  className="h-10 text-xs font-extrabold rounded-xl bg-procarni-primary/5 hover:bg-procarni-primary hover:text-white border-procarni-primary/10 hover:border-transparent text-procarni-primary shadow-sm hover:scale-[1.02] transition-all px-2.5"
                >
                  <PlusCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Abonar
                </Button>
              )}

              {/* Admin Simulated Payment Button */}
              {isAdmin && order.status !== 'Paid' && (
                <Button
                  onClick={(e) => handleOpenSimulatedDialog(order, e)}
                  size="sm"
                  variant="outline"
                  title="Marcar como Pago Simulado Transitorio (Solo Admin)"
                  className="h-10 text-xs font-extrabold rounded-xl bg-amber-50 hover:bg-amber-600 hover:text-white border-amber-200 text-amber-800 shadow-sm hover:scale-[1.02] transition-all px-2.5"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Pago Simulado
                </Button>
              )}

              {/* Download PDF button */}
              <PDFDownloadButton
                orderId={order.id}
                fileNameGenerator={() => {
                  const cleanSupplier = (order.suppliers?.name || 'Proveedor')
                    .replace(/[^a-zA-Z0-9]/g, '_')
                    .substring(0, 20);
                  return `${order.displayId}_${cleanSupplier}.pdf`;
                }}
                endpoint={order.type === 'purchase_order' ? 'generate-po-pdf' : 'generate-so-pdf'}
                label="PDF"
                size="sm"
                variant="outline"
                className="h-10 text-xs font-extrabold rounded-xl border-gray-200/85 hover:border-procarni-primary/30 hover:text-procarni-primary shadow-sm hover:scale-[1.02] transition-all px-3"
              />
            </div>
          </div>
        </div>
      </Card>
    );
  };

  if (isError || isErrorKardex) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-white/70 backdrop-blur-xl border border-red-200/50 rounded-[2rem] shadow-2xl shadow-gray-200/50 max-w-lg mx-auto my-12 space-y-5 animate-in fade-in duration-300">
        <div className="p-4 rounded-full bg-red-50 text-procarni-primary">
          <AlertCircle className="h-12 w-12 animate-pulse" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-black text-procarni-blue tracking-tight">Error de Conexión</h3>
          <p className="text-xs text-gray-500 max-w-sm font-medium italic">
            No se pudo establecer conexión con el servidor de base de datos. Por favor, verifique su acceso a internet o de red e intente de nuevo.
          </p>
        </div>
        <Button 
          onClick={() => {
            refetch();
            refetchKardex();
          }}
          className="h-11 px-6 rounded-xl bg-procarni-primary hover:bg-red-950 text-white font-extrabold shadow-md hover:scale-[1.02] active:scale-[0.99] transition-all"
        >
          Reintentar Conexión
        </Button>
      </div>
    );
  }

  if (isLoading || isLoadingKardex) {
    return (
      <div className="space-y-8 p-2 md:p-4 max-w-full animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-slate-200/80 rounded-lg"></div>
            <div className="h-4 w-96 bg-slate-200/80 rounded-lg"></div>
          </div>
          <div className="h-11 w-40 bg-slate-200/80 rounded-2xl"></div>
        </div>

        {/* Supplier Pills Skeleton */}
        <div className="space-y-2.5">
          <div className="h-3 w-32 bg-slate-200/80 rounded-lg"></div>
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-20 bg-slate-200/80 rounded-full"></div>
            <div className="h-9 w-32 bg-slate-200/80 rounded-full"></div>
            <div className="h-9 w-28 bg-slate-200/80 rounded-full"></div>
          </div>
        </div>

        {/* Search & Sort Skeleton */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div className="h-11 w-full sm:max-w-md bg-slate-200/80 rounded-2xl"></div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <div className="h-11 w-24 bg-slate-200/80 rounded-xl"></div>
            <div className="h-11 w-24 bg-slate-200/80 rounded-xl"></div>
            <div className="h-11 w-40 bg-slate-200/80 rounded-xl"></div>
          </div>
        </div>

        {/* Tab skeleton */}
        <div className="h-12 w-full md:w-96 bg-slate-200/80 rounded-2xl"></div>

        {/* Cards Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="border border-gray-100 rounded-[1.75rem] p-6 h-[300px] flex flex-col justify-between bg-white shadow-sm ring-1 ring-gray-100/50">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5 w-1/2">
                    <div className="h-4 bg-slate-200/80 rounded-md w-24"></div>
                    <div className="h-3.5 bg-slate-200/80 rounded-md w-16"></div>
                  </div>
                  <div className="h-5 bg-slate-200/80 rounded-full w-20"></div>
                </div>
                <div className="h-6 bg-slate-200/80 rounded-md w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-200/80 rounded-md w-1/2"></div>
                  <div className="h-3 bg-slate-200/80 rounded-md w-1/3"></div>
                  <div className="h-3 bg-slate-200/80 rounded-md w-2/3"></div>
                </div>
              </div>
              <div className="h-10 bg-slate-200/80 rounded-xl w-full mt-4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 p-2 md:p-4 max-w-full overflow-x-hidden"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-[34px] font-black text-procarni-blue tracking-tighter flex items-center gap-3">
            <CreditCard className="h-7 w-7 md:h-8 md:w-8 text-procarni-primary shrink-0" />
            Control de Vencimientos y Pagos
          </h1>
          <p className="text-[13px] text-gray-500 font-medium italic font-body">Consulta de órdenes a crédito, abonos parciales y descarga de comprobantes.</p>
        </div>
         <Button
          onClick={() => setIsPrepagoDialogOpen(true)}
          className="h-11 px-5 rounded-2xl bg-procarni-primary hover:bg-red-950 text-white font-extrabold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.99] transition-all flex items-center gap-2"
        >
          <FileText className="h-4 w-4" />
          Reporte Prepago
        </Button>
      </div>

      {/* Frequent Suppliers Pills */}
      {frequentSuppliers.length > 0 && (
        <div className="space-y-2.5">
          <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" /> Proveedores Frecuentes:
          </Label>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <Button
              variant={selectedSupplierFilter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedSupplierFilter('all')}
              className={cn(
                "rounded-full text-xs font-bold transition-all px-3 md:px-4 shadow-sm h-9",
                selectedSupplierFilter === 'all'
                  ? "bg-procarni-blue hover:bg-procarni-dark text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
              )}
            >
              Todos
            </Button>
            {frequentSuppliers.map((supplier) => (
              <Button
                key={supplier.name}
                variant={selectedSupplierFilter === supplier.name ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedSupplierFilter(supplier.name)}
                className={cn(
                  "rounded-full text-xs font-bold transition-all px-3 md:px-4 shadow-sm h-9",
                  selectedSupplierFilter === supplier.name
                    ? "bg-procarni-blue hover:bg-procarni-dark text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:bg-slate-50"
                )}
              >
                {supplier.name} ({supplier.count})
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Search and Sorting controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        {/* Search Input Widget */}
        <div className="relative w-full sm:max-w-md bg-white/70 backdrop-blur-xl rounded-2xl ring-1 ring-gray-200/50 shadow-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar por proveedor u orden (OC-...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 border-none focus-visible:ring-2 focus-visible:ring-procarni-primary/20 rounded-2xl bg-transparent text-sm"
          />
        </div>

        {/* Date Filters & Sorting */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
          {/* Start Date filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">Desde:</Label>
            <Input
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
              className="h-11 bg-white border-gray-200 rounded-xl text-xs font-semibold text-gray-600 shadow-sm focus:ring-procarni-primary/20 w-full sm:w-auto"
            />
          </div>

          {/* End Date filter */}
          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">Hasta:</Label>
            <Input
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
              className="h-11 bg-white border-gray-200 rounded-xl text-xs font-semibold text-gray-600 shadow-sm focus:ring-procarni-primary/20 w-full sm:w-auto"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5" /> Ordenar:
            </Label>
            <Select
              value={sortBy}
              onValueChange={(val: SortOption) => setSortBy(val)}
            >
              <SelectTrigger className="w-full sm:w-[160px] h-11 bg-white border-gray-200 rounded-xl text-xs font-extrabold text-gray-600 shadow-sm focus:ring-procarni-primary/20">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-200">
                <SelectItem value="urgency" className="text-xs font-medium">Más urgentes primero</SelectItem>
                <SelectItem value="date_desc" className="text-xs font-medium">Recientes primero</SelectItem>
                <SelectItem value="number_asc" className="text-xs font-medium">Número (Asc)</SelectItem>
                <SelectItem value="number_desc" className="text-xs font-medium">Número (Desc)</SelectItem>
                <SelectItem value="value_desc" className="text-xs font-medium">Mayor valor</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList className="bg-gray-100/80 p-1 rounded-2xl h-auto flex flex-col md:flex-row border border-gray-200/30 gap-1 overflow-hidden">
          <TabsTrigger value="pending" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-extrabold tracking-tight data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm w-full md:w-auto justify-start md:justify-center">
            <Clock className="h-4 w-4 mr-2 text-amber-500 shrink-0" />
            Pendientes de Pago ({processedPending.length})
          </TabsTrigger>
          <TabsTrigger value="paid" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-extrabold tracking-tight data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm w-full md:w-auto justify-start md:justify-center">
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500 shrink-0" />
            Pagadas recientemente ({processedPaid.length})
          </TabsTrigger>
          <TabsTrigger value="kardex" className="rounded-xl px-4 py-2.5 text-xs md:text-sm font-extrabold tracking-tight data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm w-full md:w-auto justify-start md:justify-center">
            <History className="h-4 w-4 mr-2 text-indigo-500 shrink-0" />
            Historial de Pagos ({filteredKardex.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Pending */}
        <TabsContent value="pending" className="mt-0 outline-none">
          {isAdmin && processedPending.length > 0 && (
            <div className="mb-6 p-4 md:p-5 rounded-3xl bg-amber-50/70 border border-amber-200/80 backdrop-blur-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-800 shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                    Administración: Solución Transitoria CXP
                  </h4>
                  <p className="text-xs text-amber-800 font-medium">
                    Mientras el módulo de CXP finaliza su desarrollo, puedes regularizar la acumulación de cuentas pendientes realizando un pago simulado por sistema con etiqueta de trazabilidad.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0 justify-end">
                <Button
                  onClick={handleSelectAllPendingForBatch}
                  size="sm"
                  variant="outline"
                  className="h-10 text-xs font-extrabold rounded-xl border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
                >
                  {selectedOrderIdsForBatch.length === processedPending.length ? (
                    <>
                      <Square className="h-3.5 w-3.5 mr-1" /> Deseleccionar Todas
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-3.5 w-3.5 mr-1" /> Seleccionar Todas ({processedPending.length})
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleOpenBatchSimulatedDialog}
                  size="sm"
                  className="h-10 text-xs font-extrabold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-md hover:scale-[1.02] transition-all px-4"
                >
                  <CheckCheck className="h-4 w-4 mr-1.5" />
                  Liquidación Masiva ({selectedOrderIdsForBatch.length > 0 ? selectedOrderIdsForBatch.length : processedPending.length})
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center items-center h-48 text-sm text-gray-500">
              <span className="animate-pulse font-medium">Cargando vencimientos pendientes...</span>
            </div>
          ) : processedPending.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-gray-200 bg-white/50 rounded-[2rem] shadow-none flex flex-col items-center justify-center">
              <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm font-bold">No se encontraron órdenes de pago pendientes.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {processedPending.map(renderOrderCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Paid */}
        <TabsContent value="paid" className="mt-0 outline-none">
          {isLoading ? (
            <div className="flex justify-center items-center h-48 text-sm text-gray-500">
              <span className="animate-pulse font-medium">Cargando historial de pagos...</span>
            </div>
          ) : processedPaid.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-gray-200 bg-white/50 rounded-[2rem] shadow-none flex flex-col items-center justify-center">
              <AlertCircle className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm font-bold">No se encontraron órdenes pagadas recientemente.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {processedPaid.map(renderOrderCard)}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Kardex Ledger */}
        <TabsContent value="kardex" className="mt-0 outline-none space-y-4">
          <div className="flex justify-between items-center bg-white/50 p-4 rounded-2xl border border-gray-100">
            <div>
              <h3 className="text-sm font-extrabold text-procarni-blue">Historial de Transacciones de Pago</h3>
              <p className="text-xs text-gray-500 font-medium font-mono">Libro auxiliar de abonos registrados en el sistema.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExportKardexXLSX}
                variant="outline"
                size="sm"
                className="h-10 text-xs font-extrabold rounded-xl border-gray-200 bg-white hover:bg-slate-50 shadow-sm text-procarni-blue hover:text-procarni-primary"
              >
                Exportar Excel
              </Button>
              <Button
                onClick={handleExportKardexPDF}
                variant="outline"
                size="sm"
                className="h-10 text-xs font-extrabold rounded-xl border-gray-200 bg-white hover:bg-slate-50 shadow-sm text-procarni-blue hover:text-procarni-primary"
              >
                Exportar PDF
              </Button>
            </div>
          </div>
          {isLoadingKardex || isLoading ? (
            <div className="flex justify-center items-center h-48 text-sm text-gray-500">
              <span className="animate-pulse font-medium">Cargando historial de pagos...</span>
            </div>
          ) : filteredKardex.length === 0 ? (
            <Card className="p-12 text-center border-dashed border-gray-200 bg-white/50 rounded-[2rem] shadow-none flex flex-col items-center justify-center">
              <History className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm font-bold">No hay transacciones registradas con los filtros aplicados.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Stacked Cards for Mobile View */}
              <div className="space-y-4 md:hidden">
                {filteredKardex.map((tx) => (
                  <Card
                    key={tx.id}
                    className="p-5 rounded-2xl border border-gray-200/60 shadow-sm bg-white/80 backdrop-blur-sm cursor-pointer hover:shadow-md transition-all active:scale-[0.99]"
                    onClick={() => navigate(tx.order_type === 'purchase_order' ? `/purchase-orders/${tx.order_id}` : `/service-orders/${tx.order_id}`)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono text-xs font-black text-procarni-dark flex items-center gap-1 truncate min-w-0">
                        {tx.displayId}
                        <ArrowUpRight className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium shrink-0">
                        {new Date(tx.payment_date).toLocaleDateString('es-VE')}
                      </span>
                    </div>
                    <h5 className="font-extrabold text-procarni-blue text-sm mb-3 truncate min-w-0">{tx.supplierName}</h5>
                    <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 mb-3">
                      <div className="min-w-0">
                        <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Abonado</span>
                        <span className="text-emerald-600 font-black text-sm truncate block">{formatCurrency(tx.amount, tx.currency)}</span>
                      </div>
                      <div className="min-w-0">
                        <span className="text-gray-400 block text-[9px] uppercase font-bold tracking-wider">Equivalente</span>
                        <span className="text-gray-700 font-extrabold text-sm truncate block">{formatCurrency(tx.converted_amount, tx.orderCurrency)}</span>
                      </div>
                    </div>
                    {tx.exchange_rate && (
                      <div className="text-[10px] text-gray-400 mb-2 italic">
                        Tasa: @ {tx.exchange_rate.toFixed(4)}
                      </div>
                    )}
                    <div className="pt-2 border-t border-dashed border-gray-100 flex justify-between items-center text-[10px] text-gray-500 font-bold">
                      <span>Progreso: {Math.round((tx.new_paid / tx.totalAmount) * 100)}%</span>
                      <span className="text-gray-400 font-medium font-mono">
                        {formatCurrency(tx.new_paid, tx.orderCurrency)} / {formatCurrency(tx.totalAmount, tx.orderCurrency)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Table view for Desktop / Tablet View */}
              <div className="hidden md:block overflow-hidden">
                <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-6 rounded-[2rem]">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Fecha</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Documento</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Proveedor</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Monto Transacción</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Conversión</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Monto Acreditado</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Observaciones / Notas</TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 text-right">Progreso de Pago</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredKardex.map((tx) => (
                          <TableRow
                            key={tx.id}
                            className="hover:bg-blue-50/20 py-4 transition-colors cursor-pointer group/row"
                            onClick={() => navigate(tx.order_type === 'purchase_order' ? `/purchase-orders/${tx.order_id}` : `/service-orders/${tx.order_id}`)}
                          >
                            <TableCell className="text-xs text-gray-500 font-medium">
                              {new Date(tx.payment_date).toLocaleString('es-VE')}
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-procarni-dark">
                              <span className="flex items-center gap-1 truncate min-w-0">
                                {tx.displayId}
                                <ArrowUpRight className="h-3 w-3 text-indigo-500 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                              </span>
                            </TableCell>
                            <TableCell className="text-xs font-extrabold text-procarni-blue truncate min-w-0 max-w-[200px]">
                              {tx.supplierName}
                            </TableCell>
                            <TableCell className="text-xs font-extrabold text-emerald-600">
                              {formatCurrency(tx.amount, tx.currency)}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {tx.exchange_rate ? `@ ${tx.exchange_rate.toFixed(4)}` : 'N/A'}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-gray-700">
                              {formatCurrency(tx.converted_amount, tx.orderCurrency)}
                            </TableCell>
                            <TableCell className="text-xs text-gray-600 max-w-[250px] truncate">
                              {tx.notes && (tx.notes.includes('PAGO TRANSITORIO') || tx.notes.includes('PAGO SIMULADO')) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-extrabold rounded-md bg-amber-100 text-amber-900 border border-amber-200 uppercase tracking-wider truncate">
                                  <ShieldCheck className="h-3 w-3 shrink-0" />
                                  {tx.notes}
                                </span>
                              ) : (
                                <span>{tx.notes || '-'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end gap-1">
                                <span className="text-[11px] font-bold text-gray-600">
                                  {Math.round((tx.new_paid / tx.totalAmount) * 100)}%
                                </span>
                                <span className="text-[9px] text-gray-400 font-medium font-mono">
                                  ({formatCurrency(tx.new_paid, tx.orderCurrency)} / {formatCurrency(tx.totalAmount, tx.orderCurrency)})
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Registrar Abono Dialog */}
      <Dialog open={isAbonoDialogOpen} onOpenChange={setIsAbonoDialogOpen}>
        <DialogContent className="w-[95%] max-w-[425px] sm:w-full rounded-[2rem] p-6 border-none bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-procarni-blue flex items-center gap-2.5">
              <TrendingUp className="h-5 w-5 text-procarni-primary shrink-0" />
              Registrar Abono / Pago Parcial
            </DialogTitle>
          </DialogHeader>

          {selectedOrderForAbono && (
            <div className="space-y-5 pt-3">
              {/* Summary Cards */}
              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 text-xs border border-slate-100">
                <div className="flex justify-between font-mono font-bold text-procarni-dark">
                  <span>Orden:</span>
                  <span className="truncate max-w-[150px]">{selectedOrderForAbono.displayId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Proveedor:</span>
                  <span className="font-extrabold text-procarni-blue truncate max-w-[200px]">{selectedOrderForAbono.suppliers?.name || 'Desconocido'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-semibold">Monto Total:</span>
                  <span className="font-extrabold">{formatCurrency(selectedOrderForAbono.totalAmount, selectedOrderForAbono.currency)}</span>
                </div>
                <div className="flex justify-between text-green-700 font-bold bg-green-50/50 p-1.5 rounded-lg">
                  <span>Abonado actualmente:</span>
                  <span>{formatCurrency(selectedOrderForAbono.paid_amount || 0, selectedOrderForAbono.currency)}</span>
                </div>
                <div className="flex flex-col text-procarni-primary font-bold bg-red-50/50 p-1.5 rounded-lg">
                  <div className="flex justify-between">
                    <span>Saldo Pendiente:</span>
                    <span>{formatCurrency(selectedOrderForAbono.totalAmount - (selectedOrderForAbono.paid_amount || 0), selectedOrderForAbono.currency)}</span>
                  </div>
                  {selectedOrderForAbono.currency !== 'VES' && orderCurrencyDailyRate && (
                    <div className="flex justify-between text-[10px] text-red-900/80 font-bold border-t border-red-200/50 mt-1 pt-1 italic">
                      <span>Ref. en VES (Tasa hoy):</span>
                      <span>{formatCurrency((selectedOrderForAbono.totalAmount - (selectedOrderForAbono.paid_amount || 0)) * orderCurrencyDailyRate, 'VES')}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Input */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">Moneda de Pago</Label>
                    <Select
                      value={abonoCurrency}
                      onValueChange={(val: 'USD' | 'VES' | 'EUR') => setAbonoCurrency(val)}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-gray-200">
                        <SelectValue placeholder="Moneda" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="USD">Dólares (USD)</SelectItem>
                        <SelectItem value="VES">Bolívares (VES)</SelectItem>
                        <SelectItem value="EUR">Euros (EUR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">Monto del Abono ({abonoCurrency})</Label>
                    <Input
                      type="number"
                      value={abonoAmount}
                      onChange={(e) => setAbonoAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-11 rounded-xl border-gray-200"
                      min="0.01"
                      step="0.01"
                    />
                  </div>
                </div>

                {/* Exchange Rate Conversion Section */}
                {selectedOrderForAbono.currency !== abonoCurrency && (
                  <div className="space-y-3 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/50 text-xs">
                    <div className="flex justify-between items-center gap-2">
                      <Label className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-700">Tasa de Cambio</Label>
                      <Input
                        type="number"
                        value={abonoExchangeRate}
                        onChange={(e) => setAbonoExchangeRate(e.target.value)}
                        placeholder="Tasa de cambio"
                        className="h-9 w-28 text-xs text-right rounded-lg bg-white border-gray-200"
                        step="0.0001"
                      />
                    </div>
                    {convertedAbonoPreview && (
                      <div className="flex justify-between items-center pt-2 border-t border-indigo-100/30 text-indigo-950 font-bold">
                        <span>Equivalente en moneda de la orden:</span>
                        <span>{convertedAbonoPreview}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-6 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAbonoDialogOpen(false)}
              className="rounded-xl border-gray-200 font-bold h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleRegisterAbono}
              disabled={isSubmittingAbono}
              className="rounded-xl bg-procarni-primary hover:bg-red-950 text-white font-extrabold shadow-md hover:scale-[1.01] h-11 w-full sm:w-auto"
            >
              {isSubmittingAbono ? 'Registrando...' : 'Registrar Abono'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Simulated Payment Dialog (Individual) */}
      <Dialog open={isSimulatedDialogOpen} onOpenChange={setIsSimulatedDialogOpen}>
        <DialogContent className="w-[95%] max-w-[480px] sm:w-full rounded-[2rem] p-6 border-none bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-amber-900 flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-amber-600 shrink-0" />
              Pago Simulado Transitorio (Solo Admin)
            </DialogTitle>
          </DialogHeader>

          {selectedOrderForSimulated && (
            <div className="space-y-4 py-3">
              <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/60 space-y-2 text-xs">
                <div className="font-extrabold text-amber-950 flex justify-between">
                  <span>Documento:</span>
                  <span className="font-mono text-sm">{selectedOrderForSimulated.displayId}</span>
                </div>
                <div className="flex justify-between text-amber-900 font-medium">
                  <span>Proveedor:</span>
                  <span className="font-bold">{selectedOrderForSimulated.suppliers?.name || 'Desconocido'}</span>
                </div>
                <div className="flex justify-between text-amber-900 font-medium">
                  <span>Monto Total:</span>
                  <span className="font-bold font-mono">{formatCurrency(selectedOrderForSimulated.totalAmount, selectedOrderForSimulated.currency)}</span>
                </div>
                <div className="flex justify-between text-amber-900 font-medium">
                  <span>Saldo Pendiente:</span>
                  <span className="font-extrabold font-mono text-procarni-primary">
                    {formatCurrency(selectedOrderForSimulated.totalAmount - (selectedOrderForSimulated.paid_amount || 0), selectedOrderForSimulated.currency)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">
                  Etiqueta / Observación para el Kardex
                </Label>
                <Input
                  type="text"
                  value={simulatedNotes}
                  onChange={(e) => setSimulatedNotes(e.target.value)}
                  placeholder="[PAGO TRANSITORIO POR SISTEMA - MÓDULO CXP EN DESARROLLO]"
                  className="h-11 rounded-xl border-gray-200 text-xs font-semibold"
                />
                <p className="text-[11px] text-gray-400 font-medium italic">
                  Esta nota se registrará en el historial de transacciones para garantizar la trazabilidad cuando el módulo CXP esté completado.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsSimulatedDialogOpen(false)}
              className="rounded-xl border-gray-200 font-bold h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExecuteSimulatedPayment}
              disabled={isSubmittingSimulated}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow-md hover:scale-[1.01] h-11 w-full sm:w-auto"
            >
              {isSubmittingSimulated ? 'Procesando...' : 'Confirmar Pago Simulado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Batch Simulated Payment Dialog */}
      <Dialog open={isBatchSimulatedDialogOpen} onOpenChange={setIsBatchSimulatedDialogOpen}>
        <DialogContent className="w-[95%] max-w-[520px] sm:w-full rounded-[2rem] p-6 border-none bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-amber-900 flex items-center gap-2.5">
              <CheckCheck className="h-6 w-6 text-amber-600 shrink-0" />
              Liquidación Masiva de Cuentas (Solo Admin)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/60 space-y-2 text-xs">
              <p className="font-bold text-amber-950">
                Vas a procesar como Pago Simulado Transitorio un lote de {selectedOrderIdsForBatch.length > 0 ? selectedOrderIdsForBatch.length : processedPending.length} órden(es) pendiente(s).
              </p>
              <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
                Todas las órdenes seleccionadas cambiarán a estado <strong className="font-extrabold">Pagada</strong> (saldo 0) y sus movimientos quedarán archivados en el Kardex con la etiqueta de pago transitorio.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">
                Etiqueta / Observación Masiva para el Kardex
              </Label>
              <Input
                type="text"
                value={batchSimulatedNotes}
                onChange={(e) => setBatchSimulatedNotes(e.target.value)}
                placeholder="[PAGO TRANSITORIO MASIVO POR SISTEMA - MÓDULO CXP EN DESARROLLO]"
                className="h-11 rounded-xl border-gray-200 text-xs font-semibold"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setIsBatchSimulatedDialogOpen(false)}
              className="rounded-xl border-gray-200 font-bold h-11 w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleExecuteBatchSimulatedPayment}
              disabled={isSubmittingBatch}
              className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold shadow-md hover:scale-[1.01] h-11 w-full sm:w-auto"
            >
              {isSubmittingBatch ? 'Procesando Lote...' : `Ejecutar Liquidación Masiva (${selectedOrderIdsForBatch.length > 0 ? selectedOrderIdsForBatch.length : processedPending.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reporte Prepago Dialog */}
      <Dialog open={isPrepagoDialogOpen} onOpenChange={setIsPrepagoDialogOpen}>
        <DialogContent className="max-w-7xl w-[95vw] h-[90vh] flex flex-col rounded-[2rem] p-6 border-none bg-white shadow-2xl overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-4 shrink-0">
            <DialogTitle className="text-2xl font-black text-procarni-blue flex items-center gap-2.5">
              <FileSpreadsheet className="h-6 w-6 text-procarni-primary" />
              Reporte de Cuentas por Pagar
            </DialogTitle>
          </DialogHeader>

          {/* Modal Filter and Action Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 py-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/60 mt-4 shrink-0">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Filtrar por Criterio</Label>
              <Select value={prepagoSort} onValueChange={setPrepagoSort}>
                <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-gray-200">
                  <SelectItem value="all" className="text-xs font-medium">Todas</SelectItem>
                  <SelectItem value="urgency" className="text-xs font-medium">Más urgentes</SelectItem>
                  <SelectItem value="amount_desc" className="text-xs font-medium">Montos más altos</SelectItem>
                  <SelectItem value="number_asc" className="text-xs font-medium">Número Orden (Asc)</SelectItem>
                  <SelectItem value="number_desc" className="text-xs font-medium">Número Orden (Desc)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Proveedor</Label>
              <Select value={prepagoSupplier} onValueChange={setPrepagoSupplier}>
                <SelectTrigger className="h-10 bg-white border-gray-200 rounded-xl text-xs font-bold text-gray-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-gray-200">
                  <SelectItem value="all" className="text-xs font-medium">Todos</SelectItem>
                  {Array.from(new Set(pendingOrders.map(o => o.suppliers?.name).filter(Boolean))).map(name => (
                    <SelectItem key={name} value={name || ''} className="text-xs font-medium">{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Desde (Emisión)</Label>
              <Input
                type="date"
                value={prepagoStartDate}
                onChange={(e) => setPrepagoStartDate(e.target.value)}
                className="h-10 bg-white border-gray-200 rounded-xl text-xs font-semibold text-gray-600"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400">Hasta (Emisión)</Label>
              <Input
                type="date"
                value={prepagoEndDate}
                onChange={(e) => setPrepagoEndDate(e.target.value)}
                className="h-10 bg-white border-gray-200 rounded-xl text-xs font-semibold text-gray-600"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wider font-extrabold text-gray-400 flex items-center gap-1">
                Factura / Entrega <span className="text-[8px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-normal lowercase tracking-normal">pendiente</span>
              </Label>
              <Input
                type="text"
                placeholder="Nro Factura / Nota..."
                value={prepagoSearchFact}
                onChange={(e) => setPrepagoSearchFact(e.target.value)}
                className="h-10 bg-white border-gray-200 rounded-xl text-xs font-semibold text-gray-600 focus:ring-procarni-primary/20"
              />
            </div>

            <div className="flex items-end gap-2">
              <Button
                onClick={handleExportPrepagoXLSX}
                variant="outline"
                size="sm"
                className="h-10 flex-1 text-[11px] font-extrabold rounded-xl border-gray-200 bg-white hover:bg-slate-50 shadow-sm text-procarni-blue hover:text-procarni-primary"
              >
                Excel
              </Button>
              <Button
                onClick={handleExportPrepagoPDF}
                variant="outline"
                size="sm"
                className="h-10 flex-1 text-[11px] font-extrabold rounded-xl border-gray-200 bg-white hover:bg-slate-50 shadow-sm text-procarni-blue hover:text-procarni-primary"
              >
                PDF
              </Button>
            </div>
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-y-auto min-h-0 border border-gray-150 rounded-2xl my-4 bg-white">
            {processedPrepagoOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
                <AlertCircle className="h-12 w-12 text-gray-200 mb-3" />
                <p className="font-bold text-sm">No se encontraron cuentas pendientes que coincidan con los filtros.</p>
              </div>
            ) : (
              <Table className="relative">
                <TableHeader className="sticky top-0 bg-slate-50 z-10 border-b">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Fecha</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Fact Nº</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Descripción / Orden / Proveedor</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 text-right">Base ($)</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 text-right">75% IVA ($)</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 text-right">25% IVA ($)</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 text-right">Total $</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Fecha Tope</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processedPrepagoOrders.map(order => {
                    const issueDateObj = new Date(order.issue_date || order.created_at || '');
                    const creditDaysVal = order.credit_days || 0;
                    const dueDateVal = new Date(issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000);

                    const rate = (order.currency === 'VES' && order.exchange_rate) ? order.exchange_rate : 1;
                    const baseUSD = order.baseImponible / rate;
                    const ivaUSD = order.montoIVA / rate;
                    const totalUSD = order.totalAmount / rate;

                    return (
                      <TableRow key={order.id} className="hover:bg-blue-50/10 transition-colors">
                        <TableCell className="text-xs text-gray-500 font-medium">
                          {issueDateObj.toLocaleDateString('es-VE')}
                        </TableCell>
                        <TableCell className="text-xs text-gray-400 font-medium font-mono">
                          -
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-extrabold text-procarni-blue">{order.suppliers?.name || 'Desconocido'}</div>
                          <div className="flex gap-2 text-[10px] text-gray-400 font-mono mt-0.5">
                            <span>{order.displayId}</span>
                            {order.observations && <span>• {order.observations}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium text-gray-600">
                          ${baseUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium text-gray-600">
                          ${(ivaUSD * 0.75).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-medium text-gray-600">
                          ${(ivaUSD * 0.25).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs text-right font-mono font-extrabold text-procarni-blue">
                          ${totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs font-bold text-procarni-primary">
                          {dueDateVal.toLocaleDateString('es-VE')}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Sums and Currency Summary (Bottom Bar) */}
          <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-6 items-center shrink-0">
            {/* Column Sums */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-wrap gap-x-8 gap-y-2 text-xs font-black text-procarni-blue">
              <div className="uppercase text-[9px] tracking-wider text-gray-400 w-full mb-1">Total de cada columna (USD):</div>
              <div>Base: <span className="font-mono text-procarni-primary">${
                processedPrepagoOrders.reduce((sum, o) => sum + (o.baseImponible / ((o.currency === 'VES' && o.exchange_rate) ? o.exchange_rate : 1)), 0)
                .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              }</span></div>
              <div>75% IVA: <span className="font-mono text-procarni-primary">${
                processedPrepagoOrders.reduce((sum, o) => sum + ((o.montoIVA / ((o.currency === 'VES' && o.exchange_rate) ? o.exchange_rate : 1)) * 0.75), 0)
                .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              }</span></div>
              <div>25% IVA: <span className="font-mono text-procarni-primary">${
                processedPrepagoOrders.reduce((sum, o) => sum + ((o.montoIVA / ((o.currency === 'VES' && o.exchange_rate) ? o.exchange_rate : 1)) * 0.25), 0)
                .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              }</span></div>
              <div>Total: <span className="font-mono text-emerald-600">${
                processedPrepagoOrders.reduce((sum, o) => sum + (o.totalAmount / ((o.currency === 'VES' && o.exchange_rate) ? o.exchange_rate : 1)), 0)
                .toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              }</span></div>
            </div>

            {/* Original Currencies Summary */}
            <div className="flex justify-end gap-3 text-xs">
              {['USD', 'VES', 'EUR'].map(curr => {
                const pendingSum = processedPrepagoOrders
                  .filter(o => o.currency === curr)
                  .reduce((sum, o) => sum + (o.totalAmount - (o.paid_amount || 0)), 0);

                if (pendingSum <= 0) return null;
                return (
                  <div key={curr} className="bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2 text-right">
                    <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-wider">Saldo Pendiente {curr}</span>
                    <span className="font-mono font-bold text-procarni-blue">{formatCurrency(pendingSum, curr)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="mt-4 pt-2 border-t shrink-0">
            <Button
              onClick={() => setIsPrepagoDialogOpen(false)}
              className="rounded-xl border-gray-200 font-bold h-11 w-full sm:w-auto"
            >
              Cerrar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </m.div>
  );
};

export default PaymentRemindersDashboard;
