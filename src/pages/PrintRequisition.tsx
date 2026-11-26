import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { requisitionService } from '@/services/requisitionService';
import { Requisition } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { showError } from '@/utils/toast';
import { PurchaseRequisitionFormat } from '@/components/PurchaseRequisitionFormat';
import { ServiceRequisitionFormat } from '@/components/ServiceRequisitionFormat';
import { WarehouseExitFormat } from '@/components/WarehouseExitFormat';
import { LogbookControlFormat } from '@/components/LogbookControlFormat';
import { SolventControlFormat } from '@/components/SolventControlFormat';

const PrintRequisition = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if printing standalone solvent control format (without DB record)
  const isStandaloneSolvent = id === 'solvent-red' || id === 'solvent-brown' || id === 'solvent';
  const standaloneSolventType: 'red' | 'brown' = 
    id === 'solvent-brown' ? 'brown' : 
    (searchParams.get('type') === 'brown' ? 'brown' : 'red');
  const solventDate = searchParams.get('date') || '';
  const solventLot = searchParams.get('lot') || '';
  const solventResponsible = searchParams.get('responsible') || '';
  const solventCountParam = searchParams.get('quantity') || searchParams.get('count');
  const totalSolventLots = solventCountParam ? Math.max(1, Math.min(50, parseInt(solventCountParam) || 1)) : 1;

  // Get custom rows from query parameter, fallback to 15
  const rowsParam = searchParams.get('rows');
  const totalRows = rowsParam ? Math.max(1, parseInt(rowsParam) || 15) : 15;

  const handleReturnToFormats = () => {
    // Close the current tab so two tabs don't remain open
    window.close();
    // Fallback if browser blocks closing (e.g. direct URL navigation)
    setTimeout(() => {
      navigate('/requisitions');
    }, 150);
  };

  useEffect(() => {
    // If it's a standalone solvent format, no DB fetch is required
    if (isStandaloneSolvent) {
      setIsLoading(false);
      return;
    }

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
  }, [id, isStandaloneSolvent]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-procarni-primary animate-spin" />
        <span className="text-sm font-semibold text-slate-600">Generando formatos imprimibles...</span>
      </div>
    );
  }

  if (!isStandaloneSolvent && requisitions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <span className="text-lg font-bold text-red-600">Error: Formatos no encontrados</span>
        <Button onClick={handleReturnToFormats} className="bg-procarni-primary text-white">
          Volver a Formatos
        </Button>
      </div>
    );
  }

  // Generate empty rows array for standard requisitions
  const emptyRows = Array.from({ length: totalRows }, (_, i) => i + 1);

  const isLandscape = 
    isStandaloneSolvent || 
    requisitions.some(r => r.type === 'logbook' || r.type === 'solvent_red' || r.type === 'solvent_brown');
  const controlBarMaxWidth = isLandscape ? 'max-w-[297mm]' : 'max-w-[210mm]';

  // Compute title for the top control bar
  let previewTitle = `Vista Previa de Formatos (${requisitions.length})`;
  if (isStandaloneSolvent) {
    previewTitle = `Vista Previa: Formato Solvente Tapa ${standaloneSolventType === 'red' ? 'Roja (9 Und.)' : 'Marrón (6 Und.)'} • ${totalSolventLots} ${totalSolventLots === 1 ? 'Lote' : 'Lotes'}`;
  } else if (requisitions.length > 0) {
    const firstType = requisitions[0].type;
    if (firstType === 'solvent_red') {
      previewTitle = `Vista Previa: Solvente Tapa Roja (${requisitions.length} ${requisitions.length === 1 ? 'Lote' : 'Lotes'})`;
    } else if (firstType === 'solvent_brown') {
      previewTitle = `Vista Previa: Solvente Tapa Marrón (${requisitions.length} ${requisitions.length === 1 ? 'Lote' : 'Lotes'})`;
    }
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:py-0 print:bg-white font-sans text-[11px] text-gray-800">
      {/* Control bar for screen view */}
      <div className={`${controlBarMaxWidth} mx-auto mb-6 bg-white p-4 rounded-2xl shadow-md border border-gray-200/80 flex items-center justify-between no-print`}>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            onClick={handleReturnToFormats}
            className="text-gray-500 hover:text-procarni-dark rounded-xl h-9 px-3 gap-1.5 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a Formatos</span>
          </Button>
          <span className="h-4 w-px bg-gray-200"></span>
          <span className="text-xs font-semibold text-gray-600">
            {previewTitle}
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
          size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
          margin: ${isLandscape ? '16mm 6mm 5mm 6mm' : '8mm 6mm'};
        }
        .custom-table th, .custom-table td {
          border: 1px solid #1e293b;
        }
      `}} />

      {/* If printing standalone Solvent Control Formats */}
      {isStandaloneSolvent && (
        <>
          {Array.from({ length: totalSolventLots }, (_, idx) => (
            <div 
              key={idx}
              id="requisition-sheet" 
              className="requisition-sheet-page max-w-[297mm] min-h-[210mm] pt-[16mm] pb-[5mm] px-[8mm] mx-auto bg-white print:p-0 shadow-lg print:shadow-none border border-gray-200 print:border-none flex flex-col justify-between mb-8 print:mb-0"
            >
              <SolventControlFormat
                type={standaloneSolventType}
                receivedDate={solventDate}
                lotNumber={solventLot}
                responsible={solventResponsible}
                pageNumber={idx + 1}
                totalPages={totalSolventLots}
              />
            </div>
          ))}
        </>
      )}

      {/* Standard Requisitions & Saved Database Formats */}
      {!isStandaloneSolvent && requisitions.map((requisition, index) => {
        const prefix = 
          requisition.type === 'purchase' ? 'RC' : 
          requisition.type === 'service' ? 'RS' : 
          requisition.type === 'warehouse' ? 'VS' : 
          requisition.type === 'logbook' ? 'BC' : 
          requisition.type === 'solvent_red' ? 'STR' : 'STM';
        const correlative = `${prefix}-${String(requisition.sequence_number).padStart(3, '0')}`;
        const reqIsLandscape = 
          requisition.type === 'logbook' || 
          requisition.type === 'solvent_red' || 
          requisition.type === 'solvent_brown';
        const sizeClasses = reqIsLandscape 
          ? "max-w-[297mm] min-h-[210mm]" 
          : "max-w-[210mm] min-h-[297mm]";
        const paddingClasses = reqIsLandscape 
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
            ) : requisition.type === 'logbook' ? (
              <LogbookControlFormat
                requisition={requisition}
                correlative={correlative}
                emptyRows={currentEmptyRows}
              />
            ) : (
              <SolventControlFormat
                type={requisition.type === 'solvent_brown' ? 'brown' : 'red'}
                receivedDate={solventDate || requisition.lot_date || (requisition.created_at ? format(new Date(requisition.created_at), 'yyyy-MM-dd') : undefined)}
                lotNumber={solventLot || requisition.lot_number || correlative}
                responsible={solventResponsible || requisition.responsible || (requisition.profiles ? `${requisition.profiles.first_name || ''} ${requisition.profiles.last_name || ''}`.trim() : undefined)}
                pageNumber={index + 1}
                totalPages={requisitions.length}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PrintRequisition;
