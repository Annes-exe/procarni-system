import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, Instagram, PlusCircle, ShoppingCart, FileText, MoreVertical, Check, DollarSign, Edit, Mail, Globe, MapPin, CreditCard, Calendar, Loader2, Search, AlertTriangle, TrendingUp, TrendingDown, Clock, ArrowUpRight, Activity, Percent, ChevronDown, ChevronRight, Package, Wrench } from 'lucide-react';
import InlineEditableCell from '@/components/InlineEditableCell';

import { getSupplierDetails, getFichaTecnicaBySupplierAndProduct, getFichaTecnicaBySupplierId, updateSupplier, updateMaterial, getAllMaterialCategories, getPurchaseHistoryReport, getPriceHistoryBySupplierId } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { detectLocation } from '@/utils/location-detector';
import { isGenericRif, validateRif } from '@/utils/validators';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, TriangleAlert } from 'lucide-react';
import { FichaTecnica, Supplier, SupplierMaterialPayload } from '@/integrations/supabase/types'; // Import Supplier type
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import SupplierPriceHistoryDownloadButton from '@/components/SupplierPriceHistoryDownloadButton';
import SupplierForm from '@/components/SupplierForm'; // Import SupplierForm
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { serviceOrderService } from '@/services/serviceOrderService';
import { calculateTotals } from '@/utils/calculations';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';


interface MaterialAssociation {
  id: string; // ID of supplier_materials entry
  material_id: string;
  unit_id: string | null;
  specification?: string;
  materials: {
    id: string;
    name: string;
    code?: string;
    category?: string;
  };
  units_of_measure?: {
    id: string;
    name: string;
  };
  hasFichaResult?: boolean;
  isLoadingFicha?: boolean;
}

interface SupplierDetailsData {
  id: string;
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
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
  alert_comment: string | null;
  materials?: MaterialAssociation[];
}

const SupplierDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentFichaUrl, setCurrentFichaUrl] = useState('');
  const [currentFichaTitle, setCurrentFichaTitle] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAnalysisMaterial, setSelectedAnalysisMaterial] = useState<string>('all');

  // Expanded row state for OC & OS accordion (only 1 row open per table)
  const [expandedOcId, setExpandedOcId] = useState<string | null>(null);
  const [expandedOsId, setExpandedOsId] = useState<string | null>(null);

  const { data: supplier, isLoading, error } = useQuery<SupplierDetailsData | null>({
    queryKey: ['supplierDetails', id],
    queryFn: async () => {
      if (!id) throw new Error('Supplier ID is missing.');
      const details = await getSupplierDetails(id);
      if (!details) throw new Error('Supplier not found.');
      return details as SupplierDetailsData;
    },
    enabled: !!id,
  });

  const { data: purchaseOrders = [], isLoading: isLoadingPOs } = useQuery({
    queryKey: ['supplierPurchaseOrders', id],
    queryFn: () => purchaseOrderService.getBySupplierId(id!),
    enabled: !!id,
  });

  const { data: serviceOrders = [], isLoading: isLoadingSOs } = useQuery({
    queryKey: ['supplierServiceOrders', id],
    queryFn: () => serviceOrderService.getBySupplierId(id!),
    enabled: !!id,
  });

  const { data: supplierPriceHistory = [], isLoading: isLoadingPriceHistory } = useQuery({
    queryKey: ['supplierPriceHistory', id],
    queryFn: () => getPriceHistoryBySupplierId(id!),
    enabled: !!id,
  });


  // --- Optimized Batch Fetch: 1 single query for all fichas tecnicas of the supplier ---
  const { data: supplierFichas = [], isLoading: isLoadingFichaStatus } = useQuery({
    queryKey: ['supplierFichas', supplier?.id],
    queryFn: () => getFichaTecnicaBySupplierId(supplier!.id),
    enabled: !!supplier?.id,
    staleTime: 1000 * 60 * 5,
  });

  const fichasSet = useMemo(() => {
    const set = new Set<string>();
    (supplierFichas || []).forEach((f: any) => {
      if (f.nombre_producto) {
        set.add(f.nombre_producto.trim().toLowerCase());
      }
    });
    return set;
  }, [supplierFichas]);

  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
    staleTime: 1000 * 60 * 10,
  });

  // Combine materials with their ficha status from the batch set
  const materialsWithStatus = useMemo(() => {
    if (!supplier?.materials) return [];
    return supplier.materials.map((sm) => {
      const matNameLower = sm.materials?.name ? sm.materials.name.trim().toLowerCase() : '';
      return {
        ...sm,
        hasFichaResult: matNameLower ? fichasSet.has(matNameLower) : false,
        isLoadingFicha: isLoadingFichaStatus
      };
    });
  }, [supplier?.materials, fichasSet, isLoadingFichaStatus]);

  // Fetch supplier purchase history
  const { data: purchaseHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['supplierPurchaseHistory', id],
    queryFn: async () => {
      if (!id) return [];
      return getPurchaseHistoryReport({ supplierId: id, status: 'Approved' });
    },
    enabled: !!id,
  });

  // Calculate Top 10 most purchased materials from history
  const suggestedMaterials = useMemo(() => {
    if (!purchaseHistory || purchaseHistory.length === 0) return [];

    const materialMap: Record<string, {
      material_id: string | null;
      material_name: string;
      supplier_code: string | null;
      unit: string | null;
      unit_id: string | null;
      is_exempt: boolean;
      unit_price: number;
      count: number;
      dates: Date[];
    }> = {};

    purchaseHistory.forEach((item: any) => {
      const key = item.material_id || item.material_name;
      if (!key) return;

      const orderDate = item.purchase_orders?.issue_date ? new Date(item.purchase_orders.issue_date) : new Date(0);

      if (!materialMap[key]) {
        materialMap[key] = {
          material_id: item.material_id || null,
          material_name: item.material_name,
          supplier_code: item.supplier_code || null,
          unit: item.unit || null,
          unit_id: item.unit_id || null,
          is_exempt: !!item.is_exempt,
          unit_price: item.unit_price,
          count: 0,
          dates: [orderDate],
        };
      } else {
        materialMap[key].dates.push(orderDate);
        const currentDates = materialMap[key].dates;
        const latestDateIndex = currentDates.findIndex(d => d.getTime() === Math.max(...currentDates.map(x => x.getTime())));
        if (latestDateIndex === currentDates.length - 1) {
          materialMap[key].unit_price = item.unit_price;
        }
      }
      materialMap[key].count += 1;
    });

    return Object.values(materialMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [purchaseHistory]);

  const [selectedSuggestIds, setSelectedSuggestIds] = useState<Set<string>>(new Set());

  // Initialize selectedSuggestIds when suggestedMaterials is loaded/calculated
  React.useEffect(() => {
    if (suggestedMaterials.length > 0) {
      const initialIds = new Set<string>();
      suggestedMaterials.forEach(m => {
        const key = m.material_id || m.material_name;
        if (key) initialIds.add(key);
      });
      setSelectedSuggestIds(initialIds);
    }
  }, [suggestedMaterials]);

  const toggleSuggestSelection = (key: string) => {
    setSelectedSuggestIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleGenerateOCFromSuggestions = () => {
    if (!supplier) return;

    const selectedItems = suggestedMaterials
      .filter(m => {
        const key = m.material_id || m.material_name;
        return key && selectedSuggestIds.has(key);
      })
      .map(m => ({
        material_id: m.material_id,
        material_name: m.material_name,
        supplier_code: m.supplier_code,
        unit_price: m.unit_price,
        is_exempt: m.is_exempt,
        unit: m.unit,
        unit_id: m.unit_id,
      }));

    if (selectedItems.length === 0) {
      showError('Por favor selecciona al menos un material sugerido.');
      return;
    }

    navigate('/generate-po', {
      state: {
        supplier: supplier,
        suggestedItems: selectedItems,
      },
    });
  };

  const filteredMaterials = useMemo(() => {
    if (!materialsWithStatus) return [];
    if (!searchTerm.trim()) return materialsWithStatus;

    const lowerSearch = searchTerm.toLowerCase();
    return materialsWithStatus.filter(sm =>
      sm.materials.name.toLowerCase().includes(lowerSearch) ||
      sm.materials.code?.toLowerCase().includes(lowerSearch) ||
      sm.materials.category?.toLowerCase().includes(lowerSearch) ||
      sm.units_of_measure?.name.toLowerCase().includes(lowerSearch)
    );
  }, [materialsWithStatus, searchTerm]);

  const groupedMaterials = useMemo(() => {
    const groups: Record<string, {
      material_id: string;
      name: string;
      code?: string;
      category?: string;
      items: any[];
    }> = {};

    filteredMaterials.forEach(sm => {
      const mId = sm.material_id;
      if (!groups[mId]) {
        groups[mId] = {
          material_id: mId,
          name: sm.materials.name,
          code: sm.materials.code,
          category: sm.materials.category,
          items: []
        };
      }
      groups[mId].items.push(sm);
    });

    return Object.values(groups);
  }, [filteredMaterials]);

  const stats = useMemo(() => {
    const approvedPOs = purchaseOrders.filter(o => ['Approved', 'Paid', 'Credit', 'Received', 'ToPay'].includes(o.status));
    const approvedSOs = serviceOrders.filter(o => ['Approved', 'Paid', 'Credit'].includes(o.status));

    let totalUSD = 0;
    approvedPOs.forEach(po => {
      const items = po.purchase_order_items || [];
      const orderTotal = calculateTotals(items).total;
      if (po.currency === 'VES' && po.exchange_rate) {
        totalUSD += orderTotal / po.exchange_rate;
      } else {
        totalUSD += orderTotal;
      }
    });

    approvedSOs.forEach(so => {
      const items = [
        ...(so.service_order_items || []).map(i => ({ ...i, unit_price: i.unit_price })),
        ...(so.service_order_materials || []).map(m => ({ ...m, unit_price: m.unit_price }))
      ];
      const orderTotal = calculateTotals(items as any).total;
      if (so.currency === 'VES' && so.exchange_rate) {
        totalUSD += orderTotal / so.exchange_rate;
      } else {
        totalUSD += orderTotal;
      }
    });

    return {
      totalTransactedUSD: totalUSD,
      totalOrdersCount: purchaseOrders.length + serviceOrders.length,
      approvedOrdersCount: approvedPOs.length + approvedSOs.length,
      materialsCount: supplier?.materials?.length || 0
    };
  }, [purchaseOrders, serviceOrders, supplier]);

  const priceAnalysisByMaterial = useMemo(() => {
    if (!supplierPriceHistory || supplierPriceHistory.length === 0) return [];
    
    const groups: Record<string, {
      materialId: string;
      name: string;
      code: string;
      unit: string;
      prices: number[];
      dates: Date[];
      latestPrice: number;
      latestDate: string;
      currency: string;
    }> = {};

    supplierPriceHistory.forEach(entry => {
      const matId = entry.material_id;
      if (!matId) return;

      const matName = entry.materials?.name || 'Desconocido';
      const matCode = entry.materials?.code || 'S/C';
      const matUnit = entry.units_of_measure?.name || entry.materials?.unit || 'UND';
      const price = entry.unit_price;
      const date = new Date(entry.recorded_at);

      if (!groups[matId]) {
        groups[matId] = {
          materialId: matId,
          name: matName,
          code: matCode,
          unit: matUnit,
          prices: [price],
          dates: [date],
          latestPrice: price,
          latestDate: entry.recorded_at,
          currency: entry.currency
        };
      } else {
        groups[matId].prices.push(price);
        groups[matId].dates.push(date);
        
        if (new Date(entry.recorded_at) > new Date(groups[matId].latestDate)) {
          groups[matId].latestPrice = price;
          groups[matId].latestDate = entry.recorded_at;
          groups[matId].currency = entry.currency;
        }
      }
    });

    return Object.values(groups).map(g => {
      const min = Math.min(...g.prices);
      const max = Math.max(...g.prices);
      const avg = g.prices.reduce((sum, p) => sum + p, 0) / g.prices.length;
      
      let trend: 'up' | 'down' | 'stable' = 'stable';
      if (g.latestPrice > avg * 1.02) trend = 'up';
      else if (g.latestPrice < avg * 0.98) trend = 'down';

      return {
        ...g,
        min,
        max,
        avg,
        trend
      };
    });
  }, [supplierPriceHistory]);

  const chartData = useMemo(() => {
    if (!supplierPriceHistory || supplierPriceHistory.length === 0) return [];
    
    const filtered = selectedAnalysisMaterial === 'all'
      ? supplierPriceHistory
      : supplierPriceHistory.filter(h => h.material_id === selectedAnalysisMaterial);

    return filtered
      .map(entry => ({
        fechaFormato: format(new Date(entry.recorded_at), 'dd/MM/yyyy'),
        rawDate: new Date(entry.recorded_at),
        Precio: entry.unit_price,
        material: entry.materials?.name || 'Material',
        moneda: entry.currency
      }))
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [supplierPriceHistory, selectedAnalysisMaterial]);

  const uniquePriceMaterials = useMemo(() => {
    if (!supplierPriceHistory || supplierPriceHistory.length === 0) return [];
    const seen = new Set();
    return supplierPriceHistory
      .map(h => ({ id: h.material_id, name: h.materials?.name || 'Desconocido' }))
      .filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
  }, [supplierPriceHistory]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Draft':
        return <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 uppercase text-[9px] font-bold">Borrador</Badge>;
      case 'Approved':
        return <Badge className="bg-green-50 text-green-700 border-green-200 uppercase text-[9px] font-bold">Aprobada</Badge>;
      case 'Paid':
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 uppercase text-[9px] font-bold">Pagada</Badge>;
      case 'Credit':
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 uppercase text-[9px] font-bold">Crédito</Badge>;
      case 'ToPay':
        return <Badge className="bg-yellow-50 text-yellow-800 border-yellow-200 uppercase text-[9px] font-bold">Por Pagar</Badge>;
      case 'Received':
        return <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 uppercase text-[9px] font-bold">Recibido</Badge>;
      case 'Archived':
        return <Badge variant="secondary" className="uppercase text-[9px] font-bold">Archivada</Badge>;
      case 'Rejected':
        return <Badge className="bg-red-50 text-red-700 border-red-200 uppercase text-[9px] font-bold">Rechazada</Badge>;
      default:
        return <Badge variant="outline" className="uppercase text-[9px] font-bold">{status}</Badge>;
    }
  };
  // --------------------------------------------------------------------

  // Mutation for updating supplier
  const updateMutation = useMutation({
    mutationFn: ({ id, supplierData, materials }: { id: string; supplierData: Partial<Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'materials'>>; materials: SupplierMaterialPayload[] }) =>
      updateSupplier(id, supplierData, materials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setIsEditOpen(false);
      showSuccess('Proveedor actualizado exitosamente.');
    },
    onError: (err) => {
      showError(`Error al actualizar proveedor: ${err.message}`);
    },
  });

  // Inline-only mutation: patches a single field directly, never touches supplier_materials.
  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ field, value }: { field: string; value: string | number }) => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      let payloadValue: any = value;
      
      if (field === 'rif') {
        const validated = validateRif(String(value));
        if (!validated) {
          throw new Error('Formato de RIF inválido. Ej: J123456789 o SR');
        }
        if (validated === 'SR') {
          // Generar sufijo invisible para evadir constraint unique
          const invisibleSuffix = Date.now().toString().split('').map(d => String.fromCharCode(0x200B + (parseInt(d) % 3))).join('');
          payloadValue = 'SR' + invisibleSuffix;
        } else {
          payloadValue = validated;
        }
      } else if (field === 'name') {
        payloadValue = String(value).toUpperCase();
      }
      
      const payload = { [field]: payloadValue };
      
      // Auto-detect location when address changes
      if (field === 'address') {
        const { state, city } = detectLocation(String(value));
        if (state) payload.state = state;
        if (city) payload.city = city;
      }

      const { error } = await supabase
        .from('suppliers')
        .update(payload)
        .eq('id', id!);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
      showSuccess('Campo actualizado.');
    },
    onError: (err: any) => {
      if (err?.code === '23505') {
        showError('El RIF ingresado ya pertenece a otro proveedor. Verifícalo e intenta de nuevo.');
      } else {
        showError('No se pudo actualizar el campo. Intenta de nuevo.');
      }
    },
  });

  const handleInlineSave = (field: string) => async (newValue: string | number) => {
    await inlineUpdateMutation.mutateAsync({ field, value: newValue });
  };

  // Mutation for inline editing of materials in the list (with tripa logic)
  const materialInlineUpdateMutation = useMutation({
    mutationFn: async ({ materialId, field, value }: { materialId: string; field: string; value: string }) => {
      const updates: Record<string, string> = { [field]: value };

      // Apply tripa auto-fill: if renaming to "tripa...", force EMPAQUE + mt
      if (field === 'name' && value.toLowerCase().startsWith('tripa')) {
        const empaqueCategory = categories.find(c => c.name.toUpperCase() === 'EMPAQUE');
        const { getAllUnits } = await import('@/integrations/supabase/data');
        const allUnits = await getAllUnits();
        const mtUnitObj = allUnits.find((u: any) => u.name.toLowerCase() === 'mt');
        if (empaqueCategory) updates['category'] = empaqueCategory.name;
        if (mtUnitObj) updates['unit'] = mtUnitObj.name;
      }

      await updateMaterial(materialId, updates as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
      queryClient.invalidateQueries({ queryKey: ['materials_paginated'] });
      showSuccess('Material actualizado.');
    },
    onError: (err: any) => {
      if (err?.code === '23505') {
        showError('Ya existe un material con ese nombre o código. Revisa los datos e intenta de nuevo.');
      } else {
        showError('No se pudo actualizar el material. Intenta de nuevo.');
      }
    },
  });

  const handleMaterialInlineSave = (materialId: string, field: string) => async (newValue: string) => {
    await materialInlineUpdateMutation.mutateAsync({ materialId, field, value: newValue });
  };

  const handleEditSubmit = async (data: any) => {
    if (!supplier) return;

    const { materials, ...supplierData } = data;
    const materialsPayload = materials?.map((mat: any) => ({
      material_id: mat.material_id,
      unit_id: mat.unit_id || null,
      specification: mat.specification,
    })) || [];

    await updateMutation.mutateAsync({ id: supplier.id, supplierData, materials: materialsPayload });
  };


  const formatPhoneNumberForWhatsApp = (phone: string) => {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly.startsWith('58')) {
      return `58${digitsOnly}`;
    }
    return digitsOnly;
  };

  const handleGenerateSC = () => {
    if (!supplier) return;
    // Navigate to the quote request creation page with the supplier data
    navigate('/generate-quote', {
      state: {
        supplier: supplier,
      },
    });
  };

  const handleGenerateOC = () => {
    if (!supplier) return;
    // Navigate to the purchase order creation page with the supplier data
    navigate('/generate-po', {
      state: {
        supplier: supplier,
      },
    });
  };

  const handleViewFicha = async (materialName: string) => {
    if (!supplier?.id) {
      showError('ID de proveedor no disponible.');
      return;
    }

    const ficha: FichaTecnica | null = await getFichaTecnicaBySupplierAndProduct(supplier.id, materialName);

    if (ficha && ficha.storage_url) {
      setCurrentFichaUrl(ficha.storage_url);
      setCurrentFichaTitle(`Ficha Técnica: ${materialName}`);
      setIsViewerOpen(true);
    } else {
      // This case should ideally not be reached if the button is only shown when hasFicha is true
      showError(`No se encontró una ficha técnica para el material "${materialName}" de este proveedor.`);
    }
  };

  if (isLoading || isLoadingFichaStatus) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-procarni-secondary" />
        <span className="ml-2 text-gray-500 font-medium">Cargando detalles del proveedor...</span>
      </div>
    );
  }

  if (error) {
    showError(error.message);
    return (
      <div className="container mx-auto p-4 text-center text-destructive">
        Error: {error.message}
        <Button asChild variant="link" className="mt-4">
          <Link to="/supplier-management">Volver a la gestión de proveedores</Link>
        </Button>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="container mx-auto p-4 text-center text-muted-foreground">
        Proveedor no encontrado.
        <Button asChild variant="link" className="mt-4">
          <Link to="/supplier-management">Volver a la gestión de proveedores</Link>
        </Button>
      </div>
    );
  }

  const isEditable = true;
  const microLabelClass = "text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1 block";
  const tableHeaderClass = "text-[10px] uppercase tracking-wider font-bold text-slate-600";
  const valueClass = "text-procarni-dark font-medium text-sm";

  return (
    <div className="container mx-auto p-4 pb-24 relative min-h-screen">

      {/* Back navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="text-gray-500 hover:text-procarni-dark hover:bg-gray-100/50 rounded-full gap-2 px-3 py-1">
          <ArrowLeft className="h-4 w-4" />
          <span>Volver</span>
        </Button>
      </div>

      {/* PHASE 1.5: SUPPLIER ALERT */}
      {supplier.alert_comment && (
        <Alert variant="destructive" className="mb-6 bg-red-50 border-red-200 text-red-900 animate-in fade-in slide-in-from-top-4 duration-500 shadow-sm rounded-2xl">
          <TriangleAlert className="h-4 w-4 text-red-600" />
          <AlertTitle className="text-red-800 font-bold flex items-center gap-2">
            Aviso Importante para este Proveedor
          </AlertTitle>
          <AlertDescription className="text-red-700 font-medium mt-1 leading-relaxed">
            {supplier.alert_comment}
          </AlertDescription>
        </Alert>
      )}

      {/* BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 items-stretch">
        
        {/* Bento Box 1: Identidad y Acciones (col-span-2) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-white/70 to-blue-50/20 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-xl shadow-gray-200/50 flex flex-col justify-between hover:scale-[1.002] transition-transform duration-300">
          <div>
            <div className="flex items-center gap-2.5 mb-4 flex-wrap">
              <Badge className={cn(
                "px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-none border",
                supplier.status === 'Activo' ? "bg-green-50 text-procarni-secondary border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
              )}>
                {supplier.status}
              </Badge>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider bg-gray-100/70 px-2 py-0.5 rounded">
                Código: {supplier.code || 'N/A'}
              </span>
            </div>

            <h1 className="text-3xl font-extrabold text-procarni-blue tracking-tight mb-6">
              <InlineEditableCell
                value={supplier.name}
                onSave={handleInlineSave('name')}
                alwaysShowIcon={isMobile}
                displayClassName="font-extrabold text-3xl text-procarni-blue tracking-tight whitespace-normal break-words leading-none"
                placeholder="Nombre del proveedor"
              />
            </h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-white/40 border border-white/60 p-3 rounded-2xl">
                <span className={microLabelClass}>RIF del Proveedor</span>
                <InlineEditableCell
                  value={isGenericRif(supplier.rif) ? '' : supplier.rif}
                  onSave={handleInlineSave('rif')}
                  alwaysShowIcon={isMobile}
                  displayClassName={cn(valueClass, isGenericRif(supplier.rif) && 'text-procarni-alert')}
                  placeholder="RIF"
                  renderDisplay={(v) => isGenericRif(supplier.rif) ? (
                    <span className="flex items-center gap-1 text-procarni-alert">
                      <AlertTriangle className="h-3 w-3" /> Faltante
                    </span>
                  ) : <span className="font-bold font-mono">{String(v)}</span>}
                />
              </div>
              
              <div className="bg-white/40 border border-white/60 p-3 rounded-2xl">
                <span className={microLabelClass}>Término de Relación</span>
                <span className="text-xs font-semibold text-gray-500 uppercase">Institucional</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100/50">
            <Button onClick={() => setIsEditOpen(true)} variant="outline" size="sm" className="gap-2 rounded-xl">
              <Edit className="h-4 w-4" />
              <span>Editar Perfil</span>
            </Button>

            <Button onClick={handleGenerateSC} className="bg-procarni-secondary hover:bg-green-700 text-white gap-2 shadow-md rounded-xl" size="sm">
              <PlusCircle className="h-4 w-4" />
              <span>Generar SC</span>
            </Button>

            <Button onClick={handleGenerateOC} variant="outline" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50/50 gap-2 rounded-xl" size="sm">
              <ShoppingCart className="h-4 w-4" />
              <span>Generar OC</span>
            </Button>

            <SupplierPriceHistoryDownloadButton
              supplierId={supplier.id}
              supplierName={supplier.name}
              disabled={isLoading}
              className="ml-auto rounded-xl"
            />
          </div>
        </div>

        {/* Bento Box 2: Canales de Contacto (col-span-1) */}
        <div className="bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-xl shadow-gray-200/50 hover:scale-[1.002] transition-transform duration-300 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-100 pb-2 flex items-center gap-1.5">
              Canales de Contacto
            </h3>
            <div className="space-y-4">
              {/* WhatsApp / Teléfono Principal */}
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
                <span className={microLabelClass}>Teléfono / WhatsApp Principal</span>
                <InlineEditableCell
                  value={supplier.phone || ''}
                  onSave={handleInlineSave('phone')}
                  alwaysShowIcon={isMobile}
                  displayClassName="text-xs font-semibold text-procarni-dark"
                  placeholder="Sin teléfono principal"
                  renderDisplay={(v) => supplier.phone ? (
                    <div className="flex items-center justify-between w-full mt-0.5">
                      <span className="font-mono text-xs font-semibold text-procarni-dark">{supplier.phone}</span>
                      <a
                        href={`https://wa.me/${formatPhoneNumberForWhatsApp(supplier.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50/60 hover:bg-green-50 text-green-700 hover:text-green-800 border border-green-100/50 rounded-xl transition-all font-sans text-[10px] font-bold uppercase tracking-wider"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Chatear
                        <Phone className="h-3 w-3" />
                      </a>
                    </div>
                  ) : <span className="text-xs text-gray-400 font-medium">Sin teléfono principal</span>}
                />
              </div>

              {/* Teléfono Secundario */}
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
                <span className={microLabelClass}>Teléfono Secundario</span>
                <InlineEditableCell
                  value={supplier.phone_2 || ''}
                  onSave={handleInlineSave('phone_2')}
                  alwaysShowIcon={isMobile}
                  displayClassName="text-xs font-semibold text-procarni-dark"
                  placeholder="No asignado"
                  renderDisplay={(v) => v ? (
                    <a href={`https://wa.me/${formatPhoneNumberForWhatsApp(String(v))}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {String(v)}
                    </a>
                  ) : <p className="text-xs text-gray-400 font-medium">No asignado</p>}
                />
              </div>

              {/* Email */}
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
                <span className={microLabelClass}>Correo Electrónico</span>
                <InlineEditableCell
                  value={supplier.email || ''}
                  onSave={handleInlineSave('email')}
                  type="email"
                  alwaysShowIcon={isMobile}
                  displayClassName="text-xs font-semibold text-procarni-dark truncate block max-w-full"
                  placeholder="Sin email registrado"
                />
              </div>

              {/* Instagram */}
              <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
                <span className={microLabelClass}>Instagram</span>
                <InlineEditableCell
                  value={supplier.instagram || ''}
                  onSave={handleInlineSave('instagram')}
                  alwaysShowIcon={isMobile}
                  displayClassName="text-xs font-semibold text-procarni-dark"
                  placeholder="No asignado"
                  renderDisplay={(v) => v ? (
                    <a href={`https://instagram.com/${String(v).replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {String(v)}
                    </a>
                  ) : <p className="text-xs text-gray-400 font-medium">No asignado</p>}
                />
              </div>
            </div>
          </div>

          {/* Website Link button at bottom */}
          {supplier.website && (
            <Button variant="outline" size="sm" asChild className="w-full rounded-xl mt-4 border-gray-200">
              <a href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`} target="_blank" rel="noopener noreferrer" className="gap-2">
                <Globe className="h-3.5 w-3.5 text-gray-500" />
                <span className="truncate">Visitar Sitio Web</span>
              </a>
            </Button>
          )}
        </div>

        {/* Bento Box 3: Condiciones Comerciales (col-span-1) */}
        <div className="bg-gradient-to-br from-white/70 to-green-50/10 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-xl shadow-gray-200/50 hover:scale-[1.002] transition-transform duration-300">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-100 pb-2 flex items-center gap-1.5">
            Condiciones de Compra
          </h3>
          <div className="space-y-4">
            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <span className={microLabelClass}>Términos de Pago</span>
              <InlineEditableCell
                value={supplier.payment_terms}
                onSave={handleInlineSave('payment_terms')}
                type="select"
                options={[
                  { value: 'Contado', label: 'Contado' },
                  { value: 'Crédito', label: 'Crédito' },
                  { value: 'Otro', label: 'Otro' }
                ]}
                alwaysShowIcon={isMobile}
                displayClassName="text-sm font-bold text-procarni-dark"
                renderDisplay={(v) => (
                  <p className="text-sm font-bold text-procarni-dark">
                    {v === 'Otro' && supplier.custom_payment_terms
                      ? supplier.custom_payment_terms
                      : String(v)}
                  </p>
                )}
              />
            </div>

            <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-2xl">
              <span className={microLabelClass}>Días de Crédito</span>
              <InlineEditableCell
                value={supplier.credit_days}
                onSave={handleInlineSave('credit_days')}
                type="number"
                alwaysShowIcon={isMobile}
                displayClassName="text-sm font-bold text-procarni-dark"
                renderDisplay={(v) => <p className="text-sm font-bold text-procarni-dark">{v} días acordados</p>}
              />
            </div>
          </div>
        </div>

        {/* Bento Box 4: Ubicación (col-span-2) */}
        <div className="lg:col-span-2 bg-white/70 backdrop-blur-xl border border-white/50 rounded-3xl p-6 shadow-xl shadow-gray-200/50 hover:scale-[1.002] transition-transform duration-300 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4 border-b border-gray-100 pb-2 flex items-center gap-1.5">
              Dirección y Ubicación
            </h3>
            <div className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl min-h-[80px]">
              <span className={microLabelClass}>Dirección Fiscal Principal</span>
              <InlineEditableCell
                value={supplier.address || ''}
                onSave={handleInlineSave('address')}
                alwaysShowIcon={isMobile}
                displayClassName="text-xs font-medium text-gray-700 leading-relaxed block"
                placeholder="Sin dirección física registrada"
              />
            </div>
          </div>

          {(supplier.city || supplier.state) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-gray-100/50">
              <div className="bg-blue-50/50 border border-blue-100/40 px-3 py-1 rounded-full text-[11px] text-blue-700 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="h-3 w-3 text-blue-500" />
                <span>Ubicación de Despacho: {supplier.city}{supplier.city && supplier.state ? ', ' : ''}{supplier.state}</span>
              </div>
            </div>
          )}
        </div>

      </div>

      <Tabs defaultValue="materials" className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <TabsList className="bg-slate-100/80 backdrop-blur-xl p-1.5 rounded-2xl h-auto flex flex-col sm:flex-row border border-slate-200/50 gap-1 w-full max-w-full sm:max-w-2xl shadow-sm">
              <TabsTrigger value="materials" className="w-full sm:flex-1 rounded-xl py-2.5 px-3 text-xs font-bold uppercase tracking-wider text-center">
                Materiales Ofrecidos
              </TabsTrigger>
              <TabsTrigger value="orders" className="w-full sm:flex-1 rounded-xl py-2.5 px-3 text-xs font-bold uppercase tracking-wider text-center">
                Historial de Órdenes ({purchaseOrders.length + serviceOrders.length})
              </TabsTrigger>
              <TabsTrigger value="analysis" className="w-full sm:flex-1 rounded-xl py-2.5 px-3 text-xs font-bold uppercase tracking-wider text-center">
                Análisis de Precios
              </TabsTrigger>
            </TabsList>

            {/* TAB 1: MATERIALS & SUGGESTIONS */}
            <TabsContent value="materials" className="space-y-6 focus-visible:outline-none">
              {/* Sugerencias de Compra Card */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                        <span className="flex h-2 w-2 rounded-full bg-procarni-primary" />
                        Sugerencia de Compra (Materiales Frecuentes)
                      </CardTitle>
                      <CardDescription className="text-xs text-gray-500 italic mt-0.5">
                        Basado en los 10 materiales más comprados a este proveedor en el historial aprobado.
                      </CardDescription>
                    </div>
                    {suggestedMaterials.length > 0 && (
                      <Button
                        onClick={handleGenerateOCFromSuggestions}
                        disabled={selectedSuggestIds.size === 0}
                        className="bg-procarni-primary hover:bg-procarni-primary/95 text-white gap-2 shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all rounded-full px-5"
                        size="sm"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Generar Orden ({selectedSuggestIds.size})
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {suggestedMaterials.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-xs italic">
                      No hay historial de compras aprobadas para este proveedor para sugerir materiales frecuentes.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {suggestedMaterials.map((item) => {
                        const key = item.material_id || item.material_name;
                        const isSelected = selectedSuggestIds.has(key);
                        return (
                          <div
                            key={key}
                            onClick={() => toggleSuggestSelection(key)}
                            className={cn(
                              "flex items-center gap-3 p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none",
                              isSelected
                                ? "bg-blue-50/20 border-blue-200/60 shadow-sm"
                                : "bg-gray-50/10 border-gray-100 hover:bg-gray-50/30"
                            )}
                          >
                            <div className="flex items-center justify-center">
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-md border flex items-center justify-center transition-all",
                                  isSelected
                                    ? "bg-procarni-primary border-procarni-primary text-white"
                                    : "border-gray-300 bg-white"
                                )}
                              >
                                {isSelected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-xs text-procarni-dark truncate uppercase tracking-tight">
                                {item.material_name}
                              </p>
                              <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center mt-1 text-[10px] text-gray-400 font-medium">
                                {item.supplier_code && (
                                  <span className="bg-gray-100 text-gray-600 px-1 rounded font-mono">
                                    Cód: {item.supplier_code}
                                  </span>
                                )}
                                <span>{item.unit || 'UND'}</span>
                                <span className="text-gray-300">•</span>
                                <span>{item.count} {item.count === 1 ? 'compra' : 'compras'}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold block mb-0.5">Último Precio</span>
                              <span className="font-mono text-xs font-bold text-procarni-dark">
                                {item.unit_price.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Materials Card */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-procarni-secondary" />
                      Materiales Ofrecidos
                    </CardTitle>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Buscar material..."
                        className="pl-8 h-9 text-xs bg-white border-gray-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {supplier.materials && supplier.materials.length > 0 ? (
                    <div className="divide-y divide-gray-100/30">
                      {groupedMaterials.length > 0 ? (
                        groupedMaterials.map((group) => (
                          <div key={group.material_id} className="bg-transparent overflow-hidden group/material border-b border-slate-100/40 last:border-b-0">
                            {/* Material Group Header */}
                            <div className="bg-slate-50/50 p-3 px-6 border-b border-slate-100/40 flex flex-col md:flex-row md:items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-procarni-secondary" />
                                  <h3 className="font-bold text-procarni-dark text-[13px] uppercase tracking-tight">
                                    {group.name}
                                  </h3>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 ml-3.5">
                                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-mono text-gray-400 bg-white border-gray-100">
                                    {group.code || 'S/C'}
                                  </Badge>
                                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">
                                    {group.category || 'Sin categoría'}
                                  </span>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                 <Badge className="bg-blue-50 text-blue-600 border-blue-100 shadow-none text-[10px] font-bold">
                                   {group.items.length} {group.items.length === 1 ? 'Presentación' : 'Presentaciones'}
                                 </Badge>
                              </div>
                            </div>

                            {/* Presentations Mobile Cards */}
                            <div className="block md:hidden p-3 space-y-2">
                              {group.items.map((sm: any) => (
                                <div key={sm.id} className="bg-white/80 backdrop-blur-xl p-4 rounded-2xl border border-slate-100 shadow-md shadow-gray-200/40 ring-1 ring-white flex items-center justify-between gap-2">
                                  <div className="space-y-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-procarni-secondary/5 border border-procarni-secondary/10 text-procarni-secondary font-bold text-[11px]">
                                        {sm.units_of_measure?.name || 'N/A'}
                                      </span>
                                    </div>
                                    <p className="text-slate-700 italic text-xs">
                                      {sm.specification || <span className="text-gray-300">Sin especificaciones</span>}
                                    </p>
                                  </div>
                                  <div className="shrink-0">
                                    {sm.isLoadingFicha ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
                                    ) : sm.hasFichaResult ? (
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handleViewFicha(sm.materials.name)} 
                                        className="h-8 px-2.5 text-xs text-procarni-secondary border-procarni-secondary/20 hover:bg-procarni-secondary/5 gap-1.5 rounded-lg"
                                      >
                                        <FileText className="h-3.5 w-3.5 text-procarni-secondary" />
                                        <span>Ficha</span>
                                      </Button>
                                    ) : (
                                      <span className="text-[10px] text-gray-300 font-semibold">Sin Ficha</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Presentations Desktop Table */}
                            <div className="hidden md:block overflow-x-auto">
                              <Table>
                                <TableHeader className="bg-white">
                                  <TableRow className="border-b-0 hover:bg-transparent">
                                    <TableHead className={cn(tableHeaderClass, "w-[150px] pl-10 h-8 py-0")}>Unidad</TableHead>
                                    <TableHead className={cn(tableHeaderClass, "h-8 py-0")}>Especificación</TableHead>
                                    <TableHead className={cn(tableHeaderClass, "w-[120px] text-center pr-6 h-8 py-0")}>Ficha Técnica</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.items.map((sm: any) => (
                                    <TableRow key={sm.id} className="border-b border-slate-100/40 hover:bg-slate-100/40 transition-colors last:border-b-0">
                                      <TableCell className="pl-10">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-procarni-secondary/5 border border-procarni-secondary/10 text-procarni-secondary font-bold text-[11px]">
                                          {sm.units_of_measure?.name || 'N/A'}
                                        </span>
                                      </TableCell>
                                      <TableCell className="text-slate-700 italic text-[12px]">
                                        {sm.specification || <span className="text-gray-300">Sin especificaciones</span>}
                                      </TableCell>
                                      <TableCell className="text-center pr-6">
                                        {sm.isLoadingFicha ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto text-gray-300" />
                                        ) : sm.hasFichaResult ? (
                                          <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            onClick={() => handleViewFicha(sm.materials.name)} 
                                            className="hover:bg-green-50 rounded-full h-8 w-8 group/ficha"
                                          >
                                            <FileText className="h-4 w-4 text-procarni-secondary transition-transform group-hover/ficha:scale-110" />
                                          </Button>
                                        ) : (
                                          <span className="text-[10px] text-gray-300">N/A</span>
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
                          <Search className="h-8 w-8 opacity-10" />
                          <p className="italic text-sm">No se encontraron materiales que coincidan con la búsqueda.</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
                      <ShoppingCart className="h-10 w-10 opacity-10" />
                      <p className="italic text-sm">Este proveedor no tiene materiales registrados.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 2: ORDER HISTORY */}
            <TabsContent value="orders" className="space-y-6 focus-visible:outline-none">
              {/* Purchase Orders List */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-procarni-primary" />
                    Órdenes de Compra (OC)
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-500 italic mt-0.5">
                    Histórico de órdenes de adquisición de bienes y materiales.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingPOs ? (
                    <div className="p-12 text-center text-slate-400 text-xs italic flex justify-center items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-procarni-primary" />
                      Cargando órdenes de compra...
                    </div>
                  ) : purchaseOrders.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
                      <ShoppingCart className="h-10 w-10 opacity-10" />
                      <p className="italic text-sm">No se encontraron órdenes de compra para este proveedor.</p>
                    </div>
                  ) : (
                    <div>
                      {/* Mobile PO Cards */}
                      <div className="block md:hidden p-4 space-y-3">
                        {purchaseOrders.map((order: any) => {
                          const isExpanded = expandedOcId === order.id;
                          const items = order.purchase_order_items || [];
                          const totals = calculateTotals(items);

                          return (
                            <Card key={order.id} className={cn("p-5 bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden transition-all", isExpanded && "border-l-4 border-l-procarni-primary")}>
                              <div className="flex justify-between items-start mb-2">
                                <Link to={`/purchase-orders/${order.id}`} className="font-bold font-mono text-sm text-blue-600 hover:underline">
                                  #{order.sequence_number || 'S/N'}
                                </Link>
                                <div>{getStatusBadge(order.status)}</div>
                              </div>

                              <div className="space-y-1 text-xs mb-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Empresa</span>
                                    <p className="font-semibold text-slate-800 truncate">{order.companies?.name || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Monto Total</span>
                                    <p className="font-mono font-bold text-procarni-dark text-sm">
                                      {totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                    </p>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400">Fecha Emisión</span>
                                  <p className="text-slate-600">{order.issue_date ? format(new Date(order.issue_date), 'dd/MM/yyyy') : 'Sin fecha'}</p>
                                </div>
                              </div>

                              {/* Mobile Accordion Toggle */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedOcId(isExpanded ? null : order.id)}
                                className="w-full flex items-center justify-between text-xs py-2 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-medium rounded-xl"
                              >
                                <span className="flex items-center gap-1.5">
                                  <Package className="h-3.5 w-3.5 text-procarni-primary" />
                                  {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                                </span>
                                <span className="flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                                  {isExpanded ? 'Ocultar' : 'Ver detalle'}
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-procarni-primary" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                              </Button>

                              {/* Mobile Expanded Items */}
                              {isExpanded && (
                                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                  {items.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic py-1 text-center">No hay ítems registrados en esta orden.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {items.map((item: any, idx: number) => {
                                        const qty = Number(item.quantity || 0);
                                        const unitPrice = Number(item.unit_price || 0);
                                        const subtotal = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0) ? Number(item.subtotal) : qty * unitPrice;
                                        const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt) ? Number(item.tax_amount) : (item.is_exempt ? 0 : subtotal * 0.16);
                                        const lineTotal = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0) ? Number(item.total_price) : (subtotal + tax);

                                        return (
                                          <div key={item.id || idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                                            <div className="flex justify-between items-start gap-2">
                                              <span className="font-semibold text-slate-800 flex-1">{idx + 1}. {item.description || item.material_name || 'S/N'}</span>
                                              <span className="font-mono font-bold text-procarni-dark shrink-0">
                                                {lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                              </span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                                              <span>Cant: {qty} × {unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                              <span>IVA: {tax.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      <div className="bg-slate-100/80 p-2.5 rounded-xl text-xs font-mono space-y-1 border border-slate-200/60 mt-2">
                                        <div className="flex justify-between text-slate-600">
                                          <span>Subtotal:</span>
                                          <span className="font-semibold">{totals.subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-600">
                                          <span>IVA (16%):</span>
                                          <span className="font-semibold">{(totals.montoIVA || totals.subtotal * 0.16).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-800 font-bold border-t border-slate-200/80 pt-1 mt-1">
                                          <span className="text-procarni-dark font-extrabold">TOTAL:</span>
                                          <span className="text-procarni-primary font-black text-sm">{totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </Card>
                          );
                        })}
                      </div>

                      {/* Desktop PO Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="w-[30px] pl-3 py-2"></TableHead>
                              <TableHead className={cn(tableHeaderClass, "pl-2 w-[120px]")}>Número</TableHead>
                              <TableHead className={tableHeaderClass}>Fecha Emisión</TableHead>
                              <TableHead className={tableHeaderClass}>Empresa Solicitante</TableHead>
                              <TableHead className={tableHeaderClass}>Tasa / Moneda</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Monto Total</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-center w-[120px]")}>Estado</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {purchaseOrders.map((order: any) => {
                              const isExpanded = expandedOcId === order.id;
                              const items = order.purchase_order_items || [];
                              const totals = calculateTotals(items);

                              return (
                                <React.Fragment key={order.id}>
                                  <TableRow
                                    onClick={() => setExpandedOcId(isExpanded ? null : order.id)}
                                    className={cn(
                                      "cursor-pointer transition-colors border-b border-slate-100/40",
                                      isExpanded
                                        ? "bg-red-50/20 hover:bg-red-50/30 border-l-4 border-l-procarni-primary"
                                        : "hover:bg-slate-100/30"
                                    )}
                                  >
                                    <TableCell className="pl-3 py-3 text-slate-400">
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-procarni-primary transition-transform duration-200" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-slate-400 transition-transform duration-200" />
                                      )}
                                    </TableCell>
                                    <TableCell className="pl-2 font-bold font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                                      <Link to={`/purchase-orders/${order.id}`} className="text-blue-600 hover:underline">
                                        #{order.sequence_number || 'S/N'}
                                      </Link>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 font-medium">
                                      {order.issue_date ? format(new Date(order.issue_date), 'dd/MM/yyyy') : 'Sin fecha'}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-700 font-semibold">
                                      {order.companies?.name || 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500 font-mono">
                                      {order.currency} {order.exchange_rate ? `(Tasa: ${order.exchange_rate})` : ''}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-procarni-dark">
                                      {totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {getStatusBadge(order.status)}
                                    </TableCell>
                                    <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <Button asChild size="icon" variant="ghost" className="h-7 w-7 rounded-full text-blue-600 hover:bg-blue-50">
                                        <Link to={`/purchase-orders/${order.id}`}>
                                          <ArrowUpRight className="h-4 w-4" />
                                        </Link>
                                      </Button>
                                    </TableCell>
                                  </TableRow>

                                  {isExpanded && (
                                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                                      <TableCell colSpan={8} className="p-4 pl-10">
                                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                              <Package className="h-4 w-4 text-procarni-primary" />
                                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ítems de la Orden de Compra</h4>
                                              <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                                                {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
                                              </Badge>
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-mono">ID: {order.id}</span>
                                          </div>

                                          {items.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic py-2">No hay ítems registrados en esta orden.</p>
                                          ) : (
                                            <div className="overflow-x-auto rounded-lg border border-slate-100">
                                              <Table className="text-xs">
                                                <TableHeader className="bg-slate-50">
                                                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                                    <TableHead className="w-[40px] font-bold text-slate-500 py-2 text-center">#</TableHead>
                                                    <TableHead className="font-bold text-slate-500 py-2">Descripción / Producto</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Cant.</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Precio Unit.</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Subtotal</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">IVA / Imp.</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Total</TableHead>
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {items.map((item: any, idx: number) => {
                                                    const qty = Number(item.quantity || 0);
                                                    const unitPrice = Number(item.unit_price || 0);
                                                    const subtotal = (item.subtotal !== undefined && item.subtotal !== null && Number(item.subtotal) > 0)
                                                      ? Number(item.subtotal)
                                                      : qty * unitPrice;
                                                    const tax = (item.tax_amount !== undefined && item.tax_amount !== null && Number(item.tax_amount) >= 0 && !item.is_exempt)
                                                      ? Number(item.tax_amount)
                                                      : (item.is_exempt ? 0 : subtotal * 0.16);
                                                    const lineTotal = (item.total_price !== undefined && item.total_price !== null && Number(item.total_price) > 0)
                                                      ? Number(item.total_price)
                                                      : ((item.total !== undefined && item.total !== null && Number(item.total) > 0) ? Number(item.total) : (subtotal + tax));

                                                    return (
                                                      <TableRow key={item.id || idx} className="hover:bg-slate-50/50 border-b border-slate-100/60 last:border-b-0">
                                                        <TableCell className="text-center font-mono text-slate-400 py-2">{idx + 1}</TableCell>
                                                        <TableCell className="font-medium text-slate-800 py-2">{item.description || item.material_name || 'S/N'}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold text-slate-800 py-2">{qty}</TableCell>
                                                        <TableCell className="text-right font-mono text-slate-600 py-2">{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                        <TableCell className="text-right font-mono text-slate-600 py-2">{subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                        <TableCell className="text-right font-mono text-slate-500 py-2">{tax.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold text-procarni-dark py-2">{lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</TableCell>
                                                      </TableRow>
                                                    );
                                                  })}
                                                </TableBody>
                                              </Table>

                                              {/* Summary Footer for items */}
                                              <div className="bg-slate-50/80 px-4 py-2 border-t border-slate-100 flex justify-end gap-6 text-xs font-mono">
                                                <div><span className="text-slate-500 font-medium">Subtotal:</span> <span className="font-semibold text-slate-700">{totals.subtotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                                <div><span className="text-slate-500 font-medium">IVA (16%):</span> <span className="font-semibold text-slate-700">{totals.montoIVA ? totals.montoIVA.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (totals.subtotal * 0.16).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                                <div><span className="text-slate-600 font-bold">TOTAL:</span> <span className="font-extrabold text-procarni-primary">{totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}</span></div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Service Orders List */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-procarni-secondary" />
                    Órdenes de Servicio (OS)
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-500 italic mt-0.5">
                    Histórico de órdenes de servicio, reparaciones y mantenimiento técnico contratado.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingSOs ? (
                    <div className="p-12 text-center text-slate-400 text-xs italic flex justify-center items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-procarni-secondary" />
                      Cargando órdenes de servicio...
                    </div>
                  ) : serviceOrders.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
                      <FileText className="h-10 w-10 opacity-10" />
                      <p className="italic text-sm">No se encontraron órdenes de servicio para este proveedor.</p>
                    </div>
                  ) : (
                    <div>
                      {/* Mobile OS Cards */}
                      <div className="block md:hidden p-4 space-y-3">
                        {serviceOrders.map((order: any) => {
                          const isExpanded = expandedOsId === order.id;
                          const serviceItems = order.service_order_items || [];
                          const materialItems = order.service_order_materials || [];
                          const totalItemsCount = serviceItems.length + materialItems.length;

                          const combinedItems = [
                            ...serviceItems.map((i: any) => ({ ...i, name: i.description, unit_price: i.unit_price })),
                            ...materialItems.map((m: any) => ({ ...m, name: m.material_name, unit_price: m.unit_price }))
                          ];
                          const totals = calculateTotals(combinedItems as any);

                          return (
                            <Card key={order.id} className={cn("p-5 bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden transition-all", isExpanded && "border-l-4 border-l-procarni-primary")}>
                              <div className="flex justify-between items-start mb-2">
                                <Link to={`/service-orders/${order.id}`} className="font-bold font-mono text-sm text-blue-600 hover:underline">
                                  #{order.sequence_number || 'S/N'}
                                </Link>
                                <div>{getStatusBadge(order.status)}</div>
                              </div>

                              <div className="space-y-1 text-xs mb-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Equipo / Servicio</span>
                                    <p className="font-semibold text-slate-800 truncate">{order.equipment_name || 'General'}</p>
                                  </div>
                                  <div>
                                    <span className="text-[10px] uppercase font-bold text-slate-400">Monto Total</span>
                                    <p className="font-mono font-bold text-procarni-dark text-sm">
                                      {totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                    </p>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-slate-400">Fecha Emisión</span>
                                  <p className="text-slate-600">{order.issue_date ? format(new Date(order.issue_date), 'dd/MM/yyyy') : 'Sin fecha'}</p>
                                </div>
                              </div>

                              {/* Mobile Accordion Toggle */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExpandedOsId(isExpanded ? null : order.id)}
                                className="w-full flex items-center justify-between text-xs py-2 bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 font-medium rounded-xl"
                              >
                                <span className="flex items-center gap-1.5">
                                  <Wrench className="h-3.5 w-3.5 text-procarni-secondary" />
                                  {totalItemsCount} {totalItemsCount === 1 ? 'ítem e insumo' : 'ítems e insumos'}
                                </span>
                                <span className="flex items-center gap-1 text-slate-500 font-semibold text-[11px]">
                                  {isExpanded ? 'Ocultar' : 'Ver detalle'}
                                  {isExpanded ? <ChevronDown className="h-4 w-4 text-procarni-primary" /> : <ChevronRight className="h-4 w-4" />}
                                </span>
                              </Button>

                              {/* Mobile Expanded Items */}
                              {isExpanded && (
                                <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                                  {totalItemsCount === 0 ? (
                                    <p className="text-xs text-slate-400 italic py-1 text-center">No hay ítems registrados en esta orden de servicio.</p>
                                  ) : (
                                    <div className="space-y-2">
                                      {combinedItems.map((item: any, idx: number) => {
                                        const qty = Number(item.quantity || 1);
                                        const unitPrice = Number(item.unit_price || 0);
                                        const total = Number(item.total_price || qty * unitPrice);

                                        return (
                                          <div key={item.id || idx} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs space-y-1">
                                            <div className="flex justify-between items-start gap-2">
                                              <span className="font-semibold text-slate-800 flex-1">{idx + 1}. {item.name || 'Servicio/Material'}</span>
                                              <span className="font-mono font-bold text-procarni-dark shrink-0">
                                                {total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                              </span>
                                            </div>
                                            <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                                              <span>Cant: {qty} × {unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            {item.material_name && item.description && (
                                              <p className="text-[10px] text-slate-400 italic font-medium">{item.description}</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </Card>
                          );
                        })}
                      </div>

                      {/* Desktop OS Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className="w-[30px] pl-3 py-2"></TableHead>
                              <TableHead className={cn(tableHeaderClass, "pl-2 w-[120px]")}>Número</TableHead>
                              <TableHead className={tableHeaderClass}>Fecha Emisión</TableHead>
                              <TableHead className={tableHeaderClass}>Equipo</TableHead>
                              <TableHead className={tableHeaderClass}>Tipo de Servicio</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Monto Total</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-center w-[120px]")}>Estado</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {serviceOrders.map((order: any) => {
                              const isExpanded = expandedOsId === order.id;
                              const serviceItems = order.service_order_items || [];
                              const materialItems = order.service_order_materials || [];
                              const totalItemsCount = serviceItems.length + materialItems.length;

                              const combinedItems = [
                                ...serviceItems.map((i: any) => ({ ...i, name: i.description, isService: true })),
                                ...materialItems.map((m: any) => ({ ...m, name: m.material_name, isService: false }))
                              ];
                              const totals = calculateTotals(combinedItems as any);

                              return (
                                <React.Fragment key={order.id}>
                                  <TableRow
                                    onClick={() => setExpandedOsId(isExpanded ? null : order.id)}
                                    className={cn(
                                      "cursor-pointer transition-colors border-b border-slate-100/40",
                                      isExpanded
                                        ? "bg-red-50/20 hover:bg-red-50/30 border-l-4 border-l-procarni-primary"
                                        : "hover:bg-slate-100/30"
                                    )}
                                  >
                                    <TableCell className="pl-3 py-3 text-slate-400">
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4 text-procarni-primary transition-transform duration-200" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-slate-400 transition-transform duration-200" />
                                      )}
                                    </TableCell>
                                    <TableCell className="pl-2 font-bold font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                                      <Link to={`/service-orders/${order.id}`} className="text-blue-600 hover:underline">
                                        #{order.sequence_number || 'S/N'}
                                      </Link>
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600 font-medium">
                                      {order.issue_date ? format(new Date(order.issue_date), 'dd/MM/yyyy') : 'Sin fecha'}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-700 font-bold uppercase truncate max-w-[200px]">
                                      {order.equipment_name || 'General'}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-500 font-medium italic">
                                      {order.service_type || 'N/A'}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold text-xs text-procarni-dark">
                                      {totals.total.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {order.currency}
                                    </TableCell>
                                    <TableCell className="text-center">
                                      {getStatusBadge(order.status)}
                                    </TableCell>
                                    <TableCell className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                                      <Button asChild size="icon" variant="ghost" className="h-7 w-7 rounded-full text-blue-600 hover:bg-blue-50">
                                        <Link to={`/service-orders/${order.id}`}>
                                          <ArrowUpRight className="h-4 w-4" />
                                        </Link>
                                      </Button>
                                    </TableCell>
                                  </TableRow>

                                  {isExpanded && (
                                    <TableRow className="bg-slate-50/50 hover:bg-slate-50/50 border-b border-slate-200/80">
                                      <TableCell colSpan={8} className="p-4 pl-10">
                                        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-2">
                                              <Wrench className="h-4 w-4 text-procarni-secondary" />
                                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Ítems e Insumos del Servicio</h4>
                                              <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
                                                {totalItemsCount} {totalItemsCount === 1 ? 'ítem' : 'ítems'}
                                              </Badge>
                                            </div>
                                            <span className="text-[11px] text-slate-400 font-mono">ID: {order.id}</span>
                                          </div>

                                          {totalItemsCount === 0 ? (
                                            <p className="text-xs text-slate-400 italic py-2">No hay ítems registrados en esta orden de servicio.</p>
                                          ) : (
                                            <div className="overflow-x-auto rounded-lg border border-slate-100">
                                              <Table className="text-xs">
                                                <TableHeader className="bg-slate-50">
                                                  <TableRow className="border-b border-slate-100 hover:bg-transparent">
                                                    <TableHead className="w-[40px] font-bold text-slate-500 py-2 text-center">#</TableHead>
                                                    <TableHead className="font-bold text-slate-500 py-2">Descripción / Concepto</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Cant.</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Precio Unit.</TableHead>
                                                    <TableHead className="text-right font-bold text-slate-500 py-2">Total</TableHead>
                                                  </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                  {combinedItems.map((item: any, idx: number) => {
                                                    const unitPrice = Number(item.unit_price || 0);
                                                    const qty = Number(item.quantity || 1);
                                                    const total = Number(item.total_price || qty * unitPrice);

                                                    return (
                                                      <TableRow key={item.id || idx} className="hover:bg-slate-50/50 border-b border-slate-100/60 last:border-b-0">
                                                        <TableCell className="text-center font-mono text-slate-400 py-2">{idx + 1}</TableCell>
                                                        <TableCell className="font-medium text-slate-800 py-2">{item.description || item.material_name || 'Servicio/Material'}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold text-slate-800 py-2">{qty}</TableCell>
                                                        <TableCell className="text-right font-mono text-slate-600 py-2">{unitPrice.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {order.currency}</TableCell>
                                                        <TableCell className="text-right font-mono font-bold text-procarni-dark py-2">{total.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {order.currency}</TableCell>
                                                      </TableRow>
                                                    );
                                                  })}
                                                </TableBody>
                                              </Table>
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* TAB 3: PRICE ANALYSIS */}
            <TabsContent value="analysis" className="space-y-6 focus-visible:outline-none">
              {/* Analysis Metrics Bento */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white/70 backdrop-blur-xl border border-white/50 p-5 rounded-3xl shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Total Transado</span>
                    <DollarSign className="h-4 w-4 text-green-600" />
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-800 mt-2 font-mono">
                    ${stats.totalTransactedUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 italic">Órdenes Aprobadas (en USD equivalent)</p>
                </div>
                
                <div className="bg-white/70 backdrop-blur-xl border border-white/50 p-5 rounded-3xl shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Total de Órdenes</span>
                    <Clock className="h-4 w-4 text-blue-600" />
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-800 mt-2">
                    {stats.totalOrdersCount}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 italic">{stats.approvedOrdersCount} Aprobadas / {stats.totalOrdersCount - stats.approvedOrdersCount} Otras</p>
                </div>

                <div className="bg-white/70 backdrop-blur-xl border border-white/50 p-5 rounded-3xl shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Items Catalogados</span>
                    <ShoppingCart className="h-4 w-4 text-procarni-primary" />
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-800 mt-2">
                    {stats.materialsCount}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 italic">Materiales registrados en su portafolio</p>
                </div>

                <div className="bg-white/70 backdrop-blur-xl border border-white/50 p-5 rounded-3xl shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Historial Precios</span>
                    <Activity className="h-4 w-4 text-purple-600" />
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-800 mt-2">
                    {supplierPriceHistory.length}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 italic">Registros de precios guardados</p>
                </div>
              </div>

              {/* Price Evolution Chart */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                      <span className="flex h-2 w-2 rounded-full bg-procarni-primary" />
                      Evolución Temporal de Precios
                    </CardTitle>
                    <CardDescription className="text-xs text-gray-500 italic mt-0.5">
                      Visualización histórica de los precios ofrecidos por este proveedor.
                    </CardDescription>
                  </div>
                  {uniquePriceMaterials.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-gray-400 whitespace-nowrap">Material:</span>
                      <select 
                        value={selectedAnalysisMaterial} 
                        onChange={(e) => setSelectedAnalysisMaterial(e.target.value)}
                        className="text-xs rounded-lg border border-gray-200 bg-white p-1.5 focus:outline-none focus:ring-1 focus:ring-procarni-primary"
                      >
                        <option value="all">Todos los materiales</option>
                        {uniquePriceMaterials.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-6">
                  {isLoadingPriceHistory ? (
                    <div className="p-12 text-center text-slate-400 text-xs italic flex justify-center items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-procarni-primary" />
                      Cargando gráfico...
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="p-12 text-center text-gray-400 text-xs italic">
                      No hay suficientes registros históricos de precios para graficar.
                    </div>
                  ) : (
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="fechaFormato" tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} stroke="#cbd5e1" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px' }}
                            labelStyle={{ fontWeight: 'bold', color: '#1e293b' }}
                            formatter={(value, name, props) => {
                              const itemMaterial = props.payload?.material;
                              const formattedPrice = `${Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${props.payload?.moneda || 'USD'}`;
                              return [
                                formattedPrice,
                                selectedAnalysisMaterial === 'all' && itemMaterial ? itemMaterial : name
                              ];
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                          <Line 
                            name={selectedAnalysisMaterial === 'all' ? "Precio de Materiales" : chartData[0]?.material} 
                            type="monotone" 
                            dataKey="Precio" 
                            stroke="#880a0a" 
                            strokeWidth={2.5} 
                            activeDot={{ r: 6 }} 
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Price Stats Table */}
              <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/50 to-white pb-4 border-b border-gray-100/50">
                  <CardTitle className="text-sm font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-procarni-secondary" />
                    Análisis de Precios de Materiales
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-500 italic mt-0.5">
                    Estadísticas agregadas de precios históricos registrados en compras y cotizaciones.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {isLoadingPriceHistory ? (
                    <div className="p-12 text-center text-slate-400 text-xs italic flex justify-center items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-procarni-secondary" />
                      Calculando análisis...
                    </div>
                  ) : priceAnalysisByMaterial.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
                      <Activity className="h-10 w-10 opacity-10" />
                      <p className="italic text-sm">Este proveedor no tiene historial de precios registrado.</p>
                    </div>
                  ) : (
                    <div>
                      {/* Mobile Price Analysis Cards */}
                      <div className="block md:hidden p-4 space-y-3">
                        {priceAnalysisByMaterial.map((m) => (
                          <div key={m.materialId} className="bg-white/80 backdrop-blur-xl p-4.5 rounded-3xl border border-slate-100 shadow-xl shadow-gray-200/50 ring-1 ring-white space-y-2 overflow-hidden">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <p className="font-bold text-procarni-dark text-xs uppercase truncate">{m.name}</p>
                                <span className="text-[9px] text-gray-400 font-mono">Cód: {m.code} • {m.unit}</span>
                              </div>
                              <div>
                                {m.trend === 'up' && (
                                  <Badge className="bg-red-50 text-red-600 border-red-100 flex items-center gap-0.5 text-[9px] font-bold">
                                    <TrendingUp className="h-3 w-3" /> Alza
                                  </Badge>
                                )}
                                {m.trend === 'down' && (
                                  <Badge className="bg-green-50 text-green-600 border-green-100 flex items-center gap-0.5 text-[9px] font-bold">
                                    <TrendingDown className="h-3 w-3" /> Baja
                                  </Badge>
                                )}
                                {m.trend === 'stable' && (
                                  <Badge className="bg-slate-50 text-slate-500 border-slate-200 text-[9px] font-bold">
                                    Estable
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-tight block">Mín - Máx</span>
                                <span className="text-slate-700 font-semibold">{m.min.toLocaleString('es-VE')} - {m.max.toLocaleString('es-VE')} {m.currency}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-slate-400 uppercase tracking-tight block">Último Precio</span>
                                <span className="text-procarni-blue font-extrabold">{m.latestPrice.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {m.currency}</span>
                              </div>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
                              <span>Promedio: <strong className="font-mono">{m.avg.toLocaleString('es-VE', { minimumFractionDigits: 2 })} {m.currency}</strong></span>
                              <span>Último reg: {format(new Date(m.latestDate), 'dd/MM/yyyy')}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Price Analysis Table */}
                      <div className="hidden md:block overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50/50">
                              <TableHead className={cn(tableHeaderClass, "pl-6")}>Material / Código</TableHead>
                              <TableHead className={tableHeaderClass}>Presentación</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Precio Mínimo</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Precio Máximo</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Precio Promedio</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right")}>Último Precio</TableHead>
                              <TableHead className={tableHeaderClass}>Fecha Último Registro</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-center w-[80px]")}>Tendencia</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {priceAnalysisByMaterial.map((m) => (
                              <TableRow key={m.materialId} className="hover:bg-slate-100/30 transition-colors border-b border-slate-100/40">
                                <TableCell className="pl-6 py-3.5">
                                  <p className="font-bold text-procarni-dark text-xs uppercase">{m.name}</p>
                                  <span className="text-[9px] text-gray-400 font-mono">{m.code}</span>
                                </TableCell>
                                <TableCell className="text-xs font-semibold text-slate-600">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px]">
                                    {m.unit}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-slate-600">
                                  {m.min.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {m.currency}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-slate-600">
                                  {m.max.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {m.currency}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-slate-700 bg-slate-50/30">
                                  {m.avg.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {m.currency}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-xs text-procarni-blue">
                                  {m.latestPrice.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {m.currency}
                                </TableCell>
                                <TableCell className="text-xs text-slate-500 font-medium">
                                  {format(new Date(m.latestDate), 'dd/MM/yyyy')}
                                </TableCell>
                                <TableCell className="text-center">
                                  {m.trend === 'up' && (
                                    <Badge className="bg-red-50 text-red-600 border-red-100 flex items-center justify-center gap-0.5 w-max mx-auto text-[9px] font-bold">
                                      <TrendingUp className="h-3 w-3" /> Alza
                                    </Badge>
                                  )}
                                  {m.trend === 'down' && (
                                    <Badge className="bg-green-50 text-green-600 border-green-100 flex items-center justify-center gap-0.5 w-max mx-auto text-[9px] font-bold">
                                      <TrendingDown className="h-3 w-3" /> Baja
                                    </Badge>
                                  )}
                                  {m.trend === 'stable' && (
                                    <Badge className="bg-slate-50 text-slate-500 border-slate-200 flex items-center justify-center gap-0.5 w-max mx-auto text-[9px] font-bold">
                                      Estable
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>



      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{currentFichaTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {currentFichaUrl ? (
              <iframe src={currentFichaUrl} className="w-full h-full border-none" title="PDF Viewer"></iframe>
            ) : (
              <div className="text-center text-destructive">No se pudo cargar el documento.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* NEW EDIT DIALOG */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px] md:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
          </DialogHeader>
          <SupplierForm
            initialData={supplier as any}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditOpen(false)}
            isSubmitting={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </div >
  );
};

export default SupplierDetails;