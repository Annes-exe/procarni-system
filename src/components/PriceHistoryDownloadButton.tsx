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
  if (currency === 'EUR' && rate && rate > 0) return price; // Or EUR equivalent
  return null;
};

interface PriceHistoryDownloadButtonProps {
  materialId: string;
  materialName?: string;
  disabled?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  className?: string;
}

const PriceHistoryDownloadButton: React.FC<PriceHistoryDownloadButtonProps> = ({
  materialId,
  materialName,
  disabled = false,
  variant = 'outline',
  className
}) => {
  const { session, profile, userName } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!materialId) {
      showError('Material no seleccionado.');
      return;
    }

    setIsDownloading(true);

    try {
      // 1. Fetch Material Info & Price History in parallel
      const [matRes, historyRes] = await Promise.all([
        supabase
          .from('materials')
          .select('name, code, unit')
          .eq('id', materialId)
          .single(),
        supabase
          .from('price_history')
          .select(`
            *,
            suppliers (name, code),
            units_of_measure (name),
            purchase_orders (sequence_number, created_at)
          `)
          .eq('material_id', materialId)
          .order('recorded_at', { ascending: false })
      ]);

      if (matRes.error || !matRes.data) {
        throw new Error('No se pudo encontrar la información del material.');
      }

      const material = matRes.data;
      const history = historyRes.data || [];

      if (history.length === 0) {
        showError('No se encontró historial de precios registrado para este material.');
        setIsDownloading(false);
        return;
      }

      const doc = new jsPDF();
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
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text('Historial de Precios por Material', pageWidth - 14, 16, { align: 'right' });

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(136, 10, 10);
      doc.text(`${material.name} (${material.code || 'S/C'})`, pageWidth - 14, 21, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, pageWidth - 14, 25.5, { align: 'right' });

      // Summary Filter Box
      const boxY = 29;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(14, boxY, pageWidth - 28, 9, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Material: ${material.name} (${material.code || 'S/C'})   |   Moneda Base: USD   |   Registros: ${history.length}`,
        18,
        boxY + 6
      );

      // Table data
      const headers = ['Fecha', 'Proveedor', 'P. Original', 'Tasa BCV', 'P. Conv (USD)', 'U.M.', 'N° OC'];
      const rows = history.map((entry: any) => {
        const entryDate = entry.purchase_orders?.created_at || entry.recorded_at;
        const formattedDate = entryDate ? new Date(entryDate).toLocaleDateString('es-VE') : '-';
        const supplierName = entry.suppliers?.name || 'N/A';
        const origPrice = `${entry.currency === 'USD' ? '$' : entry.currency === 'EUR' ? '€' : 'Bs.'} ${Number(entry.unit_price || 0).toFixed(2)}`;
        const rate = entry.exchange_rate ? `Bs. ${Number(entry.exchange_rate).toFixed(2)}` : (entry.currency === 'USD' ? '-' : 'N/A');
        const convUSD = convertPriceToUSD(entry);
        const convText = convUSD !== null ? `$ ${convUSD.toFixed(2)}` : '-';
        const uom = entry.units_of_measure?.name || entry.unit || material.unit || 'UND';
        const orderNumber = formatSequenceNumber(entry.purchase_orders?.sequence_number, entry.purchase_orders?.created_at);

        return [formattedDate, supplierName, origPrice, rate, convText, uom, orderNumber];
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
          0: { cellWidth: 22 },
          1: { fontStyle: 'bold', textColor: [27, 41, 74], cellWidth: 50 },
          2: { halign: 'right', cellWidth: 26 },
          3: { halign: 'right', cellWidth: 24 },
          4: { halign: 'right', fontStyle: 'bold', textColor: [136, 10, 10], cellWidth: 26 },
          5: { halign: 'center', cellWidth: 16 },
          6: { halign: 'center', cellWidth: 24 },
        },
        margin: { left: 14, right: 14 },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      const printedByName = userName || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.username || 'Usuario';

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);

        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
        doc.text(`PROCARNI SYSTEM  |  Historial de Precios  |  Elaborado por: ${printedByName}`, 14, pageHeight - 8);
      }

      const safeMaterialName = (material.code || material.name || 'Material').replace(/\s+/g, '_');
      const filename = `Historial_Precios_${safeMaterialName}_${new Date().toISOString().slice(0, 10)}.pdf`;

      doc.save(sanitizeFilename(filename));
      showSuccess('Reporte PDF descargado exitosamente.');
    } catch (error: any) {
      console.error('[PriceHistoryDownloadButton] Error:', error);
      showError(error.message || 'Error al generar el reporte PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={isDownloading || disabled || !materialId}
      variant={variant || "outline"}
      className={cn("bg-procarni-secondary text-white hover:bg-green-700 transition-all shadow-sm flex items-center gap-2", className)}
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isDownloading ? 'Generando...' : 'Descargar PDF'}
    </Button>
  );
};

export default PriceHistoryDownloadButton;