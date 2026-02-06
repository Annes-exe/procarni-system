import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';

const ResetDataButton = () => {
  const { session } = useSession();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión.');
      return;
    }

    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      showError('Por favor, introduce un PIN de 6 dígitos válido.');
      return;
    }

    setIsResetting(true);
    const loadingToastId = showLoading('Reiniciando datos y secuencias...');

    try {
      const response = await fetch(`https://sbmwuttfblpwwwpifmza.supabase.co/functions/v1/reset-data-and-sequences`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pin }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al reiniciar datos y secuencias.');
      }

      const result = await response.json();
      dismissToast(loadingToastId);
      showSuccess(result.message);
      setIsDialogOpen(false);
      setPin('');

      // Optionally, invalidate queries to refresh data in other components
      // queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      // queryClient.invalidateQueries({ queryKey: ['materials'] });
      // queryClient.invalidateQueries({ queryKey: ['supplierMaterials'] });

    } catch (error: any) {
      console.error('[ResetDataButton] Error:', error);
      dismissToast(loadingToastId);
      showError(error.message || 'Error desconocido al reiniciar datos.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        onClick={() => setIsDialogOpen(true)}
        disabled={isResetting}
        className="w-full"
      >
        Reiniciar Todos los Datos y Secuencias
      </Button>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente TODOS tus proveedores, materiales y sus relaciones.
              Además, reiniciará los correlativos de los códigos. Los nuevos proveedores comenzarán con P001
              y los materiales con MT001.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pin" className="text-right">
                PIN (6 dígitos)
              </Label>
              <Input
                id="pin"
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="col-span-3"
                disabled={isResetting}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={isResetting}>
              {isResetting ? 'Reiniciando...' : 'Reiniciar Todo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ResetDataButton;