"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DialogFooter } from '@/components/ui/dialog';
import { Check, ChevronsUpDown, Loader2, Plus, X, PlusCircle, Info, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllMaterials, searchMaterials } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { validateRif } from '@/utils/validators';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { VENEZUELAN_MUNICIPALITIES_FLAT } from '@/constants/venezuela-locations';
import { detectLocation } from '@/utils/location-detector';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { m, AnimatePresence } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { rectIntersection, closestCorners } from '@dnd-kit/core';

// --- Sub-componentes para DND ---

interface DroppableZoneProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

const DroppableZone = ({ id, children, className }: DroppableZoneProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      className={cn(className, isOver && "ring-2 ring-procarni-secondary ring-inset bg-procarni-secondary/5")}
    >
      {children}
    </div>
  );
};

interface DraggableItemProps {
  id: string;
  name: string;
  category?: string;
  code?: string;
  specification?: string;
  onSpecificationChange?: (val: string) => void;
  onRemove?: () => void;
  onClick?: () => void;
  isOverlay?: boolean;
  type: 'available' | 'selected';
  disabled?: boolean;
}

interface DraggableItemProps {
  id: string;
  name: string;
  category?: string;
  code?: string;
  specification?: string;
  onSpecificationChange?: (val: string) => void;
  onRemove?: () => void;
  onClick?: () => void;
  isOverlay?: boolean;
  type: 'available' | 'selected';
  disabled?: boolean;
}

