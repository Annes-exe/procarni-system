import React from 'react';
import { Requisition } from '@/integrations/supabase/types';

interface WarehouseExitFormatProps {
  requisition: Requisition;
  correlative: string;
  emptyRows: number[];
}

export const WarehouseExitFormat: React.FC<WarehouseExitFormatProps> = ({
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
                SALIDA DE INSUMOS/SUMINISTROS
              </td>
              <td style={{ width: '25%', padding: '5px', verticalAlign: 'middle', fontSize: '10px' }}>
                <div className="font-semibold text-gray-500 uppercase text-[8px] tracking-wider">N° de Salida</div>
                <div className="text-[13px] font-bold text-procarni-primary mt-0.5">{correlative}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse mb-3 custom-table">
          <tbody>
            <tr>
              <td style={{ width: '25%', padding: '6px 8px' }}>
                <strong>Fecha:</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; / 20___
              </td>
              <td style={{ width: '75%', padding: '6px 8px' }} colSpan={2}>
                <strong>Empresa / Sede Destino:</strong>
                <div className="mt-1 flex gap-4 text-[9px]">
                  <div>[ &nbsp; ] PROCARNI</div>
                  <div>[ &nbsp; ] MONTANO</div>
                  <div>[ &nbsp; ] EMPOMACA</div>
                  <div>[ &nbsp; ] DISTRIBUIDORA</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ width: '50%', padding: '6px 8px' }} colSpan={2}>
                <strong>Solicitado por (Nombre y Cargo):</strong>
              </td>
              <td style={{ width: '50%', padding: '6px 8px' }}>
                <strong>Área / Departamento:</strong>
              </td>
            </tr>
            <tr>
              <td colSpan={3} style={{ padding: '6px 8px', height: '110px', verticalAlign: 'top' }}>
                <strong>Uso / Destino Final del Insumo:</strong>
                <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>
                  (Especifique en qué máquina, vehículo, área o proceso se utilizará el material retirado)
                </div>
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
              <th style={{ width: '7%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>U/M</th>
              <th style={{ width: '15%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>CÓDIGO (Opcional)</th>
              <th style={{ width: '45%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>DESCRIPCIÓN DEL INSUMO / MATERIAL</th>
              <th style={{ width: '20%', padding: '6px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a' }}>OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            {emptyRows.map((num) => (
              <tr key={num} style={{ height: '28px' }}>
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

      {/* Signatures */}
      <div className="mt-2">
        <table className="w-full border-collapse custom-table signatures-table mb-2">
          <tbody>
            <tr style={{ height: '70px' }}>
              <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }} className="rounded-l-lg overflow-hidden">
                <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                  DESPACHADO POR (Almacén)
                </div>
                <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                  Nombre:<br />Firma:
                </div>
              </td>
              <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }}>
                <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                  RECIBIDO POR
                </div>
                <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                  Nombre:<br />Firma / Fecha:
                </div>
              </td>
              <td style={{ width: '33.33%', padding: 0, verticalAlign: 'top' }} className="rounded-r-lg overflow-hidden">
                <div style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', borderBottom: '1px solid #1e293b', padding: '4px', textAlign: 'center', color: '#1b294a' }}>
                  AUTORIZADO POR
                </div>
                <div style={{ padding: '6px 8px', lineHeight: '2' }}>
                  Nombre:<br />Firma:
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};
