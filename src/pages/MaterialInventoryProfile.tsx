import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { 
  ArrowLeft, Package, DollarSign, TrendingUp, Settings, 
  History, Sparkles, Save, ShoppingCart, Truck, ChefHat, 
  ChevronRight, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getMaterialsInventory } from '@/integrations/supabase/services/inventoryService';
import { updateMaterial } from '@/integrations/supabase/services/materialService';
import { getSuppliersByMaterial, getAllUnits } from '@/integrations/supabase/data';
import { getPriceHistoryByMaterialId } from '@/integrations/supabase/services/priceHistoryService';
import { getAllMaterialCategories } from '@/integrations/supabase/services/materialCategoryService';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger 
} from '@/components/ui/sheet';
import { 
  Tabs, TabsContent, TabsList, TabsTrigger 
} from '@/components/ui/tabs';
import { useShoppingCart } from '@/context/ShoppingCartContext';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  FRESCA: { bg: 'bg-red-50', text: 'text-procarni-primary', border: 'border-procarni-primary/20' },
  SECA: { bg: 'bg-amber-50', text: 'text-procarni-alert', border: 'border-procarni-alert/20' },
  EMPAQUE: { bg: 'bg-blue-50', text: 'text-procarni-blue', border: 'border-procarni-blue/20' },
  ETIQUETA: { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-procarni-dark/20' },
};

const fmt = (n: any, dec = 2) => {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dec });
};

const translateStatus = (status: string) => {
  const map: Record<string, string> = {
    'Draft': 'Borrador',
    'Pending': 'Pendiente',
    'Approved': 'Aprobada',
    'Received': 'Recibido',
    'Cancelled': 'Cancelada',
  };
  return map[status] || status;
};

const MaterialInventoryProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addItem, clearCart } = useShoppingCart();

  // Fetch materials inventory (including inactive/archived items)
  const { data: inventory = [], isLoading: isLoadingInventory } = useQuery({
    queryKey: ['materialsInventory', 'all'],
    queryFn: () => getMaterialsInventory(true),
  });

  const material = useMemo(() => {
    return inventory.find(m => m.material_id === id);
  }, [inventory, id]);

  // Fetch actual material categories
  const { data: categories = [], isLoading: isLoadingCategories } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  // Fetch units of measure
  const { data: units = [] } = useQuery({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  // Fetch actual suppliers linked to this material
  const { data: suppliers = [], isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ['materialSuppliers', id],
    queryFn: () => (id ? getSuppliersByMaterial(id) : Promise.resolve([])),
    enabled: !!id,
  });

  // Fetch price history to calculate metrics
  const { data: priceHistory = [] } = useQuery({
    queryKey: ['priceHistory', id],
    queryFn: () => (id ? getPriceHistoryByMaterialId(id) : Promise.resolve([])),
    enabled: !!id,
  });

  // Fetch actual production dispatch transactions
  const { data: recipeUses = [], isLoading: isLoadingRecipeUses } = useQuery({
    queryKey: ['materialRecipeUses', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('material_id', id)
        .eq('transaction_type', 'OUT_PRODUCTION')
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch full Kardex history of this material
  const { data: kardexHistory = [], isLoading: isLoadingKardex } = useQuery({
    queryKey: ['materialKardexHistory', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select(`
          id,
          transaction_date,
          transaction_type,
          quantity,
          actual_quantity,
          unit_cost,
          total_cost,
          stock_after,
          reference_doc,
          audit_note
        `)
        .eq('material_id', id)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch all Purchase Orders containing this material
  const { data: materialPOs = [], isLoading: isLoadingPOs } = useQuery({
    queryKey: ['materialPOs', id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          quantity,
          unit_price,
          purchase_orders (
            id,
            sequence_number,
            status,
            issue_date,
            suppliers (
              name
            )
          )
        `)
        .eq('material_id', id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Local config states
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [isActiveInInventory, setIsActiveInInventory] = useState<boolean>(true);
  const [isExempt, setIsExempt] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);

  // Local state for production/supply type (Habilitar Inventario button)
  const [inventoryType, setInventoryType] = useState<string | null>(null);

  // Local state for history modal and active tab
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState('kardex');

  // Sync state with loaded material data
  useEffect(() => {
    if (material) {
      setIsActiveInInventory(material.is_active ?? true);
      const materialsData = material.materials as any;
      setIsExempt(materialsData?.is_exempt ?? false);
      setSelectedCategory(materialsData?.category || '');
      
      // Load inventory type selection from local storage to keep state persistent
      const savedType = localStorage.getItem(`inv_type_${material.material_id}`);
      if (savedType) {
        setInventoryType(savedType);
      }

      // Attempt to locate unit ID
      if (materialsData?.unit_id) {
        setSelectedUnitId(materialsData.unit_id);
      } else if (units.length > 0 && material.unit) {
        const matchingUnit = units.find(u => u.name.toUpperCase() === material.unit.toUpperCase());
        if (matchingUnit) {
          setSelectedUnitId(matchingUnit.id);
        }
      }
    }
  }, [material, units]);

  // Restrict units based on selected category
  const filteredUnits = useMemo(() => {
    if (!selectedCategory) return units;
    const catUpper = selectedCategory.toUpperCase();
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
  }, [selectedCategory, units]);

  // Adjust unit if category changes and the current unit is not allowed
  useEffect(() => {
    if (!selectedCategory || units.length === 0 || !selectedUnitId) return;
    const catUpper = selectedCategory.toUpperCase();
    const currentUnitObj = units.find(u => u.id === selectedUnitId);
    if (!currentUnitObj) return;

    const currentUnitName = currentUnitObj.name.toUpperCase();
    let allowedNames: string[] = [];
    if (catUpper === 'SECA') allowedNames = ['KG', 'LT', 'GR'];
    else if (catUpper === 'FRESCA') allowedNames = ['KG'];
    else if (catUpper === 'EMPAQUE') allowedNames = ['MT', 'UND'];

    if (allowedNames.length > 0 && !allowedNames.includes(currentUnitName)) {
      let defaultUnitName = allowedNames[0];
      const found = units.find(u => u.name.toUpperCase() === defaultUnitName);
      if (found) {
        setSelectedUnitId(found.id);
      }
    }
  }, [selectedCategory, units]);

  // Calculate purchase history metrics
  const purchaseStats = useMemo(() => {
    if (priceHistory.length === 0) {
      return {
        timesPurchasedThisMonth: 0,
        lastCost: material?.last_purchase_price || 0,
        trend: 'stable' as const,
        lastPurchaseDate: null,
        lastSupplier: 'Ninguno',
        demand: 'Baja'
      };
    }

    const sorted = [...priceHistory].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const thisMonthPurchases = sorted.filter(p => {
      const d = new Date(p.recorded_at);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    const last = sorted[0];
    const lastCost = last.unit_price;
    const lastPurchaseDate = last.recorded_at;
    const lastSupplier = last.suppliers?.name || 'Desconocido';
    const purchase_order_id = last.purchase_order_id;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (sorted.length > 1) {
      const prev = sorted[1].unit_price;
      if (lastCost > prev) trend = 'up';
      else if (lastCost < prev) trend = 'down';
    }

    const recentPurchasesCount = sorted.filter(p => {
      const d = new Date(p.recorded_at);
      const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 60;
    }).length;
    
    let demand = 'Baja';
    if (recentPurchasesCount > 5) demand = 'Alta';
    else if (recentPurchasesCount > 2) demand = 'Media';

    return {
      timesPurchasedThisMonth: thisMonthPurchases.length,
      lastCost,
      trend,
      lastPurchaseDate,
      lastSupplier,
      demand,
      purchase_order_id
    };
  }, [priceHistory, material]);

  const isLowStock = useMemo(() => {
    if (!material) return false;
    return material.min_stock_alert > 0 && material.current_stock <= material.min_stock_alert;
  }, [material]);

  const totalValue = useMemo(() => {
    if (!material) return 0;
    return material.current_stock * material.average_unit_cost;
  }, [material]);

  const handleSaveChanges = async () => {
    if (!material) return;
    try {
      setIsSaving(true);
      const targetUnit = units.find(u => u.id === selectedUnitId);
      const unitName = targetUnit ? targetUnit.name : (material.unit || 'KG');

      // 1. Update inventory record
      const { error: invError } = await supabase
        .from('materials_inventory')
        .update({
          unit: unitName,
          is_active: isActiveInInventory,
        })
        .eq('material_id', material.material_id);

      if (invError) throw invError;

      // 2. Update catalog record
      await updateMaterial(material.material_id, {
        category: selectedCategory || null,
        unit_id: selectedUnitId || null,
        unit: unitName,
        is_exempt: isExempt,
      });

      toast.success('Configuración de material guardada correctamente.');
      queryClient.invalidateQueries({ queryKey: ['materialsInventory'] });
      queryClient.invalidateQueries({ queryKey: ['materialSuppliers', id] });
    } catch (error) {
      console.error('Error saving material changes:', error);
      toast.error('Ocurrió un error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleHabilitarInventarioType = (type: 'Producción' | 'Suministro') => {
    if (!material) return;
    setInventoryType(type);
    localStorage.setItem(`inv_type_${material.material_id}`, type);
    toast.success(`Inventario habilitado como: ${type}`);
  };

  const handleGenerarOrdenCompra = () => {
    if (!material) return;
    clearCart();
    const materialsData = material.materials as any;
    addItem({
      material_id: material.material_id,
      material_name: material.materials?.name || '',
      quantity: 1,
      unit_price: material.last_purchase_price || 0,
      unit: material.unit,
      unit_id: materialsData?.unit_id || null,
      is_exempt: materialsData?.is_exempt ?? false,
    });
    navigate('/generate-po');
    toast.success('Material agregado a la orden de compra.');
  };

  if (isLoadingInventory) {
    return (
      <div className="container mx-auto p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Skeleton className="h-48 rounded-[2rem]" />
          <Skeleton className="h-48 rounded-[2rem]" />
          <Skeleton className="h-48 rounded-[2rem]" />
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="container mx-auto p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="h-12 w-12 text-procarni-primary animate-bounce" />
        <h2 className="text-xl font-bold text-procarni-dark">Material no encontrado</h2>
        <p className="text-sm text-gray-500">El ID especificado no corresponde a ningún material habilitado en inventario.</p>
        <Button onClick={() => navigate('/inventory')} className="bg-procarni-blue hover:bg-procarni-blue/90 text-white rounded-xl active:scale-95 transition-all">
          Volver a Inventario
        </Button>
      </div>
    );
  }

  const materialsData = material.materials as any;
  const categoryName = materialsData?.category || '';
  const categoryColor = CATEGORY_COLORS[categoryName.toUpperCase()] || { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-slate-200' };

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <div className="container mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* Back navigation */}
        <button
          onClick={() => navigate('/inventory')}
          className="group flex items-center gap-2 text-sm font-bold text-procarni-blue hover:text-procarni-primary transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver a Stock Global</span>
        </button>

        {/* Header Section (Restored to original, clean, no photo structure) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                {material.sku}
              </span>
              <Badge variant="outline" className={cn('font-bold text-xs border px-2.5 py-0.5', categoryColor.bg, categoryColor.text, categoryColor.border)}>
                {categoryName || 'Sin Categoría'}
              </Badge>
              {!material.is_active && (
                <Badge variant="outline" className="bg-red-50 text-procarni-primary border-procarni-primary/20 font-bold">
                  Inactivo en Inventario
                </Badge>
              )}
            </div>
            <h1 className="text-[34px] font-black text-procarni-blue tracking-tight leading-tight mt-2">
              {material.materials?.name ?? 'Detalles del Material'}
            </h1>
            <p className="text-[13px] text-gray-500 font-medium italic">
              {material.materials?.code ? `Código de sistema: ${material.materials.code}` : 'Sin código de sistema registrado'}
            </p>
          </div>
        </div>

        {/* KPI Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Cantidad Actual */}
          {/* Card 1: Cantidad Actual */}
          <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-emerald-50 text-procarni-secondary">
                  <Package className="h-5 w-5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Cantidad Actual</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                    {fmt(material.current_stock, 2)}
                  </span>
                  <span className="text-gray-500 font-bold text-sm uppercase">{material.unit}</span>
                </div>
                
                {/* Split Habilitar Inventario Button */}
                <div className="mt-4">
                  {inventoryType ? (
                    <Button 
                      disabled
                      className="w-full bg-slate-100 text-slate-400 font-bold text-xs py-5 rounded-xl border border-slate-200/50 cursor-not-allowed"
                    >
                      Inventario {inventoryType}
                    </Button>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          className="w-full bg-procarni-primary hover:bg-procarni-primary/95 text-white font-bold text-xs py-5 rounded-xl shadow-md active:scale-95 transition-all"
                        >
                          Habilitar Inventario
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-xl border-slate-100">
                        <DropdownMenuItem 
                          onClick={() => handleHabilitarInventarioType('Producción')}
                          className="font-bold text-xs py-3 cursor-pointer"
                        >
                          Producción
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleHabilitarInventarioType('Suministro')}
                          className="font-bold text-xs py-3 cursor-pointer"
                        >
                          Suministro
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Costo Promedio */}
          <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-procarni-blue/10 text-procarni-blue">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Valor Total de Inventario</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                    ${fmt(totalValue, 2)}
                  </span>
                  <span className="text-gray-500 font-bold text-sm">USD</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Costo Promedio Ponderado (CPP) por {material.unit}: <span className="font-semibold text-gray-600">${fmt(material.average_unit_cost, 4)}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Veces Comprado */}
          <Card 
            onClick={() => {
              if (purchaseStats.purchase_order_id) {
                navigate(`/purchase-orders/${purchaseStats.purchase_order_id}`);
              }
            }}
            className={cn(
              "border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300",
              purchaseStats.purchase_order_id && "hover:scale-[1.01] cursor-pointer hover:bg-slate-50/50"
            )}
          >
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-amber-50 text-procarni-alert">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Compras este Mes</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                    {String(purchaseStats.timesPurchasedThisMonth).padStart(2, '0')}
                  </span>
                  {purchaseStats.trend !== 'stable' && (
                    <span className={cn(
                      "flex items-center text-[10px] font-bold gap-0.5 px-1.5 py-0.5 rounded-full",
                      purchaseStats.trend === 'up' ? "bg-red-50 text-procarni-primary" : "bg-emerald-50 text-emerald-700"
                    )}>
                      <TrendingUp className={cn("h-3 w-3", purchaseStats.trend === 'down' && "rotate-180")} />
                      {purchaseStats.trend === 'up' ? 'Alza' : 'Baja'}
                    </span>
                  )}
                </div>
                
                <div className="pt-3 border-t border-slate-100/80 text-[10px] space-y-1 text-gray-500 mt-3">
                  <p>
                    Último Costo: <span className="font-semibold text-slate-800">${fmt(purchaseStats.lastCost, 4)}</span>
                  </p>
                  {purchaseStats.lastPurchaseDate ? (
                    <>
                      <p className="truncate">
                        Proveedor: <span className="font-semibold text-slate-800">{purchaseStats.lastSupplier}</span>
                      </p>
                      <p>
                        Fecha: <span className="font-semibold text-slate-800">{new Date(purchaseStats.lastPurchaseDate).toLocaleDateString()}</span>
                      </p>
                    </>
                  ) : (
                    <p className="italic text-gray-400">Sin compras registradas</p>
                  )}
                  <p>
                    Demanda Reciente: <span className={cn("font-bold", purchaseStats.demand === 'Alta' ? 'text-procarni-primary' : 'text-slate-700')}>{purchaseStats.demand}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Layout Wrapper for Configuration and Actions */}
        <div className="grid grid-cols-12 gap-8">
          
          {/* Central Configuration Section */}
          <div className="col-span-12 lg:col-span-9 space-y-8">
            <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-8 rounded-[2rem] shadow-2xl shadow-gray-200/50">
              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-slate-100">
                <Settings className="h-5 w-5 text-procarni-primary" />
                <h3 className="font-extrabold text-lg text-procarni-dark tracking-tight">Configuración de Material</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Categoría de Material</label>
                    <Select 
                      value={selectedCategory} 
                      onValueChange={setSelectedCategory}
                      disabled={isLoadingCategories}
                    >
                      <SelectTrigger className="w-full bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20">
                        <SelectValue placeholder="Seleccione Categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad de Medida</label>
                    <Select 
                      value={selectedUnitId} 
                      onValueChange={setSelectedUnitId}
                    >
                      <SelectTrigger className="w-full bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20">
                        <SelectValue placeholder="Seleccione Unidad" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredUnits.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-6 py-2">
                  <div className="flex items-center justify-between p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-procarni-dark">Estado Activo</p>
                      <p className="text-[10px] text-gray-400">Activar/desactivar para ver en listas de inventario</p>
                    </div>
                    <Switch 
                      checked={isActiveInInventory}
                      onCheckedChange={setIsActiveInInventory}
                      className="data-[state=checked]:bg-procarni-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-procarni-dark">Exento de IVA</p>
                      <p className="text-[10px] text-gray-400">Aplica tasa 0% en cálculos de costos</p>
                    </div>
                    <Switch 
                      checked={isExempt}
                      onCheckedChange={setIsExempt}
                      className="data-[state=checked]:bg-procarni-primary"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Bottom Grid: Tables */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Proveedores */}
              <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-6 rounded-[2rem] shadow-xl shadow-gray-200/50">
                <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Truck className="h-5 w-5 text-procarni-primary" />
                    <h4 className="font-extrabold text-sm text-procarni-dark tracking-tight">Proveedores</h4>
                  </div>
                  <Button 
                    onClick={() => navigate(`/search-suppliers-by-material?materialId=${material.material_id}`)}
                    className="w-8 h-8 rounded-full bg-procarni-primary hover:bg-procarni-primary/95 text-white flex items-center justify-center p-0 active:scale-95 transition-all"
                  >
                    +
                  </Button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {isLoadingSuppliers ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 rounded-xl" />
                      <Skeleton className="h-12 rounded-xl" />
                    </div>
                  ) : suppliers.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 italic">
                      No hay proveedores asociados a este material.
                    </div>
                  ) : (
                    suppliers.map((sup: any) => (
                      <div 
                        key={sup.id}
                        onClick={() => navigate(`/suppliers/${sup.id}`)}
                        className="flex items-center gap-4 p-3 hover:bg-slate-50/50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200/50"
                      >
                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-procarni-primary font-bold text-xs border border-slate-200">
                          {sup.name ? sup.name.substring(0, 2).toUpperCase() : 'PV'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-slate-800 truncate">{sup.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">
                            Especificación: {sup.specification || 'General'}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Últimos usos en Recetas */}
              <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-6 rounded-[2rem] shadow-xl shadow-gray-200/50">
                <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                  <ChefHat className="h-5 w-5 text-procarni-primary" />
                  <h4 className="font-extrabold text-sm text-procarni-dark tracking-tight">Últimos usos en Recetas</h4>
                </div>

                <div className="space-y-3">
                  {isLoadingRecipeUses ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 rounded-xl" />
                    </div>
                  ) : recipeUses.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 italic">
                      No hay usos en recetas registrados para este material.
                    </div>
                  ) : (
                    recipeUses.map((use: any) => (
                      <div key={use.id} className="flex items-center justify-between p-3 border-b border-slate-100">
                        <div>
                          <p className="font-bold text-xs text-slate-800">
                            {use.destination_data?.producto_fabricado || 'Despacho de Producción'}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Uso: {fmt(Number(use.quantity || use.actual_quantity || 0), 2)} {material.unit} | Lotes: {use.destination_data?.lotes_planificados || 'N/A'}
                          </p>
                        </div>
                        <Badge className="bg-emerald-50 text-procarni-secondary border-none text-[10px]">
                          {new Date(use.transaction_date).toLocaleDateString()}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 p-3 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl text-[10px] text-gray-400 text-center italic">
                  Este apartado se alimenta automáticamente al registrar salidas por producción (despachos de recetas vía JSON).
                </div>
              </section>
            </div>
          </div>

          {/* Sticky Action Sidebar */}
          <div className="col-span-12 lg:col-span-3">
            <div className="sticky top-24 space-y-6">
              <div className="bg-procarni-dark rounded-[2rem] p-6 shadow-2xl text-white space-y-6">
                <div className="pb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Acciones de Material</p>
                  
                  {/* Historial navigation as Sheet Drawer */}
                  <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                    <SheetTrigger asChild>
                      <Button 
                        onClick={() => {
                          setActiveHistoryTab('kardex');
                          setIsHistoryOpen(true);
                        }}
                        className="w-full flex items-center justify-between bg-white/10 hover:bg-white/20 px-4 py-6 rounded-xl transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <History className="h-4 w-4 text-slate-300" />
                          <span className="font-bold text-xs text-slate-100">Ver Historial</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Button>
                    </SheetTrigger>
                    
                    {/* Shortcuts grid below */}
                    <div className="grid grid-cols-3 gap-2 px-1 mt-3 pb-2 border-b border-white/10">
                      <Button 
                        onClick={() => {
                          setActiveHistoryTab('kardex');
                          setIsHistoryOpen(true);
                        }}
                        className="text-[9px] font-bold h-7 bg-white/5 hover:bg-procarni-primary transition-colors text-slate-200"
                      >
                        KARDEX
                      </Button>
                      <Button 
                        onClick={() => {
                          setActiveHistoryTab('precios');
                          setIsHistoryOpen(true);
                        }}
                        className="text-[9px] font-bold h-7 bg-white/5 hover:bg-procarni-primary transition-colors text-slate-200"
                      >
                        PRECIOS
                      </Button>
                      <Button 
                        onClick={() => {
                          setActiveHistoryTab('ocs');
                          setIsHistoryOpen(true);
                        }}
                        className="text-[9px] font-bold h-7 bg-white/5 hover:bg-procarni-primary transition-colors text-slate-200"
                      >
                        OCs
                      </Button>
                    </div>

                    <SheetContent className="w-full sm:max-w-2xl bg-white/95 backdrop-blur-2xl text-slate-900 border-l border-slate-200/80 p-6 overflow-y-auto shadow-2xl animate-in fade-in">
                      <SheetHeader className="pb-4 border-b border-slate-100">
                        <SheetTitle className="text-xl font-black text-procarni-blue tracking-tight">
                          Historial de Material
                        </SheetTitle>
                        <p className="text-xs text-slate-500 font-medium">SKU: {material.sku} | {material.materials?.name}</p>
                      </SheetHeader>
                      <Tabs value={activeHistoryTab} onValueChange={setActiveHistoryTab} className="w-full mt-6">
                        <TabsList className="grid w-full grid-cols-3 bg-slate-100 p-1 rounded-xl">
                          <TabsTrigger 
                            value="kardex" 
                            className="text-xs font-bold py-2 rounded-lg text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue transition-all"
                          >
                            Kardex
                          </TabsTrigger>
                          <TabsTrigger 
                            value="precios" 
                            className="text-xs font-bold py-2 rounded-lg text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue transition-all"
                          >
                            Precios
                          </TabsTrigger>
                          <TabsTrigger 
                            value="ocs" 
                            className="text-xs font-bold py-2 rounded-lg text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue transition-all"
                          >
                            OCs
                          </TabsTrigger>
                        </TabsList>
                        
                        {/* Kardex Tab */}
                        <TabsContent value="kardex" className="space-y-4 mt-4">
                          {isLoadingKardex ? (
                            <div className="space-y-2">
                              <Skeleton className="h-12 rounded-xl bg-slate-100" />
                              <Skeleton className="h-12 rounded-xl bg-slate-100" />
                            </div>
                          ) : kardexHistory.length === 0 ? (
                            <p className="text-xs text-gray-500 italic py-4 text-center">Sin transacciones de Kardex registradas.</p>
                          ) : (
                            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                              {kardexHistory.map((tx: any) => {
                                let typeLabel = tx.transaction_type;
                                let typeColor = 'text-slate-600 bg-slate-50 border-slate-200';
                                if (tx.transaction_type === 'IN_PURCHASE' || tx.transaction_type === 'IN_DIRECT') {
                                  typeLabel = 'Entrada';
                                  typeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200/50';
                                } else if (tx.transaction_type.startsWith('OUT_')) {
                                  typeLabel = 'Salida';
                                  typeColor = 'bg-red-50 text-procarni-primary border-procarni-primary/20';
                                } else if (tx.transaction_type.startsWith('ADJUSTMENT_')) {
                                  typeLabel = 'Ajuste';
                                  typeColor = 'bg-amber-50 text-procarni-alert border-procarni-alert/20';
                                }
                                return (
                                  <div key={tx.id} className="p-4 border border-slate-200/80 rounded-2xl bg-white flex justify-between items-start text-xs shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                                    <div className="space-y-1.5">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className={cn("font-bold text-[9px] px-1.5 py-0.5", typeColor)}>
                                          {typeLabel}
                                        </Badge>
                                        <span className="font-mono text-slate-500 font-semibold">
                                          {new Date(tx.transaction_date).toLocaleDateString()}
                                        </span>
                                      </div>
                                      <p className="text-slate-700 font-bold">Doc: {tx.reference_doc || '—'}</p>
                                      {tx.audit_note && <p className="text-[10px] text-slate-500 italic font-mono bg-slate-50 px-2 py-1 rounded-md border border-slate-100 mt-1">{tx.audit_note}</p>}
                                    </div>
                                    <div className="text-right space-y-1">
                                      <p className="font-extrabold text-slate-900 font-mono">
                                        {tx.transaction_type.startsWith('OUT_') ? '-' : '+'}{fmt(Number(tx.quantity || tx.actual_quantity || 0), 2)} {material.unit}
                                      </p>
                                      <p className="text-[10px] text-slate-500 font-mono">Stock final: <span className="font-bold text-slate-700">{fmt(Number(tx.stock_after || 0), 2)}</span></p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>
                        
                        {/* Precios Tab */}
                        <TabsContent value="precios" className="space-y-4 mt-4">
                          {priceHistory.length === 0 ? (
                            <p className="text-xs text-gray-500 italic py-4 text-center">Sin historial de precios registrado.</p>
                          ) : (
                            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                              {priceHistory.map((ph: any) => {
                                const po = ph.purchase_orders;
                                const year = po?.issue_date ? new Date(po.issue_date).getFullYear() : new Date(ph.recorded_at).getFullYear();
                                const month = po?.issue_date ? String(new Date(po.issue_date).getMonth() + 1).padStart(2, '0') : String(new Date(ph.recorded_at).getMonth() + 1).padStart(2, '0');
                                const displayId = po ? `OC-${year}-${month}-${String(po.sequence_number || 0).padStart(3, '0')}` : (ph.reference_doc || 'OC');
                                return (
                                  <div key={ph.id || ph.recorded_at} className="p-4 border border-slate-200/80 rounded-2xl bg-white flex justify-between items-center text-xs shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                                    <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                                      <p className="font-bold text-slate-800 text-sm truncate">{ph.suppliers?.name || 'Desconocido'}</p>
                                      <div className="flex items-center gap-2 text-slate-500 font-semibold">
                                        <span className="font-mono">{new Date(ph.recorded_at).toLocaleDateString()}</span>
                                        <span>•</span>
                                        {po ? (
                                          <span 
                                            onClick={() => navigate(`/purchase-orders/${po.id}`)}
                                            className="text-procarni-blue hover:underline cursor-pointer font-bold"
                                          >
                                            Ref: {displayId}
                                          </span>
                                        ) : (
                                          <span>Ref: {displayId}</span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right font-mono space-y-0.5">
                                      <p className="font-extrabold text-procarni-secondary text-sm">${fmt(ph.unit_price, 4)}</p>
                                      <p className="text-[10px] text-slate-500 font-bold">/ {ph.unit || material.unit}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>
                        
                        {/* OCs Tab */}
                        <TabsContent value="ocs" className="space-y-4 mt-4">
                          {isLoadingPOs ? (
                            <div className="space-y-2">
                              <Skeleton className="h-12 rounded-xl bg-slate-100" />
                              <Skeleton className="h-12 rounded-xl bg-slate-100" />
                            </div>
                          ) : materialPOs.length === 0 ? (
                            <p className="text-xs text-gray-500 italic py-4 text-center">Sin órdenes de compra registradas para este ítem.</p>
                          ) : (
                            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                              {materialPOs.map((item: any) => {
                                const po = item.purchase_orders;
                                if (!po) return null;
                                const year = po.issue_date ? new Date(po.issue_date).getFullYear() : new Date().getFullYear();
                                const month = po.issue_date ? String(new Date(po.issue_date).getMonth() + 1).padStart(2, '0') : '01';
                                const displayId = `OC-${year}-${month}-${String(po.sequence_number || 0).padStart(3, '0')}`;
                                return (
                                  <div 
                                    key={item.id} 
                                    onClick={() => navigate(`/purchase-orders/${po.id}`)}
                                    className="p-4 border border-slate-200/80 rounded-2xl bg-white flex justify-between items-center text-xs cursor-pointer shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
                                  >
                                    <div className="space-y-1.5 min-w-0 flex-1 pr-3">
                                      <div className="flex items-center gap-2">
                                        <span className="font-extrabold text-procarni-blue text-sm">{displayId}</span>
                                        <Badge variant="outline" className="text-[9px] font-extrabold uppercase tracking-wider py-0.5 px-2 border-slate-300 bg-slate-50 text-slate-700 rounded-md">
                                          {translateStatus(po.status)}
                                        </Badge>
                                      </div>
                                      <p className="text-slate-800 font-bold truncate">{po.suppliers?.name || 'Desconocido'}</p>
                                      <p className="text-[10px] text-slate-500 font-mono font-semibold">
                                        F. Emisión: {po.issue_date ? new Date(po.issue_date).toLocaleDateString() : '—'}
                                      </p>
                                    </div>
                                    <div className="text-right font-mono space-y-0.5">
                                      <p className="font-bold text-slate-800 text-sm">{fmt(item.quantity, 2)} {material.unit}</p>
                                      <p className="text-[10px] text-slate-500 font-bold">${fmt(item.unit_price, 4)} / {material.unit}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </SheetContent>
                  </Sheet>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <Button 
                    disabled={isSaving}
                    onClick={handleSaveChanges}
                    className="w-full bg-procarni-primary hover:bg-procarni-primary/95 text-white py-6 rounded-2xl font-bold shadow-lg shadow-procarni-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                  </Button>
                  
                  <Button 
                    onClick={handleGenerarOrdenCompra}
                    className="w-full bg-white text-procarni-dark hover:bg-slate-50 py-6 rounded-2xl font-bold hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs border border-slate-200"
                  >
                    <ShoppingCart className="h-4 w-4 text-procarni-primary" />
                    Generar Orden Compra
                  </Button>
                </div>
              </div>

              {/* Additional Context Card / Audit */}
              <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] border border-dashed border-slate-200/80 shadow-md">
                <div className="flex items-center gap-2 text-gray-400 mb-2">
                  <AlertCircle className="h-4 w-4 text-gray-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Auditoría</span>
                </div>
                <p className="text-[11px] text-gray-500 font-medium italic leading-relaxed">
                  Habilitado: {new Date(material.created_at).toLocaleDateString()}<br />
                  Habilitado por: {material.enabled_by ? 'ID ' + material.enabled_by.substring(0, 8) : 'Sistema'}
                </p>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default MaterialInventoryProfile;
