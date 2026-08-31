import React from 'react';
import { Requisition } from '@/integrations/supabase/types';

interface LogbookControlFormatProps {
  requisition: Requisition;
  correlative: string;
  emptyRows: number[];
}

export const LogbookControlFormat: React.FC<LogbookControlFormatProps> = ({
  emptyRows,
}) => {
  return (
    <div className="landscape-page-style w-full">
      {/* Header */}
      <table className="w-full border-collapse mb-4 custom-table">
        <tbody>
          <tr>
            <td style={{ width: '15%', textAlign: 'center', padding: '8px', verticalAlign: 'middle' }}>
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
              padding: '8px', 
              color: '#1b294a' 
            }}>
              BITÁCORA DE CONTROL DE SALIDA DE INSUMOS (CUARTICO)
            </td>
            <td style={{ width: '30%', padding: '8px', fontSize: '10px', verticalAlign: 'middle' }}>
              <div className="mb-2"><strong>Mes / Semana:</strong> _____________________</div>
              <div><strong>Encargada:</strong> _________________________</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Main Table */}
      <table className="w-full border-collapse custom-table">
        <thead>
          <tr style={{ backgroundColor: '#f1f5f9' }}>
            <th style={{ width: '7%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>FECHA</th>
            <th style={{ width: '5%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>CANT.</th>
            <th style={{ width: '5%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>U/M</th>
            <th style={{ width: '30%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>DESCRIPCIÓN DEL INSUMO</th>
            <th style={{ width: '18%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>ÁREA / MÁQUINA DESTINO</th>
            <th style={{ width: '18%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>NOMBRE DE QUIEN RECIBE</th>
            <th style={{ width: '17%', padding: '8px 4px', fontSize: '9px', textAlign: 'center', color: '#1b294a', border: '1px solid #1e293b' }}>FIRMA</th>
          </tr>
        </thead>
        <tbody>
          {emptyRows.map((num) => (
            <tr key={num} style={{ height: '32px' }}>
              <td style={{ border: '1px solid #1e293b' }}></td>
              <td style={{ border: '1px solid #1e293b' }}></td>
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
  );
};
