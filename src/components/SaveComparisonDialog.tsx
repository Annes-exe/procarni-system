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
      <DialogContent className="sm:max-w-[425px] flex flex-col p-4 sm:p-6 overflow-hidden bg-gray-50 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="text-left bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative">
          <div className="absolute top-0 left-0 w-1 rounded-l-xl h-full bg-procarni-secondary/80"></div>
          <DialogTitle className="text-xl font-bold text-procarni-dark pl-2">Guardar Comparación</DialogTitle>
          <DialogDescription className="text-sm pl-2 mt-1">
            Asigna un nombre a esta comparación de cotizaciones para poder editarla o consultarla más tarde.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-2">
          <div className="grid gap-2">
            <Label htmlFor="comparisonName" className="font-semibold text-gray-700">Nombre de la Comparación <span className="text-red-500">*</span></Label>
            <Input
              id="comparisonName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Comparación Semanal Pollo"
              disabled={isSaving}
              className="h-10 border-gray-200 focus:border-procarni-secondary focus:ring-procarni-secondary/20 shadow-sm rounded-xl transition-all"
            />
          </div>
        </div>
        <DialogFooter className="mt-2 text-right flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving} className="w-full sm:w-auto bg-white hover:bg-gray-50 transition-colors">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="w-full sm:w-auto bg-procarni-secondary hover:bg-green-700 shadow-sm transition-all"
          >
            {isSaving ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...</>
            ) : (
              'Guardar Comparación'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveComparisonDialog;