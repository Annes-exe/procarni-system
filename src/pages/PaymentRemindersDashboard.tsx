import React, { useState, useMemo } from 'react';
import { m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  ArrowUpRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import PDFDownloadButton from '@/components/PDFDownloadButton';
import { cn } from '@/lib/utils';
import { currencyService } from '@/services/currencyService';
import { calculateTotals } from '@/utils/calculations';
import { showError, showSuccess, showLoading, dismissToast, showWarning } from '@/utils/toast';
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
  suppliers: { name: string } | null;
  type: 'purchase_order' | 'service_order';
  displayId: string;
  totalAmount: number;
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

type SortOption = 'number_asc' | 'number_desc' | 'value_desc' | 'date_desc';

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
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sorting and filtering states
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  
  // Abono dialog states
  const [isAbonoDialogOpen, setIsAbonoDialogOpen] = useState(false);
  const [selectedOrderForAbono, setSelectedOrderForAbono] = useState<OrderItem | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoCurrency, setAbonoCurrency] = useState<'USD' | 'VES' | 'EUR'>('VES');
  const [abonoExchangeRate, setAbonoExchangeRate] = useState('');
  const [orderCurrencyDailyRate, setOrderCurrencyDailyRate] = useState<number | null>(null);
  const [isSubmittingAbono, setIsSubmittingAbono] = useState(false);

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
  const { data: orders, isLoading } = useQuery<OrderItem[]>({
    queryKey: ['creditOrdersDashboardFull'],
    queryFn: async () => {
      const [posResponse, sosResponse] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, currency, exchange_rate, paid_amount, suppliers(name), purchase_order_items(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage)')
          .eq('payment_terms', 'Crédito')
          .in('status', ['Credit', 'ToPay', 'Paid']),
        supabase
          .from('service_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, currency, exchange_rate, paid_amount, suppliers(name), service_order_items(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage), service_order_materials(quantity, unit_price, tax_rate, is_exempt, sales_percentage, discount_percentage)'),
      ]);

      if (posResponse.error) console.error('Error fetching POs:', posResponse.error);
      if (sosResponse.error) console.error('Error fetching SOs:', sosResponse.error);

      const pos = (posResponse.data || []).map((po: any) => {
        const year = po.created_at ? new Date(po.created_at).getFullYear() : new Date().getFullYear();
        const month = po.created_at ? String(new Date(po.created_at).getMonth() + 1).padStart(2, '0') : '01';
        const totals = calculateTotals(po.purchase_order_items || []);
        return {
          ...po,
          totalAmount: totals.total,
          type: 'purchase_order' as const,
          displayId: `OC-${year}-${month}-${String(po.sequence_number).padStart(3, '0')}`,
        };
      });

      // Service Orders credit payment terms check
      const sos = (sosResponse.data || [])
        .filter((so: any) => so.payment_terms === 'Crédito' && ['Credit', 'ToPay', 'Paid'].includes(so.status))
        .map((so: any) => {
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
            type: 'service_order' as const,
            displayId: `OS-${year}-${month}-${String(so.sequence_number).padStart(3, '0')}`,
          };
        });

      return [...pos, ...sos] as OrderItem[];
    },
  });

  // Fetch Kardex Payment Transactions
  const { data: rawTransactions, isLoading: isLoadingKardex } = useQuery<PaymentTransaction[]>({
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

  // Export History to PDF (Print-friendly layout styled like Quote Comparisons)
  const handleExportKardexPDF = () => {
    if (filteredKardex.length === 0) {
      showError('No hay datos para exportar.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showError('No se pudo abrir la ventana de impresión. Verifique el bloqueo de popups.');
      return;
    }

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

    const rowsHtml = filteredKardex.map(tx => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
        <td style="padding: 10px 12px; text-align: left; color: #475569;">${new Date(tx.payment_date).toLocaleString('es-VE')}</td>
        <td style="padding: 10px 12px; text-align: left; font-family: monospace; font-weight: bold; color: #0f172a;">${tx.displayId}</td>
        <td style="padding: 10px 12px; text-align: left; font-weight: bold; color: #1e293b;">${tx.supplierName}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #0e5708;">${formatCurrency(tx.amount, tx.currency)}</td>
        <td style="padding: 10px 12px; text-align: right; color: #64748b;">${tx.exchange_rate ? `@ ${tx.exchange_rate.toFixed(4)}` : 'N/A'}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: #1B294A;">${formatCurrency(tx.converted_amount, tx.orderCurrency)}</td>
        <td style="padding: 10px 12px; text-align: left; color: #64748b; font-style: italic;">${tx.notes || ''}</td>
      </tr>
    `).join('');

    const totalVES = filteredKardex
      .filter(tx => tx.currency === 'VES')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalUSD = filteredKardex
      .filter(tx => tx.currency === 'USD')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalEUR = filteredKardex
      .filter(tx => tx.currency === 'EUR')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalAcreditadoUSD = filteredKardex
      .filter(tx => tx.orderCurrency === 'USD')
      .reduce((sum, tx) => sum + tx.converted_amount, 0);

    const totalAcreditadoEUR = filteredKardex
      .filter(tx => tx.orderCurrency === 'EUR')
      .reduce((sum, tx) => sum + tx.converted_amount, 0);

    const totalAcreditadoVES = filteredKardex
      .filter(tx => tx.orderCurrency === 'VES')
      .reduce((sum, tx) => sum + tx.converted_amount, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>Reporte de Pagos - Procarni</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 40px;
              background-color: #ffffff;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
            }
            .logo-section {
              text-align: left;
            }
            .company-name {
              font-size: 26px;
              font-weight: 900;
              color: #1B294A;
              letter-spacing: -0.8px;
            }
            .company-tagline {
              font-size: 10px;
              color: #880a0a;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin-top: 2px;
            }
            .report-title {
              font-size: 18px;
              font-weight: 800;
              color: #0f172a;
              text-align: right;
              text-transform: uppercase;
              letter-spacing: -0.5px;
            }
            .report-metadata {
              font-size: 11px;
              color: #64748b;
              text-align: right;
              margin-top: 5px;
            }
            .filters-box {
              background-color: #f8fafc;
              border: 1px solid #f1f5f9;
              border-radius: 16px;
              padding: 12px 20px;
              margin-bottom: 30px;
              font-size: 11px;
              color: #475569;
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 12px;
            }
            .data-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 35px;
            }
            .data-table th {
              background-color: #f8fafc;
              color: #475569;
              font-size: 9px;
              font-weight: bold;
              text-transform: uppercase;
              letter-spacing: 1px;
              padding: 12px;
              border-bottom: 2px solid #cbd5e1;
            }
            .totals-section {
              display: flex;
              justify-content: flex-end;
              margin-top: 20px;
              margin-bottom: 50px;
            }
            .totals-table {
              border-collapse: collapse;
              min-width: 320px;
              background-color: #f8fafc;
              border-radius: 16px;
              border: 1px solid #f1f5f9;
            }
            .totals-table td {
              padding: 10px 16px;
              font-size: 12px;
            }
            .totals-label {
              color: #64748b;
              text-align: left;
              font-weight: 500;
            }
            .totals-value {
              font-weight: bold;
              text-align: right;
              color: #0f172a;
            }
            .footer-notes {
              margin-top: 80px;
              font-size: 9px;
              color: #94a3b8;
              text-align: center;
              border-top: 1px solid #f1f5f9;
              padding-top: 20px;
            }
            @media print {
              body {
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <table class="header-table">
            <tr>
              <td class="logo-section">
                <div class="company-name">PROCARNI</div>
                <div class="company-tagline">System</div>
              </td>
              <td>
                <div class="report-title">Historial de Transacciones de Pago</div>
                <div class="report-metadata">Fecha Emisión: ${dateStr}</div>
              </td>
            </tr>
          </table>

          <div class="filters-box">
            <div><strong>${rangeStr}</strong></div>
            <div><strong>${supplierStr}</strong></div>
            ${searchStr ? `<div><strong>${searchStr}</strong></div>` : ''}
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th style="text-align: left;">Fecha/Hora</th>
                <th style="text-align: left;">Documento</th>
                <th style="text-align: left;">Proveedor</th>
                <th style="text-align: right;">Monto Aportado</th>
                <th style="text-align: right;">Tasa de Cambio</th>
                <th style="text-align: right;">Equivalente Acreditado</th>
                <th style="text-align: left;">Notas</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="totals-section">
            <table class="totals-table">
              <tr>
                <td colspan="2" style="font-size: 10px; font-weight: bold; color: #475569; text-transform: uppercase; padding: 12px 16px 2px 16px;">Total Pagado por Moneda:</td>
              </tr>
              ${totalVES > 0 ? `
              <tr>
                <td class="totals-label">Total VES:</td>
                <td class="totals-value" style="color: #0e5708; font-family: monospace;">Bs. ${totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
              ${totalUSD > 0 ? `
              <tr>
                <td class="totals-label">Total USD:</td>
                <td class="totals-value" style="color: #0e5708; font-family: monospace;">$ ${totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
              ${totalEUR > 0 ? `
              <tr>
                <td class="totals-label">Total EUR:</td>
                <td class="totals-value" style="color: #0e5708; font-family: monospace;">€ ${totalEUR.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
              <tr style="border-top: 1px dashed #cbd5e1;">
                <td colspan="2" style="font-size: 10px; font-weight: bold; color: #1B294A; text-transform: uppercase; padding: 12px 16px 2px 16px;">Total Acreditado a Órdenes:</td>
              </tr>
              ${totalAcreditadoVES > 0 ? `
              <tr>
                <td class="totals-label" style="font-weight: bold; color: #1B294A;">Acreditado VES:</td>
                <td class="totals-value" style="font-size: 13px; color: #1B294A; font-family: monospace;">Bs. ${totalAcreditadoVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
              ${totalAcreditadoUSD > 0 ? `
              <tr>
                <td class="totals-label" style="font-weight: bold; color: #1B294A;">Acreditado USD:</td>
                <td class="totals-value" style="font-size: 13px; color: #1B294A; font-family: monospace;">$ ${totalAcreditadoUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
              ${totalAcreditadoEUR > 0 ? `
              <tr>
                <td class="totals-label" style="font-weight: bold; color: #1B294A;">Acreditado EUR:</td>
                <td class="totals-value" style="font-size: 13px; color: #1B294A; font-family: monospace;">€ ${totalAcreditadoEUR.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
              </tr>` : ''}
            </table>
          </div>

          <div class="footer-notes">
            Reporte generado electrónicamente desde el panel administrativo de Procarni System.
          </div>

          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
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

      const updateData: any = {
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

  const pendingOrders = orders?.filter((o) => o.status !== 'Paid') || [];
  const paidOrders = orders?.filter((o) => o.status === 'Paid') || [];

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

    return (
      <Card 
        key={order.id}
        className={cn(
          "group relative p-6 border rounded-[1.75rem] transition-all duration-300 hover:shadow-lg flex flex-col justify-between min-h-[300px]",
          urgencyColor
        )}
      >
        <div>
          <div className="flex justify-between items-start mb-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="font-mono text-sm font-black text-procarni-dark leading-none truncate">{order.displayId}</span>
              <span className={cn("px-2 py-0.5 text-[9px] font-bold rounded-md uppercase tracking-wider text-center w-fit", typeColor)}>
                {typeLabel}
              </span>
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
          <div className="flex items-center justify-between gap-2">
            {/* View Details Link */}
            <button
              onClick={() => navigate(order.type === 'purchase_order' ? `/purchase-orders/${order.id}` : `/service-orders/${order.id}`)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-procarni-blue hover:text-procarni-primary hover:bg-slate-50 rounded-xl transition-all h-10 min-w-[50px] shrink-0 justify-center"
            >
              Ver <ArrowRight className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Registrar Abono Button */}
              {order.status !== 'Paid' && (
                <Button
                  onClick={(e) => handleOpenAbonoDialog(order, e)}
                  size="sm"
                  variant="outline"
                  className="h-10 text-xs font-extrabold rounded-xl bg-procarni-primary/5 hover:bg-procarni-primary hover:text-white border-procarni-primary/10 hover:border-transparent text-procarni-primary shadow-sm hover:scale-[1.02] transition-all px-3"
                >
                  <PlusCircle className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Abonar
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
    </m.div>
  );
};

export default PaymentRemindersDashboard;
