import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { showError, showSuccess } from '@/utils/toast';
import { createMaterial, createSupplierMaterialRelation, searchMaterials } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { Material } from '@/integrations/supabase/types';
import { Loader2, Check } from 'lucide-react';

interface MaterialCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // onMaterialCreated returns the created material object plus the specification entered in the dialog
  onMaterialCreated: (material: Material & { specification?: string }) => void;
  // supplierId is now optional. If provided, association happens immediately.
  supplierId?: string;
  supplierName?: string; // Optional if supplierId is not provided
}

const MATERIAL_CATEGORIES = [
  'SECA', 'FRESCA', 'EMPAQUE', 'FERRETERIA Y CONSTRUCCION', 'AGROPECUARIA',
  'GASES Y COMBUSTIBLE', 'ELECTRICIDAD', 'REFRIGERACION', 'INSUMOS DE OFICINA',
  'INSUMOS INDUSTRIALES', 'MECANICA Y SELLOS', 'NEUMATICA', 'INSUMOS DE LIMPIEZA',
  'FUMICACION', 'EQUIPOS DE CARNICERIA', 'FARMACIA', 'MEDICION Y MANIPULACION',
  'ENCERADOS', 'PUBLICIDAD',
  'MAQUINARIA', // Nueva categoría
  'COMEDOR', // Nueva categoría
  'OPERACIONAL', // Nueva categoría
];

const MATERIAL_UNITS = [
  'KG', 'LT', 'ROL', 'PAQ', 'SACO', 'GAL', 'UND', 'MT', 'RESMA', 'PZA', 'TAMB', 'MILL', 'CAJA', 'PAR', 'BULTO'
];

