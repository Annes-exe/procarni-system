import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[/\\?%*:|"<>]/g, '-');
};

const formatSequenceNumber = (sequence?: number, dateString?: string): string => {
  if (!sequence) return '-';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OC-${year}-${month}-${seq}`;
};

const convertPriceToUSD = (entry: any): number | null => {
  const price = entry.unit_price;
  const currency = entry.currency;
  const rate = entry.exchange_rate;

  if (currency === 'USD') return price;
  if (currency === 'VES' && rate && rate > 0) return price / rate;
  if (currency === 'EUR' && rate && rate > 0) return price;
  return null;
};

interface SupplierPriceHistoryDownloadButtonProps {
  supplierId: string;
  supplierName?: string;
  startDate?: Date;
  endDate?: Date;
  disabled?: boolean;
  asChild?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  className?: string;
}

const SupplierPriceHistoryDownloadButton = React.forwardRef<HTMLButtonElement, SupplierPriceHistoryDownloadButtonProps>(({
  supplierId,
  supplierName,
  startDate,
  endDate,
  disabled = false,
  asChild = false,
  variant = 'ghost',
  className,
}, ref) => {
  const { session } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!supplierId) {
      showError('Proveedor no seleccionado.');
      return;
    }

    setIsDownloading(true);

    try {
      // 1. Fetch Supplier Info
      let query = supabase
        .from('price_history')
        .select(`
          *,
          materials (name, code, unit),
          units_of_measure (name),
          purchase_orders (sequence_number, created_at)
        `)
        .eq('supplier_id', supplierId)
        .order('recorded_at', { ascending: false });

      if (startDate) query = query.gte('recorded_at', startDate.toISOString());
      if (endDate) query = query.lte('recorded_at', endDate.toISOString());

      const [supRes, historyRes] = await Promise.all([
        supabase
          .from('suppliers')
          .select('name, code, rif, city')
          .eq('id', supplierId)
          .single(),
        query
      ]);

      if (supRes.error || !supRes.data) {
        throw new Error('No se pudo encontrar la información del proveedor.');
      }

      const supplier = supRes.data;
      const history = historyRes.data || [];

      if (history.length === 0) {
        showError('No se encontró historial de precios registrado para este proveedor.');
        setIsDownloading(false);
        return;
      }

      // 2. Generate PDF with jsPDF (Landscape orientation)
      const doc = new jsPDF({ orientation: 'landscape' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Header (PROCARNI SYSTEM style)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74); // #1B294A
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // #880a0a
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('Historial de Precios por Proveedor', pageWidth - 14, 18, { align: 'right' });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(136, 10, 10);
      doc.text(`${supplier.name} (${supplier.code || 'S/C'}) - RIF: ${supplier.rif || 'S/R'}`, pageWidth - 14, 23, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, pageWidth - 14, 28, { align: 'right' });

      // Summary Filter Box
      const boxY = 32;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(14, boxY, pageWidth - 28, 9, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const dateFilterStr = startDate && endDate
        ? `Rango: ${startDate.toLocaleDateString('es-VE')} - ${endDate.toLocaleDateString('es-VE')}`
        : 'Todos los registros históricos';
      doc.text(
        `Proveedor: ${supplier.name}   |   RIF: ${supplier.rif || 'S/R'}   |   ${dateFilterStr}   |   Total Registros: ${history.length}`,
        18,
        boxY + 6
      );

      // Table data
      const headers = ['Fecha', 'Material', 'Código', 'U.M.', 'Precio Original', 'Tasa BCV', 'P. Conv (USD)', 'N° OC'];
      const rows = history.map((entry: any) => {
        const entryDate = entry.purchase_orders?.created_at || entry.recorded_at;
        const formattedDate = entryDate ? new Date(entryDate).toLocaleDateString('es-VE') : '-';
        const matName = entry.materials?.name || 'N/A';
        const matCode = entry.materials?.code || '-';
        const uom = entry.units_of_measure?.name || entry.unit || entry.materials?.unit || 'UND';
        const origPrice = `${entry.currency === 'USD' ? '$' : entry.currency === 'EUR' ? '€' : 'Bs.'} ${Number(entry.unit_price || 0).toFixed(2)}`;
        const rate = entry.exchange_rate ? `Bs. ${Number(entry.exchange_rate).toFixed(2)}` : (entry.currency === 'USD' ? '-' : 'N/A');
        const convUSD = convertPriceToUSD(entry);
        const convText = convUSD !== null ? `$ ${convUSD.toFixed(2)}` : '-';
        const orderNumber = formatSequenceNumber(entry.purchase_orders?.sequence_number, entry.purchase_orders?.created_at);

        return [formattedDate, matName, matCode, uom, origPrice, rate, convText, orderNumber];
      });

      autoTable(doc, {
        startY: boxY + 14,
        head: [headers],
        body: rows,
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
          lineColor: [241, 245, 249],
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { fontStyle: 'bold', textColor: [27, 41, 74], cellWidth: 70 },
          2: { cellWidth: 26 },
          3: { halign: 'center', cellWidth: 20 },
          4: { halign: 'right', cellWidth: 32 },
          5: { halign: 'right', cellWidth: 28 },
          6: { halign: 'right', fontStyle: 'bold', textColor: [136, 10, 10], cellWidth: 34 },
          7: { halign: 'center', cellWidth: 32 },
        },
        margin: { left: 14, right: 14 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      const printedByName = session?.user?.email || 'Sistema';

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);

        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
        doc.text(`PROCARNI SYSTEM  |  Historial de Precios - Proveedor  |  Elaborado por: ${printedByName}`, 14, pageHeight - 8);
      }

      const safeSupplierName = (supplier.name || 'Proveedor').replace(/\s+/g, '_');
      const filename = `Historial_Precios_Proveedor_${safeSupplierName}_${new Date().toISOString().slice(0, 10)}.pdf`;

      doc.save(sanitizeFilename(filename));
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error: any) {
      console.error('[SupplierPriceHistoryDownloadButton] Error:', error);
      showError(error.message || 'Error al generar el reporte PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || disabled || !supplierId}
      variant={variant}
      asChild={asChild}
      className={cn("flex items-center gap-2", !asChild ? "bg-procarni-secondary text-white hover:bg-green-700 shadow-sm" : "w-full justify-start")}
      ref={ref}
    >
      <span className="flex items-center gap-2">
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {isDownloading ? 'Generando...' : 'Historial de Precios'}
      </span>
    </Button>
  );
});

SupplierPriceHistoryDownloadButton.displayName = "SupplierPriceHistoryDownloadButton";

export default SupplierPriceHistoryDownloadButton;