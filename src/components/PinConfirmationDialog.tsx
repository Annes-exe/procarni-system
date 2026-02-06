import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError } from '@/utils/toast';

interface PinConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (pin: string) => void;
  title: string;
  description: string;
  confirmText: string;
  isConfirming: boolean;
}

const PinConfirmationDialog: React.FC<PinConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  isConfirming,
}) => {
  const [pin, setPin] = useState('');

  const handleConfirm = () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      showError('Por favor, introduce un PIN de 6 dígitos válido.');
      return;
    }
    onConfirm(pin);
    setPin(''); // Clear PIN after attempt
  };

  const handleCancel = () => {
    setPin('');
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
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
              disabled={isConfirming}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isConfirming}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? 'Verificando...' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PinConfirmationDialog;