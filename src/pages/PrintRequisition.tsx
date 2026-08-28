import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { requisitionService } from '@/services/requisitionService';
import { Requisition } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Printer, ArrowLeft, Loader2 } from 'lucide-react';
import { showError } from '@/utils/toast';

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
          size: A4 portrait;
          margin: 8mm 6mm;
        }
        .custom-table th, .custom-table td {
          border: 1px solid #1e293b;
        }
      `}} />

      {requisitions.map((requisition) => {
        const isPurchase = requisition.type === 'purchase';
        const prefix = isPurchase ? 'RC' : 'RS';
        const correlative = `${prefix}-${String(requisition.sequence_number).padStart(3, '0')}`;

        return (
          <div 
            key={requisition.id}
            id="requisition-sheet" 
            className="requisition-sheet-page max-w-[210mm] min-h-[297mm] mx-auto bg-white p-[8mm] print:p-0 shadow-lg print:shadow-none border border-gray-200 print:border-none flex flex-col gap-2 mb-8 print:mb-0"
          >
            {/* Content */}
            <div>
              {/* Header */}
              <table className="w-full border-collapse mb-2 custom-table">
            <tbody>
              <tr>
                <td style={{ width: '20%', textAlign: 'center', padding: '5px', verticalAlign: 'middle' }}>
                  <img src="/Sis-Prov.png" alt="Logo" className="w-10 h-10 object-contain mx-auto" />
                  <span className="text-[9px] font-black text-procarni-blue tracking-tighter block mt-1">PROCARNI</span>
                </td>
                <td style={{ 
                  width: '55%', 
                  textAlign: 'center', 
                  fontSize: '14px', 
                  fontWeight: 'bold', 
                  backgroundColor: '#f1f5f9', 
                  verticalAlign: 'middle', 
                  padding: '5px', 
                  color: '#1b294a' 
                }}>
                  {isPurchase ? 'REQUISICIÓN DE COMPRA' : 'REQUISICIÓN DE SERVICIO'}
                </td>
                <td style={{ width: '25%', padding: '5px', verticalAlign: 'middle', fontSize: '10px' }}>
                  <div className="font-semibold text-gray-500 uppercase text-[8px] tracking-wider">Número Correlativo</div>
                  <div className="text-[13px] font-bold text-procarni-primary mt-0.5">{correlative}</div>
                </td>
              </tr>
            </tbody>
          </table>

          <table className="w-full border-collapse mb-3 custom-table">
            <tbody>
              <tr>
                <td style={{ width: '33%', padding: '4px 6px' }}>
                  <strong>Fecha Solicitud:</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 20___
                </td>
                <td style={{ width: '34%', padding: '4px 6px' }}>
                  <strong>Prioridad:</strong> &nbsp;&nbsp; [ &nbsp; ] Alta &nbsp;&nbsp; [ &nbsp; ] Media &nbsp;&nbsp; [ &nbsp; ] Baja
                </td>
                <td style={{ width: '33%', padding: '4px 6px' }}>
                  <strong>Fecha Requerida:</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 20___
                </td>
              </tr>
              <tr>
                <td colSpan={2} style={{ padding: '4px 6px' }}>
                  <strong>Área Solicitante:</strong>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <strong>Nombre y Cargo:</strong>
                </td>
              </tr>
              <tr>
                <td colSpan={3} style={{ padding: '4px 6px' }}>
                  <strong>N° O.C. / O.S. Relacionadas (Uso de Compras):</strong> &nbsp;&nbsp; ___________________________________________________________________________________________________
                </td>
              </tr>
            </tbody>
          </table>

          {/* Main items table */}
          <table className="w-full border-collapse mb-3 custom-table">
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ width: '5%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>ÍTEM</th>
                <th style={{ width: '8%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>CANT.</th>
                <th style={{ width: '8%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>U/M</th>
                <th style={{ 
                  width: isPurchase ? '44%' : '54%', 
                  padding: '6px 4px', 
                  fontSize: '9px', 
                  textAlign: 'center', 
                  color: '#1b294a' 
                }}>
                  {isPurchase ? 'DESCRIPCIÓN DETALLADA DEL MATERIAL' : 'DESCRIPCIÓN DETALLADA DEL SERVICIO / TRABAJO'}
                </th>
                {isPurchase && (
                  <th style={{ width: '10%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>CAT. (*)</th>
                )}
                <th style={{ width: '25%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>
                  {isPurchase ? 'DESTINO / USO' : 'DESTINO / EQUIPO / ÁREA'}
                </th>
              </tr>
            </thead>
            <tbody>
              {emptyRows.map((num) => (
                <tr key={num} style={{ height: '34px' }}>
                  <td style={{ textAlign: 'center', padding: '4px', color: '#64748b' }}>{num}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  {isPurchase && <td></td>}
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer info and signatures */}
        <div className="mt-2">
          {/* Observations */}
          <div style={{ border: '1px solid #1e293b', padding: '6px 8px', height: '95px', marginBottom: '8px' }} className="rounded-lg">
            <strong className="text-gray-700 text-[10px] uppercase tracking-wider">OBSERVACIONES / JUSTIFICACIÓN DE LA SOLICITUD:</strong>
          </div>

          {/* Signatures Table */}
          <table className="w-full border-collapse custom-table signatures-table mb-2">
            <tbody>
              <tr style={{ height: '70px' }}>
                <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }} className="rounded-l-lg overflow-hidden">
                  <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                    SOLICITADO POR
                  </div>
                  <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                    Nombre:<br />Firma:
                  </div>
                </td>
                <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }}>
                  <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                    APROBADO POR
                  </div>
                  <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                    Nombre:<br />Firma:
                  </div>
                </td>
                <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }} className="rounded-r-lg overflow-hidden">
                  <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                    RECIBIDO EN COMPRAS
                  </div>
                  <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                    Nombre:<br />Firma / Fecha:
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Detailed Category Legend (repositioned below signatures) */}
          {isPurchase && (
            <div className="border border-slate-300 rounded-lg p-2 bg-slate-50/50 text-[8px] leading-relaxed text-slate-700">
              <div className="font-bold text-procarni-blue mb-1 border-b border-slate-200 pb-0.5 uppercase tracking-wide text-[9px]">
                (*) LEYENDA DETALLADA DE CATEGORÍAS (CAT.)
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div>
                  <strong>[ P ] Producción:</strong> Empaque, Seca, Agropecuaria
                </div>
                <div>
                  <strong>[ F ] Ferretería e Infraestructura:</strong> Ferretería y construcción, Construcción, Químicos, Gases y combustible, Medición y manipulación
                </div>
                <div>
                  <strong>[ I ] Industrial y Mecánica:</strong> Insumos industriales, Maquinaria, Mecánica y sellos, Tuberías y accesorios, Herramientas y consumibles
                </div>
                <div>
                  <strong>[ V ] Vehículos / Flota:</strong> Repuestos automotriz
                </div>
                <div>
                  <strong>[ E ] Eléctrico y Refrigeración:</strong> Electricidad e iluminación, Refrigeración
                </div>
                <div>
                  <strong>[ G ] Generales y Servicios:</strong> Dotación, Insumos de limpieza, Insumos de oficina, Operacional, Comedor, Varios, Farmacia
                </div>
              </div>
            </div>
          )}
        </div>

          </div>
        );
      })}
    </div>
  );
};

export default PrintRequisition;