const DraggableMaterialItem = ({ 
  id, 
  name, 
  category, 
  code, 
  specification, 
  onSpecificationChange, 
  onRemove,
  onClick,
  isOverlay,
  type,
  disabled
}: DraggableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  const handleItemClick = (e: React.MouseEvent) => {
    // Si estamos arrastrando, no disparamos el click
    if (isDragging) return;
    if (onClick) onClick();
  };

  const content = (
    <div 
      className={cn(
        "p-2 mb-2 bg-white border rounded-lg shadow-sm transition-all group relative",
        !disabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isOverlay ? "shadow-lg border-procarni-secondary pointer-events-none opacity-90" : "hover:border-procarni-secondary/50",
        type === 'selected' ? "bg-white" : "bg-gray-50/50"
      )}
      onClick={handleItemClick}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[11px] text-procarni-dark truncate">{name}</div>
          <div className="text-[9px] text-muted-foreground truncate uppercase tracking-tighter">
            {code} {category && `• ${category}`}
          </div>
        </div>
        {!isOverlay && type === 'selected' && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 text-gray-400 hover:text-red-500 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        <div className="text-gray-300 group-hover:text-gray-400 transition-colors">
           <ChevronsUpDown className="h-3.5 w-3.5" />
        </div>
      </div>
      
      {type === 'selected' && onSpecificationChange && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <Input
            value={specification || ''}
            onChange={(e) => onSpecificationChange(e.target.value)}
            placeholder="Especificación..."
            className="h-7 text-[10px] bg-gray-50/30"
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {content}
    </div>
  );
};

interface DraggableGroupedItemProps {
  id: string; // material_id
  name: string;
  category?: string;
  code?: string;
  units: Array<{
    material_id: string;
    unit_id?: string | null;
    unit_name?: string | null;
    specification?: string;
  }>;
  onSpecificationChange: (key: string, val: string) => void;
  onRemoveUnit: (key: string) => void;
  onRemoveGroup: () => void;
  isOverlay?: boolean;
  disabled?: boolean;
}

const DraggableGroupedMaterialItem = ({
  id,
  name,
  category,
  code,
  units,
  onSpecificationChange,
  onRemoveUnit,
  onRemoveGroup,
  isOverlay,
  disabled
}: DraggableGroupedItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="mb-3">
      <div 
        className={cn(
          "bg-white border rounded-xl shadow-sm transition-all group overflow-hidden",
          !disabled ? "cursor-grab active:cursor-grabbing" : "",
          isOverlay ? "shadow-xl border-procarni-secondary opacity-90 scale-[1.02]" : "hover:border-procarni-secondary/30",
        )}
      >
        {/* Header del Grupo */}
        <div className="p-2.5 bg-gray-50/50 border-b flex justify-between items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[11px] text-procarni-dark flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-procarni-secondary" />
              {name}
            </div>
            <div className="text-[9px] text-muted-foreground truncate uppercase tracking-tighter ml-3.5">
              {category} {code && `• ${code}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-gray-300 hover:text-red-500 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveGroup();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
            <div className="text-gray-300">
               <ChevronsUpDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Unidades Anidadas */}
        <div className="p-2 space-y-2 bg-white">
          {units.map((u) => {
            const key = `${u.material_id}-${u.unit_id || ''}`;
            return (
              <div key={key} className="flex flex-col gap-1.5 p-2 rounded-lg bg-gray-50/30 border border-transparent hover:border-gray-200 transition-all group/unit">
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-bold text-procarni-secondary flex items-center gap-1.5">
                    <div className="px-1.5 py-0.5 rounded bg-procarni-secondary/10 border border-procarni-secondary/20">
                      {u.unit_name || 'N/A'}
                    </div>
                  </div>
                  {units.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-gray-300 hover:text-red-500 opacity-0 group-hover/unit:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveUnit(key);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={u.specification || ''}
                    onChange={(e) => onSpecificationChange(key, e.target.value)}
                    placeholder="Especificación para esta unidad..."
                    className="h-7 text-[10px] bg-white border-gray-100 focus:border-procarni-secondary/30"
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Esquema de validación - reestructurado para evitar problemas con ctx.parent
const supplierFormSchema = z.object({
  // El código se autogenera y no se gestiona en el formulario, por lo que se elimina de aquí.
  rif: z.string().min(1, 'RIF es requerido').refine((val) => validateRif(val) !== null, {
    message: 'Formato de RIF inválido. Ej: J123456789 o SR',
  }),
  name: z.string().min(1, 'Nombre es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')), // MODIFIED: Made optional
  phone_2: z.string().optional().or(z.literal('')),
  instagram: z.string().optional().or(z.literal('')),
  website: z.string().url('URL inválida. Ej: https://ejemplo.com').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  payment_terms: z.enum(['Contado', 'Crédito', 'Otro'], { message: 'Términos de pago son requeridos y deben ser Contado, Crédito u Otro.' }), // Opciones limitadas
  // Eliminamos las validaciones condicionales que dependen de ctx.parent
  custom_payment_terms: z.string().optional().nullable(),
  credit_days: z.number().min(0, 'Días de crédito no puede ser negativo').optional(),
  status: z.string().min(1, 'Estado es requerido'),
  materials: z.array(
    z.object({
      material_id: z.string().min(1, 'Material es requerido'),
      material_name: z.string().min(1, 'Nombre de material es requerido'),
      material_category: z.string().optional(),
      unit_id: z.string().optional().nullable(),
      unit_name: z.string().optional().nullable(),
      specification: z.string().optional(),
    })
  ).optional(),
  alert_comment: z.string().optional().nullable(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface SupplierFormProps {
  initialData?: {
    id?: string;
    code?: string;
    rif: string;
    name: string;
    email?: string;
    phone?: string;
    phone_2?: string;
    instagram?: string;
    website?: string;
    address?: string;
    city?: string | null;
    state?: string | null;
    payment_terms: 'Contado' | 'Crédito' | 'Otro';
    custom_payment_terms?: string | null;
    credit_days: number;
    status: string;
    alert_comment?: string | null;
    materials?: Array<{
      id?: string;
      material_id: string;
      unit_id?: string | null;
      specification?: string;
      materials?: {
        id: string;
        name: string;
        category?: string;
      };
      units_of_measure?: {
        id: string;
        name: string;
      };
    }>;
  };
  onSubmit: (data: SupplierFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

const SupplierForm = ({ initialData, onSubmit, onCancel, isSubmitting }: SupplierFormProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isMaterialCreationDialogOpen, setIsMaterialCreationDialogOpen] = useState(false); // NEW STATE

  const { data: allMaterials, isLoading: isLoadingMaterials, refetch: refetchMaterials } = useQuery({
    queryKey: ['materials'],
    queryFn: getAllMaterials,
  });

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: {
      rif: '',
      name: '',
      email: '',
      phone: '',
      phone_2: '',
      instagram: '',
      website: '',
      address: '',
      city: '',
      state: '',
      payment_terms: 'Contado',
      custom_payment_terms: '',
      credit_days: 0,
      status: 'Active', // Changed to English to match database constraint
      materials: [],
      alert_comment: '',
    },
  });

  const isMobile = useIsMobile();

  // --- DND Sensors ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Sensibilidad al arrastrar para no disparar clicks accidentales
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<any>(null);

  const currentMaterialsInForm = form.watch('materials') || [];
  const currentPaymentTerms = form.watch('payment_terms');
  const currentAddress = form.watch('address');

  useEffect(() => {
    if (currentAddress) {
      const { state: detectedState, city: detectedCity } = detectLocation(currentAddress);

      if (detectedState && form.getValues('state') !== detectedState) {
        form.setValue('state', detectedState, { shouldDirty: true });
      }
      if (detectedCity && form.getValues('city') !== detectedCity) {
        form.setValue('city', detectedCity, { shouldDirty: true });
      }
    }
  }, [currentAddress, form]);


  const currentSupplierId = initialData?.id;

  useEffect(() => {
    if (initialData) {
      const formattedMaterials = initialData.materials?.map(mat => ({
        material_id: mat.material_id,
        material_name: mat.materials?.name || '',
        material_category: mat.materials?.category || '',
        unit_id: mat.unit_id || null,
        unit_name: mat.units_of_measure?.name || '',
        specification: mat.specification || '',
      })) || [];

      form.reset({
        rif: initialData.rif?.startsWith('SR') ? 'SR' : (initialData.rif || ''),
        name: initialData.name || '',
        email: initialData.email || '',
        phone: initialData.phone || '',
        phone_2: initialData.phone_2 || '',
        instagram: initialData.instagram || '',
        website: initialData.website || '',
        address: initialData.address || '',
        city: initialData.city || '',
        state: initialData.state || '',
        payment_terms: initialData.payment_terms,
        custom_payment_terms: initialData.custom_payment_terms || '',
        credit_days: initialData.credit_days || 0,
        status: initialData.status || 'Active', // Changed to English
        materials: formattedMaterials,
        alert_comment: initialData.alert_comment || '',
      });
    } else {
      form.reset({
        rif: '',
        name: '',
        email: '',
        phone: '',
        phone_2: '',
        instagram: '',
        website: '',
        address: '',
        city: '',
        state: '',
        payment_terms: 'Contado',
        custom_payment_terms: '',
        credit_days: 0,
        status: 'Active', // Changed to English
        materials: [],
        alert_comment: '',
      });
    }
  }, [initialData, form]);

  const handleAddMaterial = (material: { id: string; name: string; category?: string; unit_id?: string; unit?: string }) => {
    const materialsArray = form.getValues('materials') || [];
    const key = `${material.id}-${material.unit_id || ''}`;
    
    if (materialsArray.some(m => `${m.material_id}-${m.unit_id || ''}` === key)) {
      showError('Este material con esta unidad ya está asociado al proveedor');
      return;
    }

    const newMaterialEntry = {
      material_id: material.id,
      material_name: material.name,
      material_category: material.category || '',
      unit_id: material.unit_id || null,
      unit_name: material.unit || '',
      specification: '',
    };

    form.setValue('materials', [...materialsArray, newMaterialEntry], { shouldDirty: true });
  };

  const handleMaterialCreatedFromDialog = (material: any) => {
    // 1. Add the newly created/associated material to the form state
    const materialsArray = form.getValues('materials') || [];
    const key = `${material.id}-${material.unit_id || ''}`;

    // Check if it was already added
    if (materialsArray.some(m => `${m.material_id}-${m.unit_id || ''}` === key)) {
      showError('El material con esta unidad ya estaba en la lista.');
      return;
    }

    const newMaterialEntry = {
      material_id: material.id,
      material_name: material.name,
      material_category: material.category || '',
      unit_id: material.unit_id || null,
      unit_name: material.unit || '', // material.unit usually contains the name in these dialogs
      specification: material.specification || '',
    };

    form.setValue('materials', [...materialsArray, newMaterialEntry], { shouldDirty: true });

    // 2. Since a new material might have been created, invalidate the general materials query
    refetchMaterials();
  };

  const handleRemoveMaterial = (key: string) => {
    const materialsArray = form.getValues('materials') || [];
    const updatedMaterials = materialsArray.filter(m => `${m.material_id}-${m.unit_id || ''}` !== key);
    form.setValue('materials', updatedMaterials, { shouldDirty: true });
  };

  const handleRemoveMaterialGroup = (materialId: string) => {
    const materialsArray = form.getValues('materials') || [];
    const updatedMaterials = materialsArray.filter(m => m.material_id !== materialId);
    form.setValue('materials', updatedMaterials, { shouldDirty: true });
  };

  const handleSpecificationChange = (key: string, specification: string) => {
    const materialsArray = form.getValues('materials') || [];
    const updatedMaterials = materialsArray.map(m =>
      `${m.material_id}-${m.unit_id || ''}` === key ? { ...m, specification } : m
    );
    form.setValue('materials', updatedMaterials, { shouldDirty: true });
  };

  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Search materials when searchTerm changes
  useEffect(() => {
    const search = async () => {
      // If searchTerm is empty, no need to search, but perhaps show a default list or empty
      if (!searchTerm.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const results = await searchMaterials(searchTerm);
        setSearchResults(results || []);
      } catch (error) {
        console.error('Error searching materials:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(search, 300);
    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const handleFormSubmit = (data: SupplierFormValues) => {
    let finalRif = validateRif(data.rif);
    if (!finalRif) {
      form.setError('rif', { message: 'Formato de RIF inválido.' });
      return;
    }

    if (finalRif === 'SR') {
      if (initialData?.rif?.startsWith('SR')) {
        finalRif = initialData.rif;
      } else {
        const invisibleSuffix = Date.now().toString().split('').map(d => String.fromCharCode(0x200B + (parseInt(d) % 3))).join('');
        finalRif = 'SR' + invisibleSuffix;
      }
    }

    // Validaciones manuales para campos condicionales
    if (data.payment_terms === 'Otro' && (!data.custom_payment_terms || data.custom_payment_terms.trim() === '')) {
      form.setError('custom_payment_terms', { message: 'Términos de pago personalizados son requeridos si el tipo es "Otro".' });
      return;
    }

    if (data.payment_terms === 'Crédito' && (data.credit_days === undefined || data.credit_days === null || data.credit_days <= 0)) {
      form.setError('credit_days', { message: 'Días de crédito son requeridos y deben ser mayores a 0 para términos de "Crédito".' });
      return;
    }

    // Asegurarse de que credit_days sea 0 si no es 'Crédito'
    // Asegurarse de que custom_payment_terms sea null si no es 'Otro'
    const finalData = {
      ...data,
      rif: finalRif,
      city: data.city || null,
      state: data.state || null,
      name: data.name.toUpperCase(), // Ensure name is uppercase before submission
      credit_days: data.payment_terms === 'Crédito' ? data.credit_days : 0,
      custom_payment_terms: data.payment_terms === 'Otro' ? data.custom_payment_terms : null,
    };
    onSubmit(finalData);
  };

  // --- DND Handlers ---
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    
    // Encontrar el item activo ya sea en resultados o en seleccionados
    const itemInResults = searchResults.find(m => m.id === active.id);
    const itemInSelected = currentMaterialsInForm.find(m => m.material_id === active.id);
    
    if (itemInResults) {
      setActiveItem({ ...itemInResults, type: 'available' });
    } else if (itemInSelected) {
      const materialUnits = currentMaterialsInForm.filter(m => m.material_id === itemInSelected.material_id);
      setActiveItem({ 
        id: itemInSelected.material_id, 
        material_id: itemInSelected.material_id,
        name: itemInSelected.material_name, 
        category: itemInSelected.material_category,
        units: materialUnits,
        type: 'selected' 
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveItem(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Caso 1: Agregar (Disponibles -> Seleccionados)
    if (activeItem?.type === 'available' && (overId === 'selected-zone' || currentMaterialsInForm.some(m => m.material_id === overId))) {
      const material = searchResults.find(m => m.id === activeId);
      if (material) {
        handleAddMaterial(material);
      }
    }
    
    // Caso 2: Quitar (Seleccionados -> Disponibles)
    if (activeItem?.type === 'selected' && (overId === 'available-zone' || searchResults.some(m => m.id === overId))) {
      handleRemoveMaterialGroup(activeId);
    }

    // Caso 3: Reordenar dentro de Seleccionados
    if (activeItem?.type === 'selected' && currentMaterialsInForm.some(m => m.material_id === overId)) {
      if (activeId !== overId) {
        // Obtenemos el orden de los IDs de materiales únicos
        const uniqueOrderedIds = Array.from(new Set(currentMaterialsInForm.map(m => m.material_id)));
        const oldIndex = uniqueOrderedIds.indexOf(activeId);
        const newIndex = uniqueOrderedIds.indexOf(overId);
        
        const reorderedIds = arrayMove(uniqueOrderedIds, oldIndex, newIndex);
        
        // Reconstruimos el array plano basado en el nuevo orden de materiales
        const newFlatArray: any[] = [];
        reorderedIds.forEach(mId => {
          const materialUnits = currentMaterialsInForm.filter(m => m.material_id === mId);
          newFlatArray.push(...materialUnits);
        });
        
        form.setValue('materials', newFlatArray, { shouldDirty: true });
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 items-start">
          
          {/* Columna Derecha: Materiales Asociados (DND) */}
          <div className="order-2 md:order-2 space-y-4">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-1 gap-4">
                
                {/* Zona de Búsqueda / Disponibles */}
                <DroppableZone 
                  id="available-zone"
                  className="p-4 bg-gray-50/50 border rounded-xl"
                >
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex justify-between items-center">
                    Buscador de Materiales
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px] bg-white border-dashed"
                      onClick={() => setIsMaterialCreationDialogOpen(true)}
                    >
                      <PlusCircle className="mr-1.5 h-3 w-3" /> Nuevo
                    </Button>
                  </h3>

                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        placeholder="Escribe para buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9 text-xs bg-white"
                      />
                      {(isLoadingMaterials || isSearching) && (
                        <div className="absolute right-3 top-2.5">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      )}
                    </div>

                    <div className="max-h-56 overflow-y-auto pr-1">
                      <SortableContext 
                        id="available-zone"
                        items={searchResults.map(m => m.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <AnimatePresence>
                          {searchResults.length > 0 ? (
                            searchResults.map((material) => (
                              <m.div
                                key={material.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                              >
                                <DraggableMaterialItem 
                                  id={material.id}
                                  name={material.name}
                                  category={material.category}
                                  code={material.code}
                                  type="available"
                                  onClick={() => handleAddMaterial(material)}
                                  disabled={isMobile}
                                />
                              </m.div>
                            ))
                          ) : searchTerm.trim() ? (
                            <div className="text-[11px] text-center text-muted-foreground py-10 bg-white/50 rounded-lg border border-dashed">
                              Sin coincidencias para "{searchTerm}"
                            </div>
                          ) : (
                            <div className="text-[11px] text-center text-gray-400 py-10 bg-white/30 rounded-lg border border-dashed flex flex-col items-center gap-2">
                              <Info className="h-4 w-4 opacity-30" />
                              Arrastra resultados aquí abajo para agregar
                            </div>
                          )}
                        </AnimatePresence>
                      </SortableContext>
                    </div>
                  </div>
                </DroppableZone>

                {/* Zona de Seleccionados / Drop Zone */}
                <DroppableZone 
                  id="selected-zone"
                  className={cn(
                    "p-4 border-2 rounded-xl transition-all min-h-[200px]",
                    activeId ? "border-procarni-secondary border-dashed" : "bg-white border-gray-100 shadow-inner"
                  )}
                >
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary mb-3 flex items-center gap-2">
                    <Check className="h-3.5 w-3.5" /> Vinculados al Proveedor
                    {currentMaterialsInForm.length > 0 && (
                      <span className="bg-procarni-secondary text-white px-1.5 py-0.5 rounded-full text-[9px]">
                        {currentMaterialsInForm.length}
                      </span>
                    )}
                  </h3>

                  <div className="space-y-1">
                      <SortableContext 
                        id="selected-zone"
                        items={Array.from(new Set(currentMaterialsInForm.map(m => m.material_id)))}
                        strategy={verticalListSortingStrategy}
                      >
                        <AnimatePresence>
                          {(() => {
                            const uniqueIds = Array.from(new Set(currentMaterialsInForm.map(m => m.material_id)));
                            return uniqueIds.length > 0 ? (
                              uniqueIds.map((mId) => {
                                const materialUnits = currentMaterialsInForm.filter(m => m.material_id === mId);
                                const first = materialUnits[0];
                                return (
                                  <m.div
                                    key={mId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                  >
                                    <DraggableGroupedMaterialItem 
                                      id={mId}
                                      name={first.material_name}
                                      category={first.material_category}
                                      units={materialUnits as any[]}
                                      onSpecificationChange={handleSpecificationChange}
                                      onRemoveUnit={handleRemoveMaterial}
                                      onRemoveGroup={() => handleRemoveMaterialGroup(mId)}
                                      disabled={isMobile}
                                    />
                                  </m.div>
                                );
                              })
                            ) : (
                              <div className="text-[11px] text-center text-gray-400 py-16 flex flex-col items-center gap-2">
                                <Plus className="h-6 w-6 opacity-10" />
                                Arrastra materiales aquí para seleccionarlos
                              </div>
                            );
                          })()}
                        </AnimatePresence>
                      </SortableContext>
                  </div>
                </DroppableZone>
              </div>

              {/* Overlay simple portado al body para evitar desfases por el Modal */}
              {!isMobile && createPortal(
                <DragOverlay adjustScale={false}>
                  {activeId && activeItem ? (
                    <div className="w-[300px] pointer-events-none z-[9999]">
                      {activeItem.type === 'selected' ? (
                        <DraggableGroupedMaterialItem 
                          id={activeItem.id}
                          name={activeItem.name}
                          category={activeItem.category}
                          units={activeItem.units}
                          onSpecificationChange={() => {}}
                          onRemoveUnit={() => {}}
                          onRemoveGroup={() => {}}
                          isOverlay
                        />
                      ) : (
                        <DraggableMaterialItem 
                          id={activeItem.id}
                          name={activeItem.name}
                          category={activeItem.category}
                          code={activeItem.code}
                          specification={activeItem.specification}
                          type={activeItem.type}
                          isOverlay
                        />
                      )}
                    </div>
                  ) : null}
                </DragOverlay>,
                document.body
              )}
            </DndContext>
          </div>


          {/* Columna Izquierda: Datos del Proveedor (en desktop) */}
          <div className="order-1 md:order-1 space-y-6">
            
            {/* Sección: Datos Básicos */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Identificación</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rif"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">RIF</FormLabel>
                      <FormControl>
                        <Input placeholder="J123456789" {...field} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Estado</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Active">Activo</SelectItem>
                          <SelectItem value="Inactive">Inactivo</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Nombre / Razón Social</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del proveedor" {...field} className="h-9" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Sección: Contacto */}
            <div className="space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Contacto</h4>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="proveedor@ejemplo.com" {...field} value={field.value || ''} className="h-9" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Teléfono Principal</FormLabel>
                      <FormControl>
                        <Input placeholder="0412-1234567" {...field} value={field.value || ''} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone_2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Teléfono Secundario</FormLabel>
                      <FormControl>
                        <Input placeholder="Opcional" {...field} value={field.value || ''} className="h-9" />
                      </FormControl>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Instagram</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400 h-4 w-4">@</span>
                        <Input placeholder="usuario" {...field} value={field.value || ''} className="h-9 pl-8" />
                      </div>
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Enlace (Sitio Web)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://ejemplo.com"
                        {...field}
                        value={field.value || ''}
                        className="h-9"
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>

            {/* Sección: Ubicación */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Ubicación</h4>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Dirección Fiscal</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Dirección completa..." {...field} value={field.value || ''} className="min-h-[80px] resize-none" />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs">Ciudad / Municipio</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between h-9 text-xs font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value
                              ? VENEZUELAN_MUNICIPALITIES_FLAT.find(
                                  (m) => m.city === field.value && m.state === form.getValues('state')
                                )?.label || field.value
                              : "Seleccionar ciudad..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar ciudad o estado..." />
                          <CommandList className="max-h-48">
                            <CommandEmpty>No se encontró la ciudad.</CommandEmpty>
                            <CommandGroup>
                              {VENEZUELAN_MUNICIPALITIES_FLAT.map((m) => (
                                <CommandItem
                                  value={m.label}
                                  key={`${m.city}-${m.state}`}
                                  className="text-xs"
                                  onSelect={() => {
                                    form.setValue("city", m.city);
                                    form.setValue("state", m.state);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-3.5 w-3.5",
                                      m.city === field.value && m.state === form.getValues('state')
                                        ? "opacity-100"
                                        : "opacity-0"
                                      )}
                                  />
                                  {m.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
              <p className="text-[10px] text-muted-foreground italic">La ubicación se detecta automáticamente al escribir la dirección.</p>
            </div>

            {/* Sección: Términos y Pagos */}
            <div className="space-y-4 pt-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-procarni-secondary border-l-2 border-procarni-secondary pl-2">Pago y Comentarios</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Términos de Pago</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Términos" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Contado">Contado</SelectItem>
                          <SelectItem value="Crédito">Crédito</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />

                {currentPaymentTerms === 'Crédito' && (
                  <FormField
                    control={form.control}
                    name="credit_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Días de Crédito</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="Ej: 30"
                            className="h-9"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}

                {currentPaymentTerms === 'Otro' && (
                  <FormField
                    control={form.control}
                    name="custom_payment_terms"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Pago Personalizado</FormLabel>
                        <FormControl>
                          <Input placeholder="Describa los términos" {...field} value={field.value || ''} className="h-9" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name="alert_comment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-procarni-alert flex items-center gap-2">
                      <Info className="h-3 w-3" /> Aviso Especial
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Aviso que aparecerá al seleccionar este proveedor..."
                        className="bg-red-50/10 border-procarni-alert/30 focus:border-procarni-alert min-h-[100px] text-xs resize-none"
                        {...field}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage className="text-[10px]" />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t gap-2 flex-col sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting} className="h-10">
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="h-10 bg-procarni-secondary hover:bg-green-700 sm:min-w-[120px]">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </DialogFooter>
      </form>

      <MaterialCreationDialog
        isOpen={isMaterialCreationDialogOpen}
        onClose={() => setIsMaterialCreationDialogOpen(false)}
        onMaterialCreated={handleMaterialCreatedFromDialog}
        supplierId={currentSupplierId}
        supplierName={initialData?.name}
      />
    </Form>
  );
};

export default SupplierForm;