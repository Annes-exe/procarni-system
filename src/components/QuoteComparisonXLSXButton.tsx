import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ComparisonResult } from '@/integrations/supabase/types';
import { useQuery } from '@tanstack/react-query';
import { getAllUnits } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

const sanitizeFilename = (str: string): string => {
  return str.replace(/[^a-zA-Z0-9_\-áéíóúÁÉÍÓÚñÑ ]/g, '_').trim();
};

interface QuoteComparisonXLSXButtonProps {
  comparisonResults: ComparisonResult[];
  baseCurrency: 'USD' | 'VES' | 'EUR';
  globalExchangeRate?: number;
  comparisonName?: string;
  creatorName?: string;
  label?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null | undefined;
  className?: string;
}

export const QuoteComparisonXLSXButton: React.FC<QuoteComparisonXLSXButtonProps> = ({
  comparisonResults,
  baseCurrency,
  globalExchangeRate,
  comparisonName,
  creatorName,
  label = 'Excel (.xlsx)',
  variant = 'outline',
  className,
}) => {
  const { session, profile, userName } = useSession();
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExport = () => {
    if (comparisonResults.length === 0) {
      showError('No hay datos para exportar a Excel.');
      return;
    }

    setIsExporting(true);

    try {
      const activeCompName = comparisonName?.trim() || 'Nueva Comparación';

      const rows: any[] = [];

      comparisonResults.forEach((comp) => {
        const materialUnit = comp.material.unit_id ? (unitMap[comp.material.unit_id] || '') : '';
        
        // Find best price for each UoM
        const bestPricesByUoM: Record<string, number> = {};
        comp.results.forEach(quote => {
          if (quote.isValid && quote.convertedPrice !== null && quote.convertedPrice !== undefined) {
            const uomKey = quote.unit_id || quote.unit_name || 'UND';
            if (bestPricesByUoM[uomKey] === undefined || quote.convertedPrice < bestPricesByUoM[uomKey]) {
              bestPricesByUoM[uomKey] = quote.convertedPrice;
            }
          }
        });

        comp.results.forEach((quote) => {
          const uomLabel = quote.unit_id ? (unitMap[quote.unit_id] || quote.unit_name || 'UND') : (quote.unit_name || 'UND');
          const isBest = quote.isValid && quote.convertedPrice !== null && quote.convertedPrice !== undefined && quote.convertedPrice === bestPricesByUoM[uomLabel || 'UND'];

          rows.push({
            'Código Material': comp.material.code || 'S/C',
            'Material': comp.material.name,
            'Unidad Base': materialUnit || '-',
            'Proveedor': quote.supplierName || 'Sin Proveedor',
            'Presentación Cotizada': uomLabel,
            'Precio Original': quote.unitPrice,
            'Moneda Original': quote.currency,
            'Tasa de Cambio': quote.exchangeRate || (quote.currency === 'USD' ? 1 : (globalExchangeRate || '-')),
            [`Precio Convertido (${baseCurrency})`]: quote.convertedPrice !== null && quote.convertedPrice !== undefined ? Number(quote.convertedPrice.toFixed(2)) : 'Inválido',
            '¿Mejor Precio?': isBest ? 'SÍ (MÁS BAJO)' : 'NO',
            'Nota / Comentario': quote.comment?.trim() || ''
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      const colWidths = [
        { wch: 18 }, // Código Material
        { wch: 38 }, // Material
        { wch: 14 }, // Unidad Base
        { wch: 35 }, // Proveedor
        { wch: 24 }, // Presentación Cotizada
        { wch: 16 }, // Precio Original
        { wch: 16 }, // Moneda Original
        { wch: 16 }, // Tasa de Cambio
        { wch: 24 }, // Precio Convertido
        { wch: 18 }, // ¿Mejor Precio?
        { wch: 40 }, // Nota / Comentario
      ];
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparación de Precios');

      const safeCompName = activeCompName && activeCompName !== 'Nueva Comparación'
        ? sanitizeFilename(activeCompName.replace(/\s+/g, '_'))
        : 'Comparacion_Cotizaciones';

      const filename = `${safeCompName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

      XLSX.writeFile(workbook, filename);
      showSuccess('Reporte Excel (.xlsx) exportado exitosamente.');
    } catch (error) {
      console.error('[QuoteComparisonXLSXButton] Error generating Excel:', error);
      showError('Error al exportar la comparación a Excel.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleExport}
      disabled={isExporting || comparisonResults.length === 0}
      className={className}
    >
      {isExporting ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin text-emerald-600" />
      ) : (
        <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-600" />
      )}
      {label}
    </Button>
  );
};

export default QuoteComparisonXLSXButton;
