import React from 'react';
import { Requisition } from '@/integrations/supabase/types';

interface PurchaseRequisitionFormatProps {
  requisition: Requisition;
  correlative: string;
  emptyRows: number[];
}

export const PurchaseRequisitionFormat: React.FC<PurchaseRequisitionFormatProps> = ({
  correlative,
  emptyRows,
}) => {
  return (
    <>
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
                REQUISICIÓN DE COMPRA
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
                width: '44%', 
                padding: '6px 4px', 
                fontSize: '9px', 
                textAlign: 'center', 
                color: '#1b294a' 
              }}>
                DESCRIPCIÓN DETALLADA DEL MATERIAL
              </th>
              <th style={{ width: '10%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>CAT. (*)</th>
              <th style={{ width: '25%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>
                DESTINO / USO
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
                <td></td>
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
      </div>
    </>
  );
};
