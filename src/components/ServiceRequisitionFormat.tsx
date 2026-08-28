import React from 'react';
import { Requisition } from '@/integrations/supabase/types';

interface ServiceRequisitionFormatProps {
  requisition: Requisition;
  correlative: string;
  emptyRows: number[];
}

export const ServiceRequisitionFormat: React.FC<ServiceRequisitionFormatProps> = ({
  correlative,
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
                REQUISICIÓN DE SERVICIO
              </td>
              <td style={{ width: '25%', padding: '5px', verticalAlign: 'middle', fontSize: '10px' }}>
                <div className="font-semibold text-gray-500 uppercase text-[8px] tracking-wider">Número Correlativo</div>
                <div className="text-[13px] font-bold text-procarni-primary mt-0.5">{correlative}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Info Section */}
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

        {/* 1. CLASIFICACIÓN DEL SERVICIO */}
        <table className="w-full border-collapse mb-3 custom-table">
          <tbody>
            <tr>
              <td colSpan={3} style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', fontSize: '10px', padding: '4px 6px', color: '#1b294a' }}>
                1. CLASIFICACIÓN DEL SERVICIO
              </td>
            </tr>
            <tr style={{ height: '30px' }}>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Mantenimiento Preventivo</td>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Mantenimiento Correctivo</td>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Instalación / Modificación</td>
            </tr>
            <tr style={{ height: '30px' }}>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Servicio Profesional / Asesoría</td>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Logística / Flete</td>
              <td style={{ width: '33.33%', padding: '6px 8px', verticalAlign: 'middle' }}>[ &nbsp; ] Otro: ____________________</td>
            </tr>
          </tbody>
        </table>

        {/* 2. DETALLES DEL SERVICIO */}
        <table className="w-full border-collapse mb-3 custom-table">
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', fontSize: '10px', padding: '4px 6px', color: '#1b294a' }}>
                2. DETALLES DEL SERVICIO
              </td>
            </tr>
            <tr>
              <td style={{ width: '60%', padding: '6px 8px', height: '75px', verticalAlign: 'top' }}>
                <strong>EQUIPO / ACTIVO A INTERVENIR:</strong>
                <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>(Ej: Camión NPR placa XYZ, Aire Acond. 5 Ton, Servidor Principal)</div>
              </td>
              <td style={{ width: '40%', padding: '6px 8px', height: '75px', verticalAlign: 'top' }}>
                <strong>LUGAR DE EJECUCIÓN:</strong>
                <div className="grid grid-cols-2 gap-y-1 mt-1 text-[9px]">
                  <div>[ &nbsp; ] PROCARNI</div>
                  <div>[ &nbsp; ] MONTANO</div>
                  <div>[ &nbsp; ] EMPOMACA</div>
                  <div>[ &nbsp; ] DISTRIBUIDORA</div>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ padding: '6px 8px', height: '150px', verticalAlign: 'top' }}>
                <strong>DESCRIPCIÓN DE LA FALLA O NECESIDAD:</strong>
                <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>(Detalle el problema actual o el motivo por el cual requiere el servicio)</div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} style={{ padding: '6px 8px', height: '150px', verticalAlign: 'top' }}>
                <strong>ALCANCE ESPERADO DEL SERVICIO:</strong>
                <div style={{ color: '#666', fontSize: '8px', marginTop: '2px' }}>(Qué espera que realice exactamente el contratista o proveedor)</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 3. SUGERENCIA DE PROVEEDOR (Opcional) */}
        <table className="w-full border-collapse mb-3 custom-table">
          <tbody>
            <tr>
              <td colSpan={2} style={{ fontWeight: 'bold', backgroundColor: '#f1f5f9', fontSize: '10px', padding: '4px 6px', color: '#1b294a' }}>
                3. SUGERENCIA DE PROVEEDOR (Opcional)
              </td>
            </tr>
            <tr style={{ height: '65px' }}>
              <td style={{ width: '50%', padding: '6px 8px', verticalAlign: 'top' }}>
                <strong>PROVEEDOR SUGERIDO:</strong>
              </td>
              <td style={{ width: '50%', padding: '6px 8px', verticalAlign: 'top' }}>
                <strong>CONTACTO / TELÉFONO:</strong>
              </td>
            </tr>
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
      </div>
    </>
  );
};
