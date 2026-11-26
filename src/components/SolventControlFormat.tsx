import React from 'react';
import { format } from 'date-fns';

export interface SolventControlFormatProps {
  type: 'red' | 'brown';
  receivedDate?: string;
  lotNumber?: string;
  responsible?: string;
  pageNumber?: number;
  totalPages?: number;
}

export const SolventControlFormat: React.FC<SolventControlFormatProps> = ({
  type,
  receivedDate,
  lotNumber,
  responsible,
  pageNumber,
  totalPages,
}) => {
  const isRed = type === 'red';
  const totalUnits = isRed ? 9 : 6;
  const rows = Array.from({ length: totalUnits }, (_, i) => i + 1);

  // Format received date nicely without timezone drift (DD/MM/YYYY)
  const formatDisplayDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return format(d, 'dd/MM/yyyy');
      }
    } catch {
      return dateStr;
    }
    return dateStr;
  };

  const formattedDate = formatDisplayDate(receivedDate);
  const rowHeight = isRed ? '38px' : '50px';

  return (
    <div className="w-full flex flex-col justify-between h-full font-sans">
      <div>
        {/* Header Table following Cuartico Bitácora style */}
        <table className="w-full border-collapse mb-4 custom-table">
          <tbody>
            <tr>
              <td style={{ width: '15%', textAlign: 'center', padding: '8px', verticalAlign: 'middle', border: '1px solid #1e293b' }}>
                <img src="/Sis-Prov.png" alt="Logo" className="w-10 h-10 object-contain mx-auto" />
                <span className="text-[9px] font-black text-[#1b294a] tracking-tighter block mt-1">PROCARNI</span>
              </td>
              <td style={{ 
                width: '55%', 
                textAlign: 'center', 
                backgroundColor: '#f1f5f9', 
                verticalAlign: 'middle', 
                padding: '8px 12px', 
                color: '#1b294a',
                border: '1px solid #1e293b'
              }}>
                <div className="text-[14px] font-extrabold uppercase tracking-tight">
                  BITÁCORA DE CONTROL DE ENTREGA - SOLVENTE {isRed ? 'TAPA ROJA' : 'TAPA MARRÓN'}
                </div>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    isRed ? 'bg-red-100 text-[#880a0a]' : 'bg-amber-100 text-[#78350f]'
                  }`}>
                    LOTE DE {totalUnits} UNIDADES
                  </span>
                  {totalPages && totalPages > 1 && (
                    <span className="text-[9px] text-gray-500 font-medium">
                      (Hoja {pageNumber} de {totalPages})
                    </span>
                  )}
                </div>
              </td>
              <td style={{ width: '30%', padding: '8px 12px', fontSize: '10px', verticalAlign: 'middle', border: '1px solid #1e293b' }}>
                <div className="mb-1.5 flex items-center justify-between">
                  <strong>Fecha Recepción:</strong>
                  <span className="font-semibold text-procarni-dark">{formattedDate || '____/____/20___'}</span>
                </div>
                <div className="mb-1.5 flex items-center justify-between">
                  <strong>N° Lote:</strong>
                  <span className="font-mono text-gray-700">{lotNumber || '_____________________'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <strong>Encargado(a):</strong>
                  <span className="text-gray-700 truncate max-w-[120px]">{responsible || '_____________________'}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Main Table */}
        <table className="w-full border-collapse custom-table">
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9' }}>
              <th style={{ width: '5%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                UND
              </th>
              <th style={{ width: '15%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                RECIBIDO FECHA
              </th>
              <th style={{ width: '13%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                ENTREGADO FECHA
              </th>
              <th style={{ width: '11%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                ENTREGADO HORA
              </th>
              <th style={{ width: '22%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                ENTREGADO A
              </th>
              <th style={{ width: '15%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                FIRMA DE RECEPCIÓN
              </th>
              <th style={{ width: '19%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b', fontWeight: 'bold' }}>
                ENTREGADO POR
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((rowNum) => (
              <tr key={rowNum} style={{ height: rowHeight }}>
                <td style={{ border: '1px solid #1e293b', textAlign: 'center', fontWeight: 'bold', fontSize: '11px', color: '#1b294a' }}>
                  {rowNum}
                </td>
                <td style={{ border: '1px solid #1e293b', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>
                  {formattedDate || ''}
                </td>
                <td style={{ border: '1px solid #1e293b' }}></td>
                <td style={{ border: '1px solid #1e293b' }}></td>
                <td style={{ border: '1px solid #1e293b' }}></td>
                <td style={{ border: '1px solid #1e293b' }}></td>
                <td style={{ border: '1px solid #1e293b' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Observations and supervisor section */}
      <div className="mt-4">
        <table className="w-full border-collapse custom-table">
          <tbody>
            <tr>
              <td style={{ width: '65%', border: '1px solid #1e293b', padding: '8px 12px', verticalAlign: 'top', fontSize: '10px' }}>
                <strong className="text-[#1b294a] uppercase text-[9px] block mb-1">Observaciones / Incidencias:</strong>
                <div className="h-9 border-b border-dashed border-gray-300"></div>
              </td>
              <td style={{ width: '35%', border: '1px solid #1e293b', padding: '8px 12px', verticalAlign: 'bottom', fontSize: '10px', textAlign: 'center' }}>
                <div className="h-6"></div>
                <div className="border-t border-[#1e293b] pt-1 font-bold text-[#1b294a] text-[10px]">
                  SUPERVISIÓN / CONTROL DE INSUMOS
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-2 flex justify-between items-center text-[9px] text-gray-400 font-medium px-1">
          <span>* Cada fila corresponde a 1 unidad entregada de las {totalUnits} unidades que contiene el lote recibido.</span>
          <span>Procarni - Formato de Control Interno</span>
        </div>
      </div>
    </div>
  );
};
