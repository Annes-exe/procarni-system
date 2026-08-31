import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { cn } from '@/lib/utils';
import { ComparisonResult } from '@/integrations/supabase/types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAllUnits } from '@/integrations/supabase/data';
import { useQuery } from '@tanstack/react-query';

const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[/\\?%*:|"<>]/g, '-');
};

interface QuoteComparisonPDFButtonProps {
  comparisonResults: ComparisonResult[];
  baseCurrency: 'USD' | 'VES' | 'EUR';
  globalExchangeRate?: number;
  comparisonName?: string;
  creatorName?: string;
  label?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  className?: string;
  isSingleMaterial?: boolean;
}

const QuoteComparisonPDFButton: React.FC<QuoteComparisonPDFButtonProps> = ({
  comparisonResults,
  baseCurrency,
  globalExchangeRate,
  comparisonName,
  creatorName,
  label = 'Descargar Comparación PDF',
  variant = 'default',
  isSingleMaterial = false,
  className,
}) => {
  const { session, profile, userName } = useSession();
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const unitMap = useMemo(() => {
    const map: Record<string, string> = {};
    units.forEach((u: any) => {
      map[u.id] = u.name;
    });
    return map;
  }, [units]);

  const handleDownload = () => {
    if (comparisonResults.length === 0) {
      showError('No hay datos para generar el PDF.');
      return;
    }

    setIsDownloading(true);

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const dateStr = new Date().toLocaleDateString('es-VE');
      const activeCompName = comparisonName?.trim() || 'Nueva Comparación';

      // 1. Header (PROCARNI SYSTEM style matching system reports)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74); // #1B294A (Procarni Blue)
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // #880a0a (Primary Red)
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42); // #0f172a
      doc.text('Reporte de Comparación de Cotizaciones', pageWidth - 14, 16, { align: 'right' });

      // Comparison Name as subtitle in header
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(136, 10, 10); // #880a0a
      doc.text(activeCompName, pageWidth - 14, 21, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, pageWidth - 14, 25.5, { align: 'right' });

      // 2. Summary Filter Box
      const boxY = 29;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.rect(14, boxY, pageWidth - 28, 9, 'FD');

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      const rateText = globalExchangeRate ? `Bs. ${globalExchangeRate.toFixed(2)}` : 'N/A';
      doc.text(
        `Comparación: ${activeCompName}   |   Moneda Base: ${baseCurrency}   |   Tasa BCV: ${rateText}   |   Ítems: ${comparisonResults.length}`,
        18,
        boxY + 6
      );

      let currentY = boxY + 15;

      // 3. Render Each Material's Comparison Table
      comparisonResults.forEach((comp) => {
        const materialUnit = comp.material.unit_id ? (unitMap[comp.material.unit_id] || '') : '';
        const unitSuffix = materialUnit ? ` [${materialUnit}]` : '';
        const materialTitle = `${comp.material.name} (${comp.material.code})${unitSuffix}`;

        // Check if we need a new page for the material section title
        if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = 20;
        }

        // Section Title
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(27, 41, 74); // #1B294A
        doc.text(`MATERIAL: ${materialTitle}`, 14, currentY);

        const headers = ['Proveedor', 'Presentación', 'Precio Original', 'Moneda', 'Tasa', `Precio Base (${baseCurrency})`];
        const rows: any[][] = [];

        // Calculate best price per UoM for highlighting
        const bestPricesByUoM: Record<string, number> = {};
        comp.results.forEach(quote => {
          if (quote.isValid && quote.convertedPrice !== null && quote.convertedPrice !== undefined) {
            const uomKey = quote.unit_id || quote.unit_name || 'UND';
            if (bestPricesByUoM[uomKey] === undefined || quote.convertedPrice < bestPricesByUoM[uomKey]) {
              bestPricesByUoM[uomKey] = quote.convertedPrice;
            }
          }
        });

        comp.results.forEach(quote => {
          const uomLabel = quote.unit_id ? (unitMap[quote.unit_id] || quote.unit_name || 'UND') : (quote.unit_name || 'UND');
          const rateVal = quote.exchangeRate ? quote.exchangeRate.toFixed(4) : (quote.currency === 'USD' ? '-' : 'N/A');
          const convertedVal = quote.isValid && quote.convertedPrice !== null && quote.convertedPrice !== undefined
            ? `${baseCurrency} ${quote.convertedPrice.toFixed(2)}`
            : `Inválido`;

          const supplierName = quote.supplierName || 'Sin Proveedor';
          const supplierCell = quote.comment?.trim()
            ? `${supplierName}\nNota: ${quote.comment.trim()}`
            : supplierName;

          const rowData = [
            supplierCell,
            uomLabel,
            `${quote.currency === 'USD' ? '$' : quote.currency === 'EUR' ? '€' : 'Bs.'} ${quote.unitPrice.toFixed(2)}`,
            quote.currency,
            rateVal,
            convertedVal
          ];

          rows.push(rowData);
        });

        autoTable(doc, {
          startY: currentY + 3,
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
            0: { fontStyle: 'bold', textColor: [27, 41, 74], cellWidth: 54 },
            1: { cellWidth: 28 },
            2: { halign: 'right', cellWidth: 26 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'right', cellWidth: 24 },
            5: { halign: 'right', fontStyle: 'bold', cellWidth: 32 },
          },
          didParseCell: (data) => {
            if (data.section === 'body') {
              const quote = comp.results[data.row.index];
              if (quote && quote.isValid && quote.convertedPrice !== null && quote.convertedPrice !== undefined) {
                const uomKey = quote.unit_id || quote.unit_name || 'UND';
                const isBest = quote.convertedPrice === bestPricesByUoM[uomKey];
                if (isBest) {
                  data.cell.styles.fillColor = [209, 250, 229]; // light emerald / green (#D1FAE5)
                  data.cell.styles.textColor = [6, 95, 70]; // emerald-800 (#065F46)
                  data.cell.styles.fontStyle = 'bold';
                }
              }
            }
          },
          margin: { left: 14, right: 14 },
        });

        // @ts-expect-error - lastAutoTable is injected dynamically by jspdf-autotable
        currentY = doc.lastAutoTable.finalY + 12;
      });

      // 4. Page numbering & footer on all pages
      const pageCount = doc.getNumberOfPages();
      const printedByName = creatorName || userName || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || profile?.username || 'Usuario';

      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400

        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 14, pageHeight - 8, { align: 'right' });
        doc.text(`PROCARNI SYSTEM  |  ${activeCompName}  |  Elaborado por: ${printedByName}`, 14, pageHeight - 8);
      }

      const cleanCompName = activeCompName && activeCompName !== 'Nueva Comparación'
        ? sanitizeFilename(activeCompName.replace(/\s+/g, '_'))
        : '';

      const filename = isSingleMaterial
        ? `Comparacion_${comparisonResults[0].material.code}_${new Date().toISOString().slice(0, 10)}.pdf`
        : cleanCompName
          ? `Comparacion_${cleanCompName}_${new Date().toISOString().slice(0, 10)}.pdf`
          : `Comparacion_SC_General_${new Date().toISOString().slice(0, 10)}.pdf`;

      doc.save(sanitizeFilename(filename));
      showSuccess('Reporte PDF descargado con éxito.');
    } catch (error: any) {
      console.error('Error generating PDF:', error);
      showError('Ocurrió un error al generar el reporte PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const isDisabled = isDownloading || comparisonResults.length === 0;

  return (
    <Button
      variant={variant}
      onClick={handleDownload}
      disabled={isDisabled}
      className={cn(
        "shadow-sm transition-all flex items-center gap-2",
        variant === 'default' ? 'bg-procarni-secondary hover:bg-green-700' : '',
        className
      )}
    >
      {isDownloading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isDownloading ? 'Generando...' : label}
    </Button>
  );
};

export default QuoteComparisonPDFButton;