const MaterialCreationDialog: React.FC<MaterialCreationDialogProps> = ({
  isOpen,
  onClose,
  onMaterialCreated,
  supplierId,
  supplierName,
}) => {
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [materialName, setMaterialName] = useState('');
  const [category, setCategory] = useState(MATERIAL_CATEGORIES[0]);
  const [unit, setUnit] = useState(MATERIAL_UNITS[0]);
  const [isExempt, setIsExempt] = useState(false);
  const [specification, setSpecification] = useState('');

  const [suggestedMaterial, setSuggestedMaterial] = useState<Material | null>(null); // Best match suggestion
  const [isCheckingExistence, setIsCheckingExistence] = useState(false);
  const debounceTimeoutRef = useRef<number | null>(null);

  const resetForm = () => {
    setMaterialName('');
    setCategory(MATERIAL_CATEGORIES[0]);
    setUnit(MATERIAL_UNITS[0]);
    setIsExempt(MATERIAL_CATEGORIES[0] === 'FRESCA'); // Default based on initial category
    setSpecification('');
    setSuggestedMaterial(null);
    setIsCheckingExistence(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Effect to enforce is_exempt=true when category is FRESCA
  useEffect(() => {
    if (category === 'FRESCA') {
      setIsExempt(true);
    } else {
      // Only reset if we are not currently loading a suggestion that might override it
      if (!suggestedMaterial) {
        setIsExempt(false);
      }
    }
  }, [category, suggestedMaterial]);

  // Logic to check for existing material as the user types (debounced check)
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const trimmedName = materialName.trim();

    if (trimmedName.length > 2) {
      setIsCheckingExistence(true);
      debounceTimeoutRef.current = setTimeout(async () => {
        try {
          const existingMaterials = await searchMaterials(trimmedName);

          if (existingMaterials.length > 0) {
            // Use the first result as the best suggestion
            const bestMatch = existingMaterials[0];
            setSuggestedMaterial(bestMatch);

            // If the match is exact, pre-fill fields immediately
            if (bestMatch.name.toUpperCase() === trimmedName.toUpperCase()) {
              setCategory(bestMatch.category || MATERIAL_CATEGORIES[0]);
              setUnit(bestMatch.unit || MATERIAL_UNITS[0]);
              // Use existing material's exemption status
              setIsExempt(bestMatch.is_exempt || false);
            } else {
              // If it's just a suggestion, keep current form values but show suggestion
              // We only reset fields if the user accepts the suggestion
            }
          } else {
            setSuggestedMaterial(null);
            // Reset fields to default if no match found, respecting FRESCA rule
            setCategory(MATERIAL_CATEGORIES[0]);
            setUnit(MATERIAL_UNITS[0]);
            setIsExempt(MATERIAL_CATEGORIES[0] === 'FRESCA');
          }
        } catch (e) {
          console.error("Error checking material existence:", e);
          setSuggestedMaterial(null);
        } finally {
          setIsCheckingExistence(false);
        }
      }, 500) as unknown as number;
    } else {
      setSuggestedMaterial(null);
      setIsCheckingExistence(false);
    }

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [materialName, isOpen]);

  const handleAcceptSuggestion = () => {
    if (suggestedMaterial) {
      setMaterialName(suggestedMaterial.name);
      setCategory(suggestedMaterial.category || MATERIAL_CATEGORIES[0]);
      setUnit(suggestedMaterial.unit || MATERIAL_UNITS[0]);
      setIsExempt(suggestedMaterial.is_exempt || false); // Use suggested material's exemption status
      setSuggestedMaterial(null); // Clear suggestion after acceptance
    }
  };

  const handleAddMaterial = async () => {
    if (!session?.user?.id) {
      showError('No hay sesión activa.');
      return;
    }

    const trimmedMaterialName = materialName.trim().toUpperCase(); // Ensure uppercase for saving
    if (!trimmedMaterialName) {
      showError('El nombre del material es requerido.');
      return;
    }

    setIsSubmitting(true);

    try {
      let materialToAssociate: Material | null = null;

      // 1. Check if the final name matches an existing material (case insensitive)
      const existingMaterials = await searchMaterials(trimmedMaterialName);
      const exactMatch = existingMaterials.find(m => m.name.toUpperCase() === trimmedMaterialName);

      // Determine final is_exempt status (forced true if FRESCA)
      const finalIsExempt = category === 'FRESCA' ? true : isExempt;

      if (exactMatch) {
        materialToAssociate = exactMatch;
        showSuccess(`Material existente "${materialToAssociate.name}" encontrado.`);
      } else {
        // 2. Create the new material
        const newMaterial = await createMaterial({
          name: trimmedMaterialName,
          category,
          unit,
          is_exempt: finalIsExempt, // Use the determined final status
          user_id: session.user.id,
          code: '', // Allow trigger to generate it
        });

        if (!newMaterial) {
          throw new Error('No se pudo crear el material.');
        }
        materialToAssociate = newMaterial;
        showSuccess('Material creado exitosamente.');
      }

      // 3. Associate the material with the supplier IF supplierId is provided
      if (supplierId && materialToAssociate) {
        const relationCreated = await createSupplierMaterialRelation({
          supplier_id: supplierId,
          material_id: materialToAssociate.id,
          specification: specification.trim() || undefined,
          user_id: session.user.id,
        });

        if (!relationCreated) {
          showError('Advertencia: La relación con el proveedor ya existía o falló la asociación.');
        } else {
          showSuccess(`Material "${materialToAssociate.name}" asociado con el proveedor exitosamente.`);
        }
      } else if (materialToAssociate) {
        showSuccess(`Material "${materialToAssociate.name}" creado.`);
      }

      // 4. Call the callback with the material data and specification
      if (materialToAssociate) {
        onMaterialCreated({
          ...materialToAssociate,
          specification: specification.trim(),
        });
      }

      handleClose();

    } catch (error: unknown) {
      console.error('[MaterialCreationDialog] Error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al crear/asociar el material.';
      showError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const dialogDescription = supplierId
    ? `Crea un nuevo material o asocia uno existente a ${supplierName ? <strong>{supplierName}</strong> : 'este proveedor'}.`
    : 'Crea un nuevo material. Si estás creando un nuevo proveedor, este material se asociará al guardar el formulario.';

  const isMaterialNameValid = materialName.trim().length > 0;
  const isExactMatch = suggestedMaterial && suggestedMaterial.name.toUpperCase() === materialName.trim().toUpperCase();
  const submitButtonText = isExactMatch ? 'Asociar Material' : 'Crear y Asociar';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Añadir Nuevo Material</DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="materialName">Nombre del Material *</Label>
            <Input
              id="materialName"
              placeholder="Ej: Pollo entero, Carne molida..."
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              disabled={isSubmitting}
            />

            {isCheckingExistence && (
              <p className="text-sm text-muted-foreground flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando sugerencias...
              </p>
            )}

            {suggestedMaterial && !isCheckingExistence && (
              <div className="flex items-center justify-between p-2 border rounded-md bg-blue-50 dark:bg-blue-900/20">
                <p className="text-sm text-blue-600 dark:text-blue-300">
                  {isExactMatch ? 'Material existente:' : 'Material sugerido:'} <strong>{suggestedMaterial.name}</strong>
                </p>
                {!isExactMatch && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAcceptSuggestion}
                    className="h-8"
                  >
                    <Check className="mr-1 h-4 w-4" /> Usar
                  </Button>
                )}
              </div>
            )}

            {!isExactMatch && isMaterialNameValid && !isCheckingExistence && !suggestedMaterial && (
              <p className="text-sm text-yellow-600">
                Material nuevo: <strong>{materialName.toUpperCase()}</strong>. Se creará al guardar.
              </p>
            )}
          </div>

          {/* Fields for new material creation or viewing existing material details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Categoría</Label>
              <Select value={category} onValueChange={setCategory} disabled={isSubmitting || isExactMatch}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Selecciona categoría" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {MATERIAL_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unit">Unidad</Label>
              <Select value={unit} onValueChange={setUnit} disabled={isSubmitting || isExactMatch}>
                <SelectTrigger id="unit">
                  <SelectValue placeholder="Selecciona unidad" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto">
                  {MATERIAL_UNITS.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>Exento de IVA</Label>
              <p className="text-sm text-muted-foreground">
                Marcar si este material no debe incluir IVA.
              </p>
            </div>
            <Switch
              checked={isExempt}
              onCheckedChange={setIsExempt}
              disabled={isSubmitting || isExactMatch || category === 'FRESCA'}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="specification">Especificación (Opcional)</Label>
            <Input
              id="specification"
              placeholder="Ej: Presentación de 10kg, Marca X..."
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleAddMaterial} disabled={isSubmitting || !isMaterialNameValid || isCheckingExistence}>
            {isSubmitting ? 'Guardando...' : submitButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialCreationDialog;