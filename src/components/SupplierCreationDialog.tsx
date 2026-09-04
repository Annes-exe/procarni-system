import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import SupplierForm from '@/components/SupplierForm';
import { createSupplier } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import { Supplier } from '@/integrations/supabase/types';

interface SupplierCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSupplierCreated: (supplier: Supplier) => void;
}

const SupplierCreationDialog: React.FC<SupplierCreationDialogProps> = ({
  isOpen,
  onClose,
  onSupplierCreated,
}) => {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitForm = async (data: any) => {
    if (!session?.user?.id) {
      showError('Usuario no autenticado. No se puede realizar la operación.');
      return;
    }

    setIsSubmitting(true);
    try {
      const { materials, ...supplierData } = data;
      const materialsPayload = materials?.map((mat: any) => ({
        material_id: mat.material_id,
        specification: mat.specification,
        unit_id: mat.unit_id,
      })) || [];

      const newSupplier = await createSupplier(
        { ...supplierData, user_id: session.user.id },
        materialsPayload
      );

      if (newSupplier) {
        queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
        queryClient.invalidateQueries({ queryKey: ['allSuppliers'] });
        showSuccess(`Proveedor "${newSupplier.name}" creado exitosamente.`);
        onSupplierCreated(newSupplier as Supplier);
        onClose();
      }
    } catch (error: any) {
      console.error('[SupplierCreationDialog] Error:', error);
      showError(error.message || 'Error al crear el proveedor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px] md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-procarni-dark">Añadir Nuevo Proveedor</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Completa los campos para registrar un nuevo proveedor en el sistema.
          </DialogDescription>
        </DialogHeader>

        <SupplierForm
          onSubmit={handleSubmitForm}
          onCancel={onClose}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SupplierCreationDialog;