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
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleUpdateSequenceClick = () => {
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión.');
      return;
    }
    setIsPinDialogOpen(true);
  };

  const handleConfirmSequenceUpdate = async (pin: string) => {
    if (!session) return;

    setIsConfirming(true);
    const toastId = showLoading('Actualizando secuencia de órdenes de compra...');

    try {
      const response = await fetch(
        `https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/set-po-sequence`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ startNumber: startingNumber, pin }),
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
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Configuración del Sistema</CardTitle>
          <CardDescription>
            Configura los parámetros generales del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="border p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Secuencia de Órdenes de Compra</h3>
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
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button 
                  onClick={handleUpdateSequenceClick} 
                  disabled={isConfirming}
                  className="bg-procarni-secondary hover:bg-green-700"
                >
                  {isConfirming ? 'Actualizando...' : 'Actualizar Secuencia'}
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
        title="Confirmar Actualización de Secuencia"
        description="Esta acción modificará la secuencia de órdenes de compra. Introduce el PIN de 6 dígitos para autorizar."
        confirmText="Actualizar"
        isConfirming={isConfirming}
      />
    </div>
  );
};

export default Settings;