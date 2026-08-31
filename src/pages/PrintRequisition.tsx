import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { requisitionService } from '@/services/requisitionService';
import { Requisition } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast';
import { PurchaseRequisitionFormat } from '@/components/PurchaseRequisitionFormat';
import { ServiceRequisitionFormat } from '@/components/ServiceRequisitionFormat';
import { WarehouseExitFormat } from '@/components/WarehouseExitFormat';
import { LogbookControlFormat } from '@/components/LogbookControlFormat';

const PrintRequisition = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get custom rows from query parameter, fallback to 15
  const rowsParam = searchParams.get('rows');
  const totalRows = rowsParam ? Math.max(1, parseInt(rowsParam) || 15) : 15;

  useEffect(() => {
    const fetchRequisitions = async () => {
      if (!id) return;
      try {
        const ids = id.split(',');
        const fetchedList: Requisition[] = [];
        
        for (const reqId of ids) {
          const data = await requisitionService.getById(reqId.trim());
          if (data) {
            fetchedList.push(data);
          }
        }

        if (fetchedList.length > 0) {
          fetchedList.sort((a, b) => a.sequence_number - b.sequence_number);
          setRequisitions(fetchedList);
        } else {
          showError('No se encontraron los correlativos de requisición.');
        }
      } catch (err) {
        console.error('Error fetching requisitions details:', err);
        showError('Error al cargar las requisiciones.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequisitions();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-procarni-primary animate-spin" />
        <span className="text-sm font-semibold text-slate-600">Generando formatos imprimibles...</span>
      </div>
    );
  }

  if (requisitions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <span className="text-lg font-bold text-red-600">Error: Requisiciones no encontradas</span>
        <Button onClick={() => navigate('/requisitions')} className="bg-procarni-primary text-white">
          Volver a Requisiciones
        </Button>
      </div>
    );
  }

  // Generate empty rows array
  const emptyRows = Array.from({ length: totalRows }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:py-0 print:bg-white font-sans text-[11px] text-gray-800">
      {/* Control bar for screen view */}
      <div className="max-w-[210mm] mx-auto mb-6 bg-white p-4 rounded-2xl shadow-md border border-gray-200/80 flex items-center justify-between no-print">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            onClick={() => navigate('/requisitions')}
            className="text-gray-500 hover:text-procarni-dark rounded-xl h-9 px-3 gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver</span>
          </Button>
          <span className="h-4 w-px bg-gray-200"></span>
          <span className="text-xs font-semibold text-gray-500">
            Vista Previa de Requisiciones ({requisitions.length})
          </span>
        </div>
        <Button 
          onClick={() => window.print()}
          className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-xl shadow-lg h-9 gap-1.5"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir / Descargar PDF</span>
        </Button>
      </div>

      {/* Style block dedicated to handle printing configuration */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .requisition-sheet-page {
            min-height: 0 !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: always !important;
            break-after: page !important;
          }
          .requisition-sheet-page:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
        @page {
          size: ${requisitions.some(r => r.type === 'logbook') ? 'A4 landscape' : 'A4 portrait'};
          margin: ${requisitions.some(r => r.type === 'logbook') ? '16mm 6mm 5mm 6mm' : '8mm 6mm'};
        }
        .custom-table th, .custom-table td {
          border: 1px solid #1e293b;
        }
      `}} />

      {requisitions.map((requisition) => {
        const prefix = requisition.type === 'purchase' ? 'RC' : requisition.type === 'service' ? 'RS' : requisition.type === 'warehouse' ? 'VS' : 'BC';
        const correlative = `${prefix}-${String(requisition.sequence_number).padStart(3, '0')}`;
        const isLandscape = requisition.type === 'logbook';
        const sizeClasses = isLandscape 
          ? "max-w-[297mm] min-h-[210mm]" 
          : "max-w-[210mm] min-h-[297mm]";
        const paddingClasses = isLandscape 
          ? "pt-[16mm] pb-[5mm] px-[8mm]" 
          : "p-[8mm]";

        // Enforce exactly 18 items for logbook
        const currentEmptyRows = requisition.type === 'logbook'
          ? Array.from({ length: 18 }, (_, i) => i + 1)
          : emptyRows;

        return (
          <div 
            key={requisition.id}
            id="requisition-sheet" 
            className={`requisition-sheet-page ${sizeClasses} ${paddingClasses} mx-auto bg-white print:p-0 shadow-lg print:shadow-none border border-gray-200 print:border-none flex flex-col gap-2 mb-8 print:mb-0`}
          >
            {requisition.type === 'purchase' ? (
              <PurchaseRequisitionFormat
                requisition={requisition}
                correlative={correlative}
                emptyRows={currentEmptyRows}
              />
            ) : requisition.type === 'service' ? (
              <ServiceRequisitionFormat
                requisition={requisition}
                correlative={correlative}
                emptyRows={currentEmptyRows}
              />
            ) : requisition.type === 'warehouse' ? (
              <WarehouseExitFormat
                requisition={requisition}
                correlative={correlative}
                emptyRows={currentEmptyRows}
              />
            ) : (
              <LogbookControlFormat
                requisition={requisition}
                correlative={correlative}
                emptyRows={currentEmptyRows}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PrintRequisition;
