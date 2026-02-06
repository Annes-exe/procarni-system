import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface SaveComparisonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  isSaving: boolean;
  initialName?: string;
}

const SaveComparisonDialog: React.FC<SaveComparisonDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  isSaving,
  initialName = '',
}) => {
  const [name, setName] = useState(initialName);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [isOpen, initialName]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Guardar Comparación</DialogTitle>
          <DialogDescription>
            Asigna un nombre a esta comparación de cotizaciones para poder editarla o consultarla más tarde.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="comparisonName">Nombre de la Comparación *</Label>
            <Input
              id="comparisonName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Comparación Semanal Pollo"
              disabled={isSaving}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !name.trim()}
            className="bg-procarni-secondary hover:bg-green-700"
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
            ) : (
              'Guardar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveComparisonDialog;