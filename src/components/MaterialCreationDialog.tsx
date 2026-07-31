import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { showError, showSuccess } from '@/utils/toast';
import { createMaterial, createSupplierMaterialRelation, searchMaterials, getMaterialByName, getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { useQuery } from '@tanstack/react-query';
import { Material, MaterialCategory } from '@/integrations/supabase/types';
import { UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import { Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SmartSearch from '@/components/SmartSearch';

interface MaterialCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // onMaterialCreated returns the created material object plus the specification entered in the dialog
  onMaterialCreated: (material: Material & { specification?: string }) => void;
  // supplierId is now optional. If provided, association happens immediately.
  supplierId?: string;
  supplierName?: string; // Optional if supplierId is not provided
  initialName?: string; // Optional: pre-fill material name
  hideNameProvided?: boolean; // NEW: optional flag to hide name_provided field
  editingMaterial?: Material | null; // NEW
}



const MaterialCreationDialog: React.FC<MaterialCreationDialogProps> = ({
  isOpen,
  onClose,
  onMaterialCreated,
  supplierId,
  supplierName,
  initialName,
  hideNameProvided = false,
  editingMaterial = null,
}) => {
  const { session, role } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: units = [], isLoading: isLoadingUnits } = useQuery<UnitOfMeasure[]>({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const { data: categories = [], isLoading: isLoadingCategories } = useQuery<MaterialCategory[]>({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  const [materialName, setMaterialName] = useState(initialName || '');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [isExempt, setIsExempt] = useState(false);
  const [specification, setSpecification] = useState('');

  // Nuevos campos
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedParentName, setSelectedParentName] = useState<string>('');
  const [nameProvided, setNameProvided] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [brand, setBrand] = useState<string>('');

  // Special structured name states (TRIPAS, BOLSAS, TERMOFORMADO)
  const [specialStructure, setSpecialStructure] = useState<'NONE' | 'TRIPAS' | 'BOLSAS_TERMO'>('NONE');
  
  // TRIPAS states
  const [tripaTipo, setTripaTipo] = useState<string>('PLASTICA');
  const [tripaMedida, setTripaMedida] = useState<string>('');
  const [tripaColor, setTripaColor] = useState<string>('');
  const [tripaMetros, setTripaMetros] = useState<string>('');
  const [tripaVariaciones, setTripaVariaciones] = useState<string[]>([]);

  // BOLSAS & TERMOFORMADO states
  const [btPrefix, setBtPrefix] = useState<string>('BOLSAS');
  const [btTipo, setBtTipo] = useState<string>('AL VACIO');
  const [btVariaciones, setBtVariaciones] = useState<string[]>([]);
  const [btMedidaValor, setBtMedidaValor] = useState<string>('');
  const [btMedidaUnidad, setBtMedidaUnidad] = useState<string>('CM');
  const [btColor, setBtColor] = useState<string>('');
  const [btMicra, setBtMicra] = useState<string>('');
  const [btUso, setBtUso] = useState<string>('');

  const [suggestedMaterial, setSuggestedMaterial] = useState<Material | null>(null); // Best match suggestion
  const [isCheckingExistence, setIsCheckingExistence] = useState(false);
  const debounceTimeoutRef = useRef<number | null>(null);
  const lastAutofilledRef = useRef<{ category: string; prefix: 'tripa' | 'bolsa' | 'other' | null }>({ category: '', prefix: null });

  const resetForm = () => {
    setMaterialName('');
    setCategory(categories[0]?.name || '');
    setUnit(units[0]?.id || '');
    setIsExempt((categories[0]?.name || '') === 'FRESCA'); // Default based on initial category
    setSpecification('');
    setSuggestedMaterial(null);
    setIsCheckingExistence(false);
    setSelectedParentId('');
    setSelectedParentName('');
    setNameProvided('');
    setColor('');
    setBrand('');
    setSpecialStructure('NONE');
    setTripaTipo('PLASTICA');
    setTripaMedida('');
    setTripaColor('');
    setTripaMetros('');
    setTripaVariaciones([]);
    setBtPrefix('BOLSAS');
    setBtTipo('AL VACIO');
    setBtVariaciones([]);
    setBtMedidaValor('');
    setBtMedidaUnidad('CM');
    setBtColor('');
    setBtMicra('');
    setBtUso('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      if (editingMaterial) {
        setMaterialName(editingMaterial.name || '');
        setCategory(editingMaterial.category || '');
        
        // Find matching unit id by unit name
        const matchedUnit = units.find(u => u.name === editingMaterial.unit);
        setUnit(matchedUnit?.id || editingMaterial.unit_id || '');
        
        setIsExempt(editingMaterial.is_exempt || false);
        setSelectedParentId(editingMaterial.base_material_id || '');
        
        // Fetch parent name if exists
        if (editingMaterial.base_material_id) {
          supabase
            .from('materials')
            .select('name')
            .eq('id', editingMaterial.base_material_id)
            .single()
            .then(({ data }) => {
              if (data) setSelectedParentName(data.name);
            });
        } else {
          setSelectedParentName('');
        }
        
        setColor(editingMaterial.color || '');
        setBrand(editingMaterial.brand || '');
        setNameProvided(editingMaterial.search_aliases && editingMaterial.search_aliases.length > 0 ? editingMaterial.search_aliases[0] : '');

        // Parse structured name if editing an existing material (TRIPAS, BOLSAS, TERMOFORMADO)
        if (editingMaterial.name && editingMaterial.name.toUpperCase().startsWith('TRIPAS')) {
          setSpecialStructure('TRIPAS');
          const nameUpper = editingMaterial.name.toUpperCase();
          
          // 1. Parse Tipo (without TIMBRADA)
          const tipos = ['PLASTICA', 'CELULOSA', 'FIBROSA', 'COLAGENO', 'CERO MERMA'];
          const foundTipo = tipos.find(t => nameUpper.includes(t));
          if (foundTipo) setTripaTipo(foundTipo);

          // 2. Parse Medida
          const medidaMatch = nameUpper.match(/(\S+)\s+CM/);
          if (medidaMatch) setTripaMedida(medidaMatch[1]);

          // 3. Parse Metros
          const metrosMatch = nameUpper.match(/\(METROS\s+X\s+CAJA:\s*([^\s)]+)\s*MT\)/);
          if (metrosMatch) setTripaMetros(metrosMatch[1]);

          // 4. Parse Variaciones (multiple: CORRUGADA, LISA, TIMBRADA)
          const tripaVars = ['CORRUGADA', 'LISA', 'TIMBRADA'];
          const foundTripaVars = tripaVars.filter(v => nameUpper.includes(v));
          setTripaVariaciones(foundTripaVars);

          // 5. Parse Color (extract remaining words)
          let remaining = nameUpper.replace('TRIPAS', '');
          if (foundTipo) remaining = remaining.replace(foundTipo, '');
          if (medidaMatch) remaining = remaining.replace(medidaMatch[0], '');
          if (metrosMatch) remaining = remaining.replace(metrosMatch[0], '');
          foundTripaVars.forEach(v => {
            remaining = remaining.replace(v, '');
          });
          
          const cleanRemaining = remaining.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
          setTripaColor(cleanRemaining);
        } else if (editingMaterial.name && (editingMaterial.name.toUpperCase().startsWith('BOLSAS') || editingMaterial.name.toUpperCase().startsWith('TERMOFORMADO'))) {
          setSpecialStructure('BOLSAS_TERMO');
          const nameUpper = editingMaterial.name.toUpperCase();
          
          // 1. Parse Prefix
          const isTermo = nameUpper.startsWith('TERMOFORMADO');
          setBtPrefix(isTermo ? 'TERMOFORMADO' : 'BOLSAS');

          // 2. Parse Tipo
          const btTipos = ['AL VACIO', 'TERMOENCOGIBLES', 'PARA BULTOS', 'CON ASAS', 'PARA CESTAS'];
          const foundBtTipo = btTipos.find(t => nameUpper.includes(t));
          if (foundBtTipo) setBtTipo(foundBtTipo);

          // 3. Parse Variaciones
          const btVars = ['ALTA BARRERA', 'GRIP AND TEAR', 'RESPIRABLE S/BARRERA', 'TIMBRADA'];
          const foundBtVars = btVars.filter(v => nameUpper.includes(v));
          setBtVariaciones(foundBtVars);

          // 4. Parse Medida
          const btMedidaMatch = nameUpper.match(/(\S+)\s+(CM|IN|KG)/);
          if (btMedidaMatch) {
            setBtMedidaValor(btMedidaMatch[1]);
            setBtMedidaUnidad(btMedidaMatch[2]);
          }

          // 5. Parse Micras
          const micraMatch = nameUpper.match(/\(MICRA:\s*([^\s)]+)\s*UM\)/);
          if (micraMatch) setBtMicra(micraMatch[1]);

          // 6. Parse Uso
          const usoMatch = nameUpper.match(/\(USO:\s*([^)]+)\)/);
          if (usoMatch) setBtUso(usoMatch[1]);

          // 7. Parse Color
          let remaining = nameUpper.replace('BOLSAS', '').replace('TERMOFORMADO', '');
          if (foundBtTipo) remaining = remaining.replace(foundBtTipo, '');
          foundBtVars.forEach(v => {
            remaining = remaining.replace(v, '');
          });
          if (btMedidaMatch) remaining = remaining.replace(btMedidaMatch[0], '');
          if (micraMatch) remaining = remaining.replace(micraMatch[0], '');
          if (usoMatch) remaining = remaining.replace(usoMatch[0], '');

          const cleanRemaining = remaining.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
          setBtColor(cleanRemaining);
        } else {
          setSpecialStructure('NONE');
        }
      } else {
        resetForm();
        if (initialName) {
          setMaterialName(initialName);
        }
      }
    }
  }, [isOpen, editingMaterial, units]);

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
  }, [category, suggestedMaterial, units]);

  // Auto-compile TRIPAS name based on structured fields (without parentheses, omitting empty/blank values)
  useEffect(() => {
    if (specialStructure === 'TRIPAS' && category === 'EMPAQUE') {
      const parts: string[] = ['TRIPAS'];

      if (tripaTipo) {
        parts.push(tripaTipo.toUpperCase().trim());
      }

      const cleanMedida = tripaMedida.toUpperCase().replace(/\s/g, '').trim();
      if (cleanMedida) {
        parts.push(`${cleanMedida} CM`);
      }

      const cleanColor = tripaColor.toUpperCase().trim();
      if (cleanColor) {
        parts.push(cleanColor);
      }

      const cleanMetros = tripaMetros.toUpperCase().replace(/\s/g, '').trim();
      if (cleanMetros) {
        parts.push(`(METROS X CAJA: ${cleanMetros} MT)`);
      }

      if (tripaVariaciones.length > 0) {
        parts.push(tripaVariaciones.map(v => v.toUpperCase().trim()).join(' '));
      }

      const compiledName = parts.join(' ');
      setMaterialName(compiledName);
    }
  }, [specialStructure, tripaTipo, tripaMedida, tripaColor, tripaMetros, tripaVariaciones, category]);

  // Auto-compile BOLSAS & TERMOFORMADO name based on structured fields (without parentheses, omitting empty/blank values)
  useEffect(() => {
    if (specialStructure === 'BOLSAS_TERMO' && category === 'EMPAQUE') {
      const parts: string[] = [btPrefix];

      if (btTipo) {
        parts.push(btTipo.toUpperCase().trim());
      }

      const cleanMedida = btMedidaValor.toUpperCase().replace(/\s/g, '').trim();
      if (cleanMedida) {
        parts.push(`${cleanMedida} ${btMedidaUnidad}`);
      }

      const cleanColor = btColor.toUpperCase().trim();
      if (cleanColor) {
        parts.push(cleanColor);
      }

      const cleanMicra = btMicra.toUpperCase().replace(/\s/g, '').trim();
      if (cleanMicra) {
        parts.push(`(MICRA: ${cleanMicra} UM)`);
      }

      const cleanUso = btUso.toUpperCase().trim();
      if (cleanUso) {
        parts.push(`(USO: ${cleanUso})`);
      }

      // Move variation to the absolute end of the name
      if (btVariaciones.length > 0) {
        parts.push(btVariaciones.map(v => v.toUpperCase().trim()).join(' '));
      }

      const compiledName = parts.join(' ');
      setMaterialName(compiledName);
    }
  }, [specialStructure, btPrefix, btTipo, btVariaciones, btMedidaValor, btMedidaUnidad, btColor, btMicra, btUso, category]);

  // Automatically enable TRIPAS or BOLSAS/TERMO UI when category is EMPAQUE and item is new or is already structured
  useEffect(() => {
    if (category === 'EMPAQUE') {
      if (editingMaterial) {
        if (editingMaterial.name?.toUpperCase().startsWith('TRIPAS')) {
          setSpecialStructure('TRIPAS');
        } else if (editingMaterial.name?.toUpperCase().startsWith('BOLSAS') || editingMaterial.name?.toUpperCase().startsWith('TERMOFORMADO')) {
          setSpecialStructure('BOLSAS_TERMO');
        }
      } else {
        if (specialStructure === 'NONE') {
          setSpecialStructure('TRIPAS');
        }
      }
    } else {
      setSpecialStructure('NONE');
    }
  }, [category, editingMaterial]);

  // Effect to automatically pre-select unit and category based on category and materialName
  useEffect(() => {
    if (editingMaterial) return;

    const trimmedName = materialName.trim();
    const nameUpper = trimmedName.toUpperCase();

    // 1. Auto-select category based on name prefix
    let targetCategory = category;
    if (nameUpper.startsWith('TRIPA') || nameUpper.startsWith('BOLSA')) {
      const empCategory = categories.find(c => c.name.toUpperCase() === 'EMPAQUE');
      if (empCategory && category !== empCategory.name && (category === '' || category === (categories[0]?.name || ''))) {
        setCategory(empCategory.name);
        targetCategory = empCategory.name;
      }
    }

    const categoryUpper = targetCategory?.toUpperCase() || '';
    
    let currentPrefix: 'tripa' | 'bolsa' | 'other' = 'other';
    if (nameUpper.startsWith('TRIPA')) currentPrefix = 'tripa';
    else if (nameUpper.startsWith('BOLSA')) currentPrefix = 'bolsa';

    // Only run unit autofill if category or prefix changed from our last autofill
    if (
      lastAutofilledRef.current.category === categoryUpper &&
      lastAutofilledRef.current.prefix === currentPrefix
    ) {
      return;
    }

    let targetUnitName = '';

    if (categoryUpper === 'SECA' || categoryUpper === 'FRESCA') {
      targetUnitName = 'KG';
    } else if (categoryUpper === 'EMPAQUE') {
      if (currentPrefix === 'tripa') {
        targetUnitName = 'MT';
      } else if (currentPrefix === 'bolsa') {
        targetUnitName = 'UND';
      }
    } else if (categoryUpper) {
      targetUnitName = 'UND';
    }

    if (targetUnitName && units.length > 0) {
      const foundUnit = units.find(u => u.name.toUpperCase() === targetUnitName);
      if (foundUnit) {
        setUnit(foundUnit.id);
        // Record this autofill to prevent loops or overriding manual changes
        lastAutofilledRef.current = { category: categoryUpper, prefix: currentPrefix };
      }
    }
  }, [category, materialName, units, categories, editingMaterial]);

  // Restrict units based on selected category
  const filteredUnits = React.useMemo(() => {
    if (!category) return units;
    const catUpper = category.toUpperCase();
    if (catUpper === 'SECA') {
      return units.filter(u => ['KG', 'LT', 'GR'].includes(u.name.toUpperCase()));
    }
    if (catUpper === 'FRESCA') {
      return units.filter(u => ['KG'].includes(u.name.toUpperCase()));
    }
    if (catUpper === 'EMPAQUE') {
      return units.filter(u => ['MT', 'UND'].includes(u.name.toUpperCase()));
    }
    return units;
  }, [category, units]);

  // Adjust unit if category changes and the current unit is not allowed
  useEffect(() => {
    if (!category || units.length === 0) return;
    const catUpper = category.toUpperCase();
    const currentUnitObj = units.find(u => u.id === unit);
    if (!currentUnitObj) return;

    const currentUnitName = currentUnitObj.name.toUpperCase();
    let allowedNames: string[] = [];
    if (catUpper === 'SECA') allowedNames = ['KG', 'LT', 'GR'];
    else if (catUpper === 'FRESCA') allowedNames = ['KG'];
    else if (catUpper === 'EMPAQUE') allowedNames = ['MT', 'UND'];

    if (allowedNames.length > 0 && !allowedNames.includes(currentUnitName)) {
      let defaultUnitName = allowedNames[0];
      if (catUpper === 'EMPAQUE') {
        const nameUpper = materialName.toUpperCase();
        if (nameUpper.startsWith('TRIPA')) defaultUnitName = 'MT';
        else if (nameUpper.startsWith('BOLSA')) defaultUnitName = 'UND';
      }
      const found = units.find(u => u.name.toUpperCase() === defaultUnitName);
      if (found) {
        setUnit(found.id);
      } else {
        const fallback = units.find(u => allowedNames.includes(u.name.toUpperCase()));
        if (fallback) setUnit(fallback.id);
      }
    }
  }, [category, units, materialName]);

  // Logic to check for existing material as the user types (debounced check)
  useEffect(() => {
    if (!isOpen) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    const trimmedName = materialName.trim();

    if (trimmedName.length > 0) {
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
              setCategory(bestMatch.category || (categories[0]?.name || ''));
              setUnit(bestMatch.unit_id || (units[0]?.id || ''));
              // Use existing material's exemption status
              setIsExempt(bestMatch.is_exempt || false);
            }
          } else {
            setSuggestedMaterial(null);
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
      setCategory(suggestedMaterial.category || (categories[0]?.name || ''));
      setUnit(suggestedMaterial.unit_id || (units[0]?.id || ''));
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
      const finalIsExempt = category === 'FRESCA' ? true : isExempt;
      const selectedUnitObj = units.find(u => u.id === unit);
      const unitName = selectedUnitObj?.name || '';

      const catUpper = category.toUpperCase();
      const unitUpper = unitName.toUpperCase();
      if (catUpper === 'SECA' && !['KG', 'LT', 'GR'].includes(unitUpper)) {
        showError('Para la categoría SECA, las unidades permitidas son: KG, LT, GR');
        setIsSubmitting(false);
        return;
      }
      if (catUpper === 'FRESCA' && unitUpper !== 'KG') {
        showError('Para la categoría FRESCA, la única unidad permitida es: KG');
        setIsSubmitting(false);
        return;
      }
      if (catUpper === 'EMPAQUE' && !['MT', 'UND'].includes(unitUpper)) {
        showError('Para la categoría EMPAQUE, las unidades permitidas son: MT (TRIPAS), UND (BOLSAS)');
        setIsSubmitting(false);
        return;
      }

      if (editingMaterial && selectedParentId === editingMaterial.id) {
        showError('Un material no puede ser su propio patrón de oro.');
        setIsSubmitting(false);
        return;
      }

      const isMasterMaterial = editingMaterial?.is_master || false;
      const finalParentId = isMasterMaterial ? null : (selectedParentId || null);

      if (editingMaterial) {
        // Mode: EDIT
        const { error: updateError } = await supabase
          .from('materials')
          .update({
            name: trimmedMaterialName,
            category,
            unit: unitName,
            unit_id: unit,
            is_exempt: finalIsExempt,
            base_material_id: finalParentId,
            color: color.trim() || null,
            brand: brand.trim() || null,
            search_aliases: nameProvided.trim() ? [nameProvided.trim().toUpperCase()] : []
          })
          .eq('id', editingMaterial.id);

        if (updateError) {
          throw new Error('Error al actualizar el material: ' + updateError.message);
        }

        showSuccess(`Material "${trimmedMaterialName}" actualizado con éxito.`);
        
        onMaterialCreated({
          ...editingMaterial,
          name: trimmedMaterialName,
          category,
          unit: unitName,
          unit_id: unit,
          is_exempt: finalIsExempt,
          base_material_id: finalParentId,
          color: color.trim() || null,
          brand: brand.trim() || null,
          search_aliases: nameProvided.trim() ? [nameProvided.trim().toUpperCase()] : []
        });

        handleClose();
        return;
      }
      let materialToAssociate: Material | null = null;
      let isNewMaterial = false;

      // 1. Check if the final name matches an existing material (exact check without limit)
      const exactMatch = await getMaterialByName(trimmedMaterialName);

      // Determine final is_exempt status (forced true if FRESCA)
      // Already defined above in function scope

      if (exactMatch) {
        // USE EXISTING
        materialToAssociate = exactMatch;
      } else {
        // CREATE NEW
        // Find unit name for the "unit" text field
        const selectedUnitObj = units.find(u => u.id === unit);
        const unitName = selectedUnitObj?.name || '';

        const newMaterial = await createMaterial({
          name: trimmedMaterialName,
          category,
          unit: unitName,
          unit_id: unit,
          is_exempt: finalIsExempt, // Use the determined final status
          user_id: session.user.id,
          code: '', // Allow trigger to generate it
          base_material_id: finalParentId,
          color: color.trim() || null,
          brand: brand.trim() || null,
          search_aliases: nameProvided.trim() ? [nameProvided.trim().toUpperCase()] : [],
          status: role === 'admin' ? 'active' : 'pending'
        });

        if (!newMaterial) {
          throw new Error('No se pudo crear el material.');
        }
        materialToAssociate = newMaterial;
        isNewMaterial = true;
      }

      // 3. Associate the material with the supplier IF supplierId is provided
      if (supplierId && materialToAssociate) {
        const result = await createSupplierMaterialRelation({
          supplier_id: supplierId,
          material_id: materialToAssociate.id,
          unit_id: unit || materialToAssociate.unit_id || '',
          specification: specification.trim() || undefined,
          name_provided: nameProvided.trim() || undefined,
          user_id: session.user.id,
        });

        if (!result.success) {
          showError('Advertencia: Falló la asociación con el proveedor.');
        } else {
          if (result.existed) {
            showSuccess(`El material "${materialToAssociate.name}" ya estaba asociado a este proveedor.`);
          } else {
            if (isNewMaterial) {
              const successMsg = role === 'admin' 
                ? 'Material creado y asociado exitosamente.'
                : 'Material creado (pendiente de revisión de administrador) y asociado exitosamente.';
              showSuccess(successMsg);
            } else {
              showSuccess(`Material existente "${materialToAssociate.name}" asociado exitosamente.`);
            }
          }
        }
      } else if (materialToAssociate) {
        if (isNewMaterial) {
          const successMsg = role === 'admin' 
            ? `Material "${materialToAssociate.name}" creado.`
            : `Material "${materialToAssociate.name}" creado. Pendiente de aprobación.`;
          showSuccess(successMsg);
        } else {
          showSuccess(`Material "${materialToAssociate.name}" seleccionado.`);
        }
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

  const dialogDescription = editingMaterial ? (
    'Modifica los detalles del material existente.'
  ) : supplierId ? (
    <>
      Crea un nuevo material o asocia uno existente a {supplierName ? <strong>{supplierName}</strong> : 'este proveedor'}.
    </>
  ) : (
    'Crea un nuevo material. Si estás creando un nuevo proveedor, este material se asociará al guardar el formulario.'
  );

  const isMaterialNameValid = materialName.trim().length > 0;
  const isExactMatch = suggestedMaterial && suggestedMaterial.name.toUpperCase() === materialName.trim().toUpperCase();
  const submitButtonText = editingMaterial ? 'Guardar Cambios' : isExactMatch ? 'Asociar Material' : 'Crear y Asociar';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] bg-slate-50/95 backdrop-blur-xl border-none shadow-2xl rounded-[2rem] ring-1 ring-white p-6 animate-in fade-in slide-in-from-bottom-4">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-extrabold tracking-tight text-procarni-blue">{editingMaterial ? 'Editar Material' : 'Añadir Nuevo Material'}</DialogTitle>
          <DialogDescription className="text-gray-500 font-medium italic text-sm">
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2 max-h-[65vh] overflow-y-auto pr-1">
          {/* 1. Patrón de Oro (SmartSearch) */}
          {(!editingMaterial || !editingMaterial.is_master) && (
            <div className="grid gap-1.5 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
              <Label htmlFor="parentMaterial" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Patrón de Oro (Material Oficial) [Opcional]</Label>
              <SmartSearch 
                placeholder="Buscar patrón de oro..."
                displayValue={selectedParentName}
                selectedId={selectedParentId}
                onSelect={(item) => {
                  setSelectedParentId(item.id);
                  setSelectedParentName(item.name.split(' - ')[0]); // Extrae el nombre limpio
                }}
                disabled={isSubmitting}
                fetchFunction={async (query) => {
                  const searchTargetName = materialName.trim() || query.trim();
                  
                  const { data, error } = await supabase.rpc('search_master_materials_suggested', {
                    p_target_name: searchTargetName,
                    p_search_query: query.trim(),
                    p_exclude_id: editingMaterial?.id || null
                  });

                  if (error) {
                    console.error('[search_master_materials_suggested Error]:', error);
                    return [];
                  }

                  return (data || []).map((m: any) => ({
                    id: m.id,
                    name: `${m.name}${m.category ? ` - ${m.category}` : ''}${m.code ? ` (${m.code})` : ''}`,
                    group: m.is_suggested ? '⭐ Sugeridos (Similitud Trigrama)' : 'Otros Patrones de Oro'
                  }));
                }}
              />
            </div>
          )}

          {/* 2. Categoría y Unidad de Medida */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
            <div className="grid gap-1.5">
              <Label htmlFor="category" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Categoría</Label>
              <Select value={category} onValueChange={setCategory} disabled={isSubmitting || (!editingMaterial && isExactMatch) || isLoadingCategories}>
                <SelectTrigger id="category" className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                  <SelectValue placeholder={isLoadingCategories ? "Cargando..." : "Selecciona categoría"} />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="unit" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</Label>
              <Select 
                value={unit} 
                onValueChange={(val) => {
                  setUnit(val);
                }} 
                disabled={isSubmitting || (!editingMaterial && isExactMatch) || isLoadingUnits}
              >
                <SelectTrigger id="unit" className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                  <SelectValue placeholder={isLoadingUnits ? "Cargando..." : "Selecciona unidad"} />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {filteredUnits.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Nomenclatura Estructurada Select (visible when category is EMPAQUE) */}
          {category === 'EMPAQUE' && (
            <div className="grid gap-1.5 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nomenclatura Estructurada de Empaque</Label>
              <Select value={specialStructure} onValueChange={(val: any) => setSpecialStructure(val)} disabled={isSubmitting}>
                <SelectTrigger className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Texto Libre (Sin Estructura)</SelectItem>
                  <SelectItem value="TRIPAS">Tripas (Tipo, Medida, Metros, Acabado)</SelectItem>
                  <SelectItem value="BOLSAS_TERMO">Bolsas / Termoformado (Tipo, Medida, Micra, Uso, Variación)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* 3. Nombre del Material (Estructurado o Libre) */}
          <div className="grid gap-2">
            {specialStructure === 'TRIPAS' ? (
              <div className="space-y-4 p-5 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Vista Previa del Nombre Consolidado</Label>
                  <div className="p-3 bg-slate-900 text-white rounded-xl font-mono text-xs font-bold break-all select-all tracking-tight leading-relaxed">
                    {materialName || 'TRIPAS...'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Tipo de Tripa</Label>
                    <Select value={tripaTipo} onValueChange={setTripaTipo} disabled={isSubmitting}>
                      <SelectTrigger className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['PLASTICA', 'CELULOSA', 'FIBROSA', 'COLAGENO', 'CERO MERMA'].map(tipo => (
                          <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Medida (Ej: 90X300)</Label>
                    <Input
                      placeholder="Ej: 90X300"
                      value={tripaMedida}
                      onChange={(e) => setTripaMedida(e.target.value.toUpperCase().replace(/\*/g, 'X'))}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Color</Label>
                    <Input
                      placeholder="Ej: ROJO, AMARILLO..."
                      value={tripaColor}
                      onChange={(e) => setTripaColor(e.target.value)}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Metros por Caja</Label>
                    <Input
                      placeholder="Ej: 500"
                      value={tripaMetros}
                      onChange={(e) => setTripaMetros(e.target.value)}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Variación (Selección Múltiple)</Label>
                    <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-white border border-slate-200 rounded-xl">
                      {['CORRUGADA', 'LISA', 'TIMBRADA'].map(v => {
                        const checked = tripaVariaciones.includes(v);
                        return (
                          <label key={v} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(isChecked) => {
                                if (isChecked) {
                                  setTripaVariaciones([...tripaVariaciones, v]);
                                } else {
                                  setTripaVariaciones(tripaVariaciones.filter(item => item !== v));
                                }
                              }}
                            />
                            {v}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : specialStructure === 'BOLSAS_TERMO' ? (
              <div className="space-y-4 p-5 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
                <div className="space-y-1">
                  <Label className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Vista Previa del Nombre Consolidado</Label>
                  <div className="p-3 bg-slate-900 text-white rounded-xl font-mono text-xs font-bold break-all select-all tracking-tight leading-relaxed">
                    {materialName || 'BOLSAS / TERMOFORMADO...'}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Prefijo</Label>
                    <Select value={btPrefix} onValueChange={setBtPrefix} disabled={isSubmitting}>
                      <SelectTrigger className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['BOLSAS', 'TERMOFORMADO'].map(prefix => (
                          <SelectItem key={prefix} value={prefix}>{prefix}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Tipo</Label>
                    <Select value={btTipo} onValueChange={setBtTipo} disabled={isSubmitting}>
                      <SelectTrigger className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['AL VACIO', 'TERMOENCOGIBLES', 'PARA BULTOS', 'CON ASAS', 'PARA CESTAS'].map(tipo => (
                          <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Medida</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ej: 20X30 o 5"
                        value={btMedidaValor}
                        onChange={(e) => setBtMedidaValor(e.target.value.toUpperCase().replace(/\*/g, 'X'))}
                        disabled={isSubmitting}
                        className="bg-white border-slate-200 rounded-xl h-10 flex-1 focus:ring-procarni-primary/20"
                      />
                      <Select value={btMedidaUnidad} onValueChange={setBtMedidaUnidad} disabled={isSubmitting}>
                        <SelectTrigger className="bg-white border-slate-200 rounded-xl h-10 w-24 focus:ring-procarni-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['CM', 'IN', 'KG'].map(unidad => (
                            <SelectItem key={unidad} value={unidad}>{unidad}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Color / Fondo</Label>
                    <Input
                      placeholder="Ej: TRANSPARENTE, BLANCO..."
                      value={btColor}
                      onChange={(e) => setBtColor(e.target.value)}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Micras (UM)</Label>
                    <Input
                      placeholder="Ej: 70"
                      value={btMicra}
                      onChange={(e) => setBtMicra(e.target.value)}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Uso (Receta/Aplicación)</Label>
                    <Input
                      placeholder="Ej: TOCINETA, REBANADOS..."
                      value={btUso}
                      onChange={(e) => setBtUso(e.target.value)}
                      disabled={isSubmitting}
                      className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                    />
                  </div>

                  <div className="space-y-1.5 col-span-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Variación (Selección Múltiple)</Label>
                    <div className="grid grid-cols-2 gap-2.5 p-3.5 bg-white border border-slate-200 rounded-xl">
                      {['ALTA BARRERA', 'GRIP AND TEAR', 'RESPIRABLE S/BARRERA', 'TIMBRADA'].map(v => {
                        const checked = btVariaciones.includes(v);
                        return (
                          <label key={v} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(isChecked) => {
                                        if (isChecked) {
                                          setBtVariaciones([...btVariaciones, v]);
                                        } else {
                                          setBtVariaciones(btVariaciones.filter(item => item !== v));
                                        }
                              }}
                            />
                            {v}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
                <Label htmlFor="materialName" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nombre del Material *</Label>
                <Input
                  id="materialName"
                  placeholder="Ej: Pollo entero, Carne molida..."
                  value={materialName}
                  onChange={(e) => setMaterialName(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                />
              </div>
            )}

            {isCheckingExistence && (
              <p className="text-xs text-muted-foreground flex items-center px-4">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Buscando sugerencias...
              </p>
            )}

            {suggestedMaterial && !isCheckingExistence && (
              <div className="flex items-center justify-between p-3.5 mx-4 border border-blue-100 rounded-xl bg-blue-50/50">
                <p className="text-xs text-blue-800 font-medium">
                  {isExactMatch ? 'Material existente:' : 'Material sugerido:'} <strong>{suggestedMaterial.name}</strong>
                </p>
                {!isExactMatch && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAcceptSuggestion}
                    className="h-8 shadow-sm hover:scale-[1.01] active:scale-[0.99] transition-all"
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Usar
                  </Button>
                )}
              </div>
            )}

            {!editingMaterial && !isExactMatch && isMaterialNameValid && !isCheckingExistence && !suggestedMaterial && (
              <p className="text-xs text-amber-700 font-semibold px-4 italic">
                Material nuevo: <strong>{materialName.toUpperCase()}</strong>. Se creará al guardar.
              </p>
            )}
          </div>

          {/* 4. Nombre según Proveedor */}
          {!hideNameProvided && (
            <div className="grid gap-1.5 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
              <Label htmlFor="nameProvided" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nombre según Proveedor (Opcional)</Label>
              <Input
                id="nameProvided"
                placeholder="Ej: Pechuga Deshuesada Premium"
                value={nameProvided}
                onChange={(e) => setNameProvided(e.target.value)}
                disabled={isSubmitting}
                className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
              />
            </div>
          )}

          {/* 5. Color y Marca */}
          <div className="p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
            {specialStructure === 'NONE' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="color" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Color (Opcional)</Label>
                  <Input
                    id="color"
                    placeholder="Ej: Blanco, Rojo..."
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    disabled={isSubmitting}
                    className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="brand" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca (Opcional)</Label>
                  <Input
                    id="brand"
                    placeholder="Ej: Procarni, Polar..."
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    disabled={isSubmitting}
                    className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="brand" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca (Opcional)</Label>
                <Input
                  id="brand"
                  placeholder="Ej: Procarni, Polar..."
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                />
              </div>
            )}
          </div>

          {/* 6. Especificación y Opción de Exento */}
          <div className="grid gap-1.5 p-4 bg-white/70 backdrop-blur-xl border border-slate-100 rounded-2xl shadow-sm">
            <Label htmlFor="specification" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Especificación (Opcional)</Label>
            <Input
              id="specification"
              placeholder="Ej: Presentación de 10kg, Marca X..."
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              disabled={isSubmitting}
              className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-sm">
            <div className="space-y-0.5">
              <Label className="text-[11px] uppercase tracking-wider font-bold text-slate-700">Exento de IVA</Label>
              <p className="text-xs text-muted-foreground">
                Marcar si este material no debe incluir IVA.
              </p>
            </div>
            <Switch
              checked={isExempt}
              onCheckedChange={setIsExempt}
              disabled={isSubmitting || (!editingMaterial && isExactMatch) || category === 'FRESCA'}
            />
          </div>
        </div>

        <DialogFooter className="mt-6 flex gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting} className="rounded-xl h-10 shadow-sm">
            Cancelar
          </Button>
          <Button onClick={handleAddMaterial} disabled={isSubmitting || !isMaterialNameValid || isCheckingExistence} className="bg-procarni-primary hover:bg-procarni-primary/95 text-white rounded-xl h-10 shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all">
            {isSubmitting ? 'Guardando...' : submitButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaterialCreationDialog;