import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { Material } from '@/integrations/supabase/types';
import { getAllUnits, UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import { getAllSystemMaterials, searchMaterials } from '@/integrations/supabase/services/materialService';
import {
  dotacionConfigService,
  DEFAULT_DOTACION_MAPPINGS,
} from '@/services/dotacionConfigService';
import { DotacionMaterialMapping, DotacionProductId } from '@/types/dotacion';
import { showSuccess, showError } from '@/utils/toast';
import {
  Sparkles,
  Save,
  RotateCcw,
  Check,
  ChevronsUpDown,
  Link2,
  Unlink2,
  Wheat,
  UtensilsCrossed,
  Candy,
  Scroll,
  Bath,
  Info,
  CheckCircle2,
  AlertTriangle,
  Package,
  Search,
  Loader2,
} from 'lucide-react';

const normalizeStr = (str: string): string =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const DotacionMaterialMappingManager: React.FC = () => {
  const [mappings, setMappings] = useState<DotacionMaterialMapping[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [openComboboxIndex, setOpenComboboxIndex] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchingRemote, setIsSearchingRemote] = useState<boolean>(false);

  // Cargar todos los materiales del sistema y unidades
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [loadedMaterials, loadedUnits] = await Promise.all([
          getAllSystemMaterials(),
          getAllUnits(),
        ]);
        setMaterials(loadedMaterials || []);
        setUnits(loadedUnits || []);

        const saved = dotacionConfigService.getMappings();
        setMappings(saved);
      } catch (err) {
        console.error('[DotacionMaterialMappingManager] Error cargando datos:', err);
        showError('Error al cargar catálogo de materiales.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Búsqueda remota complementaria cuando el usuario escribe 2 o más caracteres
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

    const timer = setTimeout(async () => {
      setIsSearchingRemote(true);
      try {
        const remoteResults = await searchMaterials(searchQuery.trim());
        if (remoteResults && remoteResults.length > 0) {
          setMaterials((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newOnes = remoteResults.filter((m) => !existingIds.has(m.id));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes];
          });
        }
      } catch (e) {
        console.warn('[DotacionMaterialMappingManager] Error en búsqueda complementaria:', e);
      } finally {
        setIsSearchingRemote(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Filtrado de materiales en memoria (insensible a acentos, mayúsculas y orden de palabras)
  const filteredMaterials = useMemo(() => {
    if (!searchQuery.trim()) {
      return materials.slice(0, 100);
    }

    const queryNorm = normalizeStr(searchQuery);
    const tokens = queryNorm.split(/\s+/).filter(Boolean);

    return materials
      .filter((mat) => {
        const aliases = Array.isArray(mat.search_aliases) ? mat.search_aliases.join(' ') : '';
        const searchCorpus = normalizeStr(
          `${mat.code || ''} ${mat.name} ${mat.category || ''} ${mat.unit || ''} ${aliases}`
        );
        return tokens.every((token) => searchCorpus.includes(token));
      })
      .slice(0, 150);
  }, [materials, searchQuery]);

  const handleSelectMaterial = (index: number, material: Material) => {
    const updated = [...mappings];
    const target = updated[index];

    // Buscar si existe unidad bulto
    const bultoUnit = units.find((u) => {
      const n = u.name.trim().toLowerCase();
      return n === 'bulto' || n === 'bto' || n === 'bultos';
    });

    target.materialId = material.id;
    target.materialName = material.name;
    target.materialCode = material.code;
    target.unitId = material.unit_id || null;
    target.unitName = material.unit || target.unitName;
    target.isExempt = material.is_exempt ?? target.isExempt;
    target.bultoUnitId = bultoUnit ? bultoUnit.id : target.bultoUnitId;
    target.bultoUnitName = bultoUnit ? bultoUnit.name : target.bultoUnitName || 'Bulto';

    if (!target.customPoName) {
      target.customPoName = material.name;
    }

    setMappings(updated);
    setOpenComboboxIndex(null);
    setSearchQuery('');
  };

  const handleUnlinkMaterial = (index: number) => {
    const updated = [...mappings];
    const target = updated[index];
    target.materialId = null;
    target.materialName = null;
    target.materialCode = null;
    target.customPoName = null;
    setMappings(updated);
  };

  const handleCustomPoNameChange = (index: number, val: string) => {
    const updated = [...mappings];
    updated[index].customPoName = val;
    setMappings(updated);
  };

  const handleToggleExempt = (index: number, val: boolean) => {
    const updated = [...mappings];
    updated[index].isExempt = val;
    setMappings(updated);
  };

  const handleAutoMatch = () => {
    if (materials.length === 0) {
      showError('No se encontraron materiales en el catálogo para comparar.');
      return;
    }
    const matched = dotacionConfigService.autoMatchMaterials(materials, units, mappings);
    setMappings(matched);

    const linkedCount = matched.filter((m) => !!m.materialId).length;
    showSuccess(`Búsqueda automática completada: ${linkedCount} de ${matched.length} productos vinculados.`);
  };

  const handleResetDefaults = () => {
    setMappings([...DEFAULT_DOTACION_MAPPINGS]);
    showSuccess('Valores restablecidos a los valores predeterminados.');
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      dotacionConfigService.saveMappings(mappings);
      showSuccess('Configuración de ítems de dotación guardada exitosamente.');
    } catch (e) {
      console.error(e);
      showError('Error al guardar la configuración.');
    } finally {
      setIsSaving(false);
    }
  };

  const getProductIcon = (productId: DotacionProductId) => {
    switch (productId) {
      case 'harina':
        return <Wheat className="h-5 w-5 text-amber-600" />;
      case 'arroz':
        return <UtensilsCrossed className="h-5 w-5 text-blue-600" />;
      case 'azucar':
        return <Candy className="h-5 w-5 text-purple-600" />;
      case 'papel':
        return <Scroll className="h-5 w-5 text-cyan-600" />;
      case 'jabon':
        return <Bath className="h-5 w-5 text-emerald-600" />;
      default:
        return <Package className="h-5 w-5 text-slate-600" />;
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-6 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200/80">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-procarni-primary/10 rounded-lg text-procarni-primary">
                <Link2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-procarni-blue tracking-tight">
                  Vinculación de Ítems de Dotación
                </h3>
                <p className="text-xs text-slate-500">
                  Enlaza los 5 productos base de la dotación con materiales reales del catálogo ({materials.length} materiales en sistema) para emitir órdenes de compra con código, trazabilidad y tributación correctos.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
              disabled={isLoading || materials.length === 0}
              className="text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1 text-blue-600" />
              Autodetectar Ítems
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetDefaults}
              disabled={isLoading}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Restablecer
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={isLoading || isSaving}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white shadow-sm text-xs font-semibold px-4"
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? 'Guardando...' : 'Guardar Vinculación'}
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 md:p-6 space-y-4">
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-procarni-primary" />
            Cargando catálogo completo de materiales ({materials.length} en sistema)...
          </div>
        ) : (
          <div className="space-y-4">
            {mappings.map((mapping, index) => {
              const isLinked = !!mapping.materialId;
              const selectedMat = materials.find((m) => m.id === mapping.materialId);

              return (
                <div
                  key={mapping.productId}
                  className={`p-4 rounded-xl border transition-all ${
                    isLinked
                      ? 'border-emerald-200/80 bg-emerald-50/20 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Columna Izquierda: Identificador de producto de dotación */}
                    <div className="flex items-start gap-3 min-w-[240px]">
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200/60 shrink-0">
                        {getProductIcon(mapping.productId)}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{mapping.productLabel}</span>
                          {isLinked ? (
                            <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 font-medium">
                              <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" />
                              Vinculado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 font-medium">
                              <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />
                              Sin Vincular
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium truncate">
                          Referencia por defecto: <span className="text-slate-700">{mapping.defaultBrand}</span>
                        </p>
                      </div>
                    </div>

                    {/* Columna Central: Selector de Material de Base de Datos */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                        Material Oficial en Inventario (Sistema)
                      </Label>

                      <div className="flex items-center gap-2">
                        <Popover
                          open={openComboboxIndex === index}
                          onOpenChange={(open) => {
                            setOpenComboboxIndex(open ? index : null);
                            if (!open) setSearchQuery('');
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={openComboboxIndex === index}
                              className={`w-full justify-between h-10 text-xs font-normal border bg-white ${
                                isLinked ? 'border-emerald-300 text-slate-900 font-medium' : 'border-slate-200 text-slate-500'
                              }`}
                            >
                              <span className="truncate">
                                {isLinked && mapping.materialName
                                  ? `${mapping.materialCode ? `[${mapping.materialCode}] ` : ''}${mapping.materialName}`
                                  : 'Buscar y asociar material del sistema...'}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[340px] md:w-[520px] p-0 z-[100]" align="start">
                            <Command shouldFilter={false}>
                              <div className="flex items-center px-3 border-b border-slate-100">
                                <Search className="h-4 w-4 text-slate-400 mr-2 shrink-0" />
                                <CommandInput
                                  placeholder="Buscar por código, nombre (ej: Harina, Arroz, Jabón)..."
                                  value={searchQuery}
                                  onValueChange={setSearchQuery}
                                  className="h-10 text-xs border-none focus:ring-0 flex-1"
                                />
                                {isSearchingRemote && (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 shrink-0" />
                                )}
                              </div>
                              <CommandList className="max-h-64 overflow-y-auto">
                                {filteredMaterials.length === 0 ? (
                                  <CommandEmpty className="py-5 text-center text-xs text-slate-500">
                                    No se encontraron materiales que coincidan con &quot;{searchQuery}&quot;.
                                  </CommandEmpty>
                                ) : (
                                  <CommandGroup heading={`Resultados (${filteredMaterials.length}${materials.length > 0 ? ` de ${materials.length} en catálogo` : ''})`}>
                                    {filteredMaterials.map((mat) => {
                                      const isCurrentSelected = mapping.materialId === mat.id;
                                      return (
                                        <CommandItem
                                          key={mat.id}
                                          value={mat.id}
                                          onSelect={() => handleSelectMaterial(index, mat)}
                                          className="text-xs cursor-pointer flex items-center justify-between py-2 px-3 hover:bg-slate-50"
                                        >
                                          <div className="flex flex-col min-w-0 pr-2">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              {mat.code && (
                                                <span className="font-mono text-[11px] font-bold text-procarni-blue">
                                                  [{mat.code}]
                                                </span>
                                              )}
                                              <span className="font-semibold text-slate-800 truncate">{mat.name}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5 flex-wrap">
                                              <span>Unidad: <strong className="text-slate-600">{mat.unit || 'Und'}</strong></span>
                                              <span>·</span>
                                              <span className={mat.is_exempt ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                                                {mat.is_exempt ? 'Exento IVA' : 'Paga IVA'}
                                              </span>
                                              {mat.category && (
                                                <>
                                                  <span>·</span>
                                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                                                    {mat.category}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                          {isCurrentSelected && <Check className="h-4 w-4 text-procarni-primary shrink-0" />}
                                        </CommandItem>
                                      );
                                    })}
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>

                        {isLinked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnlinkMaterial(index)}
                            title="Desvincular material"
                            className="h-10 w-10 text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          >
                            <Unlink2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {/* Detalles rápidos del material vinculado */}
                      {isLinked && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-600 font-mono">
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            Cód: <strong className="text-slate-800">{mapping.materialCode || 'S/C'}</strong>
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            Unidad Base: <strong className="text-slate-800">{mapping.unitName || selectedMat?.unit || 'Und'}</strong>
                          </span>
                          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">
                            Unidad Bulto: <strong className="text-slate-800">{mapping.bultoUnitName || 'Bulto'}</strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Columna Derecha: Parámetros de Orden de Compra */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 lg:min-w-[280px]">
                      {/* Nombre personalizado en OC */}
                      <div className="space-y-1 w-full sm:w-auto flex-1">
                        <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                          Nombre para la OC
                        </Label>
                        <Input
                          value={mapping.customPoName || ''}
                          onChange={(e) => handleCustomPoNameChange(index, e.target.value)}
                          placeholder={mapping.materialName || mapping.defaultBrand}
                          className="h-9 text-xs bg-white border-slate-200"
                        />
                      </div>

                      {/* Switch Exento de IVA */}
                      <div className="flex flex-col gap-1 items-start sm:items-center">
                        <Label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider whitespace-nowrap">
                          Exento IVA
                        </Label>
                        <div className="flex items-center gap-1.5 h-9">
                          <Switch
                            checked={mapping.isExempt}
                            onCheckedChange={(val) => handleToggleExempt(index, val)}
                          />
                          <span className={`text-[11px] font-bold ${mapping.isExempt ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {mapping.isExempt ? 'Exento' : '16% IVA'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Nota explicativa de pie */}
        <div className="mt-4 p-3 bg-blue-50/60 rounded-lg border border-blue-100 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-900 leading-relaxed">
            <strong>¿Cómo funciona?</strong> Al pulsar <em>Generar OC</em> en la dotación quincenal, el sistema tomará automáticamente el <code className="font-mono font-semibold">material_id</code>, código, unidad de inventario y condición fiscal configurados aquí. Esto garantiza que las órdenes de compra alimenten el historial de precios por proveedor y los reportes de recepción sin errores de ítems sueltos.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DotacionMaterialMappingManager;
