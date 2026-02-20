import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { MadeWithDyad } from '@/components/made-with-dyad';
import PinConfirmationDialog from '@/components/PinConfirmationDialog';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Settings = () => {
  const { session } = useSession();
  const navigate = useNavigate();
  const [startingNumber, setStartingNumber] = useState<number>(1);
  const [soStartingNumber, setSoStartingNumber] = useState<number>(1);
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [sequenceTypeToUpdate, setSequenceTypeToUpdate] = useState<'PO' | 'SO' | null>(null);

  const handleUpdateSequenceClick = (type: 'PO' | 'SO') => {
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión.');
      return;
    }
    setSequenceTypeToUpdate(type);
    setIsPinDialogOpen(true);
  };

  const handleConfirmSequenceUpdate = async (pin: string) => {
    if (!session || !sequenceTypeToUpdate) return;

    setIsConfirming(true);
    const isPO = sequenceTypeToUpdate === 'PO';
    const endpoint = isPO ? 'set-po-sequence' : 'set-so-sequence';
    const startNum = isPO ? startingNumber : soStartingNumber;
    const docName = isPO ? 'órdenes de compra' : 'órdenes de servicio';

    const toastId = showLoading(`Actualizando secuencia de ${docName}...`);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ startNumber: startNum, pin }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al actualizar la secuencia.');
      }

      const result = await response.json();
      dismissToast(toastId);
      showSuccess(result.message || 'Secuencia actualizada exitosamente.');
      setIsPinDialogOpen(false);
    } catch (error: any) {
      console.error('[Settings] Error updating sequence:', error);
      dismissToast(toastId);
      showError(error.message || 'Error desconocido al actualizar la secuencia.');
    } finally {
      setIsConfirming(false);
      setSequenceTypeToUpdate(null);
    }
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Configuración del Sistema</h1>
          <p className="text-muted-foreground text-sm">Configura los parámetros generales del sistema.</p>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardContent className="p-0 md:p-6 mt-4 md:mt-0">
          <div className="space-y-6">
            {/* Purchase Order Sequence */}
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4 text-procarni-primary">Secuencia de Órdenes de Compra</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configura el número inicial para la secuencia de órdenes de compra.
                Si ingresas 1, la secuencia se reiniciará y el próximo número será 1.
                Si ingresas un número mayor (ej. 5), el próximo número será ese.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startingNumber">Número inicial</Label>
                  <Input
                    id="startingNumber"
                    type="number"
                    min="1"
                    value={startingNumber}
                    onChange={(e) => setStartingNumber(parseInt(e.target.value) || 1)}
                    placeholder="1 para reiniciar, o un número mayor para iniciar desde allí"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => handleUpdateSequenceClick('PO')}
                  disabled={isConfirming}
                  className="bg-procarni-secondary hover:bg-green-700"
                >
                  {isConfirming && sequenceTypeToUpdate === 'PO' ? 'Actualizando...' : 'Actualizar Secuencia OC'}
                </Button>
              </div>
            </div>

            {/* Service Order Sequence */}
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4 text-procarni-primary">Secuencia de Órdenes de Servicio</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Configura el número inicial para la secuencia de órdenes de servicio.
                Si ingresas 1, la secuencia se reiniciará y el próximo número será 1.
                Si ingresas un número mayor (ej. 50), el próximo número será ese.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="soStartingNumber">Número inicial</Label>
                  <Input
                    id="soStartingNumber"
                    type="number"
                    min="1"
                    value={soStartingNumber}
                    onChange={(e) => setSoStartingNumber(parseInt(e.target.value) || 1)}
                    placeholder="1 para reiniciar, o un número mayor para iniciar desde allí"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => handleUpdateSequenceClick('SO')}
                  disabled={isConfirming}
                  className="bg-procarni-secondary hover:bg-green-700"
                >
                  {isConfirming && sequenceTypeToUpdate === 'SO' ? 'Actualizando...' : 'Actualizar Secuencia OS'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <MadeWithDyad />

      <PinConfirmationDialog
        isOpen={isPinDialogOpen}
        onClose={() => setIsPinDialogOpen(false)}
        onConfirm={handleConfirmSequenceUpdate}
        title={`Confirmar Actualización de Secuencia ${sequenceTypeToUpdate === 'PO' ? 'OC' : 'OS'}`}
        description={`Esta acción modificará la secuencia de las ${sequenceTypeToUpdate === 'PO' ? 'Órdenes de Compra' : 'Órdenes de Servicio'}. Introduce el PIN de 6 dígitos para autorizar.`}
        confirmText="Actualizar"
        isConfirming={isConfirming}
      />
    </div>
  );
};

export default Settings;