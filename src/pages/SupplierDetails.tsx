import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  ArrowLeft, Phone, Instagram, PlusCircle, ShoppingCart, FileText, Check, DollarSign,
  Mail, Globe, MapPin, CreditCard, Calendar, Loader2, Search, AlertTriangle, TrendingUp,
  TrendingDown, Clock, ArrowUpRight, Activity, ChevronDown, ChevronRight, Package, Wrench,
  Save, AlertCircle, Trash2, Send, ExternalLink, RefreshCw, FileUp, Sparkles, Building2,
  ChevronsUpDown, ChevronLeft, Tag, MoreHorizontal, Eye
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

import { supabase } from '@/integrations/supabase/client';
import {
  getSupplierDetails,
  getFichaTecnicaBySupplierAndProduct,
  getFichaTecnicaBySupplierId,
  createSupplier,
  updateSupplier,
  getAllMaterialCategories,
  getPurchaseHistoryReport,
  getPriceHistoryBySupplierId,
  getLocations
} from '@/integrations/supabase/data';
import { useSession } from '@/components/SessionContextProvider';
import { detectLocation } from '@/utils/location-detector';
import { isGenericRif, validateRif } from '@/utils/validators';
import { showError, showSuccess } from '@/utils/toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { serviceOrderService } from '@/services/serviceOrderService';
import { calculateTotals } from '@/utils/calculations';
import SupplierPriceHistoryDownloadButton from '@/components/SupplierPriceHistoryDownloadButton';
import { FichaTecnica, SupplierMaterialPayload } from '@/integrations/supabase/types';

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
    unit?: string;
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
  rubros?: string | null;
  payment_terms: string;
  custom_payment_terms?: string | null;
  credit_days: number;
  status: string;
  user_id: string;
  alert_comment: string | null;
  created_at?: string;
  updated_at?: string;
  materials?: MaterialAssociation[];
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  FRESCA: { bg: 'bg-red-50', text: 'text-procarni-primary', border: 'border-procarni-primary/20' },
  SECA: { bg: 'bg-amber-50', text: 'text-procarni-alert', border: 'border-procarni-alert/20' },
  EMPAQUE: { bg: 'bg-blue-50', text: 'text-procarni-blue', border: 'border-procarni-blue/20' },
  ETIQUETA: { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-procarni-dark/20' },
};

const PAYMENT_TERMS_OPTIONS = [
  { value: 'Contado', label: 'Contado' },
  { value: 'Crédito', label: 'Crédito' },
  { value: 'Otro', label: 'Personalizado / Otro' }
];

const getStatusColor = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'approved':
    case 'aprobado':
      return 'bg-emerald-50 text-procarni-secondary border-emerald-200';
    case 'pending':
    case 'pendiente':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'rejected':
    case 'rechazado':
      return 'bg-red-50 text-procarni-primary border-red-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
};

const SupplierDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const isNew = id === 'new';

  // --- Form Local State ---
  const [name, setName] = useState('');
  const [rif, setRif] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [instagram, setInstagram] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [rubros, setRubros] = useState('');
  const [openLocationPopover, setOpenLocationPopover] = useState(false);
  const [paymentTerms, setPaymentTerms] = useState('Contado');
  const [customPaymentTerms, setCustomPaymentTerms] = useState('');
  const [creditDays, setCreditDays] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [alertComment, setAlertComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // --- Search & UI States ---
  const [searchTerm, setSearchTerm] = useState('');
  const [materialPage, setMaterialPage] = useState(1);
  const MATERIAL_PAGE_SIZE = 6;
  const [selectedAnalysisMaterial, setSelectedAnalysisMaterial] = useState<string>('all');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentFichaUrl, setCurrentFichaUrl] = useState('');
  const [currentFichaTitle, setCurrentFichaTitle] = useState('');

  // Association Dialog States
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [allCatalogMaterials, setAllCatalogMaterials] = useState<any[]>([]);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);
  const [isAssociating, setIsAssociating] = useState(false);

  // --- Data Fetching ---
  const { data: dbLocations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
    staleTime: 1000 * 60 * 60,
  });

  const municipalitiesFlat = useMemo(() => {
    return dbLocations
      .map(loc => ({
        city: loc.city,
        state: loc.state,
        label: `${loc.city}, ${loc.state}`
      }))
      .sort((a, b) => a.city.localeCompare(b.city));
  }, [dbLocations]);

  const { data: supplier, isLoading: isLoadingSupplier } = useQuery<SupplierDetailsData | null>({
    queryKey: ['supplierDetails', id],
    queryFn: async () => {
      if (!id || id === 'new') return null;
      const details = await getSupplierDetails(id);
      if (!details) throw new Error('Proveedor no encontrado.');
      return details as SupplierDetailsData;
    },
    enabled: !!id && id !== 'new',
  });

  const { data: purchaseOrders = [] } = useQuery({
    queryKey: ['supplierPurchaseOrders', id],
    queryFn: () => purchaseOrderService.getBySupplierId(id!),
    enabled: !!id && id !== 'new',
  });

  const { data: serviceOrders = [] } = useQuery({
    queryKey: ['supplierServiceOrders', id],
    queryFn: () => serviceOrderService.getBySupplierId(id!),
    enabled: !!id && id !== 'new',
  });

  const { data: supplierPriceHistory = [], refetch: refetchPriceHistory } = useQuery({
    queryKey: ['supplierPriceHistory', id],
    queryFn: () => getPriceHistoryBySupplierId(id!),
    enabled: !!id && id !== 'new',
  });

  const { data: supplierFichas = [], isLoading: isLoadingFichaStatus } = useQuery({
    queryKey: ['supplierFichas', id],
    queryFn: () => getFichaTecnicaBySupplierId(id!),
    enabled: !!id && id !== 'new',
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

  const { data: purchaseHistory = [] } = useQuery({
    queryKey: ['supplierPurchaseHistory', id],
    queryFn: async () => {
      if (!id || id === 'new') return [];
      return getPurchaseHistoryReport({ supplierId: id, status: 'Approved' });
    },
    enabled: !!id && id !== 'new',
  });

  // Combine materials with their ficha status
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

  // Sync state with loaded supplier data
  useEffect(() => {
    if (isNew) {
      setName('');
      setRif('');
      setEmail('');
      setPhone('');
      setPhone2('');
      setInstagram('');
      setWebsite('');
      setAddress('');
      setState('');
      setCity('');
      setRubros('');
      setPaymentTerms('Contado');
      setCustomPaymentTerms('');
      setCreditDays(0);
      setIsActive(true);
      setAlertComment('');
    } else if (supplier) {
      setName(supplier.name || '');
      setRif(isGenericRif(supplier.rif) ? '' : (supplier.rif || ''));
      setEmail(supplier.email || '');
      setPhone(supplier.phone || '');
      setPhone2(supplier.phone_2 || '');
      setInstagram(supplier.instagram || '');
      setWebsite(supplier.website || '');
      setAddress(supplier.address || '');
      setState(supplier.state || '');
      setCity(supplier.city || '');
      setRubros(supplier.rubros || '');
      setPaymentTerms(supplier.payment_terms || 'Contado');
      setCustomPaymentTerms(supplier.custom_payment_terms || '');
      setCreditDays(supplier.credit_days || 0);
      setIsActive(supplier.status === 'Active' || supplier.status === 'Activo');
      setAlertComment(supplier.alert_comment || '');
    }
  }, [supplier, isNew]);

  // Handle address input and auto-detect location
  const handleAddressChange = (val: string) => {
    setAddress(val);
    if (val && dbLocations.length > 0) {
      const { state: detectedState, city: detectedCity } = detectLocation(val, dbLocations);
      if (detectedState) setState(detectedState);
      if (detectedCity) setCity(detectedCity);
    }
  };

  // Payment terms change handler
  const handlePaymentTermsChange = (val: string) => {
    setPaymentTerms(val);
    if (val === 'Contado') {
      setCreditDays(0);
      setCustomPaymentTerms('');
    } else if (val === 'Crédito') {
      if (!creditDays || creditDays === 0) setCreditDays(15);
      setCustomPaymentTerms('');
    } else if (val === 'Otro') {
      setCreditDays(0);
    }
  };

  // --- Save / Create Supplier ---
  const handleSaveChanges = async () => {
    const trimmedName = name.trim().toUpperCase();
    if (!trimmedName) {
      toast.error('El nombre o razón social del proveedor es obligatorio.');
      return;
    }

    let formattedRif = rif.trim();
    if (formattedRif && formattedRif.toUpperCase() !== 'SR' && !formattedRif.toUpperCase().startsWith('SR')) {
      const validated = validateRif(formattedRif);
      if (!validated) {
        toast.error('Formato de RIF inválido. Ej: J-12345678-9, V-12345678, o SR si no posee.');
        return;
      }
      formattedRif = validated;
    } else {
      // Generar RIF genérico único con sufijo invisible para 'SR' o campo vacío
      if (!isNew && supplier?.rif?.startsWith('SR')) {
        formattedRif = supplier.rif;
      } else {
        const invisibleSuffix = Date.now().toString().split('').map(d => String.fromCharCode(0x200B + (parseInt(d) % 3))).join('');
        formattedRif = 'SR' + invisibleSuffix;
      }
    }

    try {
      setIsSaving(true);
      const supplierPayload: any = {
        name: trimmedName,
        rif: formattedRif,
        email: email.trim() || null,
        phone: phone.trim() || null,
        phone_2: phone2.trim() || null,
        instagram: instagram.trim() || null,
        website: website.trim() || null,
        address: address.trim() || null,
        state: state.trim() || null,
        city: city.trim() || null,
        rubros: rubros.trim() || null,
        payment_terms: paymentTerms === 'Otro' ? 'Otro' : paymentTerms === 'Crédito' ? 'Crédito' : 'Contado',
        custom_payment_terms: paymentTerms === 'Otro' ? customPaymentTerms.trim() || null : null,
        credit_days: paymentTerms === 'Crédito' ? Number(creditDays) || 0 : 0,
        status: isActive ? 'Active' : 'Inactive',
        alert_comment: alertComment.trim() || null,
        user_id: session?.user?.id || null,
      };

      if (isNew) {
        const newSupplier = await createSupplier(supplierPayload, []);
        if (newSupplier) {
          toast.success('Proveedor creado exitosamente.');
          queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
          navigate(`/suppliers/${newSupplier.id}`);
        }
      } else {
        if (!supplier) return;
        const currentMaterialsPayload: SupplierMaterialPayload[] = (supplier.materials || []).map(m => ({
          material_id: m.material_id,
          unit_id: m.unit_id || null,
          specification: m.specification || ''
        }));

        await updateSupplier(supplier.id, supplierPayload, currentMaterialsPayload);
        toast.success('Cambios guardados correctamente.');
        queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
        queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
      }
    } catch (err: any) {
      console.error('Error saving supplier:', err);
      if (err?.code === '23505') {
        toast.error('El RIF ingresado ya pertenece a otro proveedor registrado.');
      } else {
        toast.error(err.message || 'Ocurrió un error al guardar los datos del proveedor.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // --- Material Association Dialog Logic ---
  const handleOpenAddMaterial = async () => {
    try {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, code, category, unit')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(100);
      if (error) throw error;
      setAllCatalogMaterials(data || []);
      setSelectedMaterialIds((supplier?.materials || []).map(m => m.material_id));
      setMaterialSearchQuery('');
      setIsAddMaterialOpen(true);
    } catch (err) {
      console.error('Error fetching catalog materials:', err);
      toast.error('No se pudieron cargar los materiales del catálogo.');
    }
  };

  useEffect(() => {
    if (!isAddMaterialOpen) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        let queryBuilder = supabase
          .from('materials')
          .select('id, name, code, category, unit')
          .eq('status', 'active')
          .order('name', { ascending: true })
          .limit(60);

        if (materialSearchQuery.trim()) {
          queryBuilder = queryBuilder.ilike('name', `%${materialSearchQuery.trim()}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;
        setAllCatalogMaterials(data || []);
      } catch (err) {
        console.error('Error searching materials:', err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [materialSearchQuery, isAddMaterialOpen]);

  const handleSaveMaterialAssociations = async () => {
    if (!supplier) return;
    try {
      setIsAssociating(true);
      const originalIds = (supplier.materials || []).map(m => m.material_id);
      const idsToAdd = selectedMaterialIds.filter(matId => !originalIds.includes(matId));
      const idsToRemove = originalIds.filter(matId => !selectedMaterialIds.includes(matId));

      // 1. Add new associations
      if (idsToAdd.length > 0) {
        const insertPayloads = idsToAdd.map(materialId => {
          const matObj = allCatalogMaterials.find(m => m.id === materialId);
          return {
            supplier_id: supplier.id,
            material_id: materialId,
            unit_id: null,
            user_id: session?.user?.id || '',
            specification: matObj?.category || ''
          };
        });
        const { error: insertError } = await supabase
          .from('supplier_materials')
          .insert(insertPayloads);
        if (insertError) throw insertError;
      }

      // 2. Remove associations
      if (idsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('supplier_materials')
          .delete()
          .eq('supplier_id', supplier.id)
          .in('material_id', idsToRemove);
        if (deleteError) throw deleteError;
      }

      toast.success('Materiales vinculados actualizados exitosamente.');
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
      setIsAddMaterialOpen(false);
    } catch (err) {
      console.error('Error saving material associations:', err);
      toast.error('Ocurrió un error al guardar los materiales asociados.');
    } finally {
      setIsAssociating(false);
    }
  };

  const handleRemoveSingleMaterial = async (supplierMaterialId: string) => {
    try {
      const { error } = await supabase
        .from('supplier_materials')
        .delete()
        .eq('id', supplierMaterialId);
      if (error) throw error;
      toast.success('Material desvinculado del proveedor.');
      queryClient.invalidateQueries({ queryKey: ['supplierDetails', id] });
    } catch (err) {
      toast.error('No se pudo desvincular el material.');
    }
  };

  // --- Metrics & Calculations ---
  const stats = useMemo(() => {
    const approvedPOs = purchaseOrders.filter((po: any) => po.status === 'Approved' || po.status === 'Paid' || po.status === 'Received');
    const approvedSOs = serviceOrders.filter((so: any) => so.status === 'Approved' || so.status === 'Paid' || so.status === 'Received');

    return {
      totalOrdersCount: purchaseOrders.length + serviceOrders.length,
      approvedOrdersCount: approvedPOs.length + approvedSOs.length,
      materialsCount: supplier?.materials?.length || 0,
      creditDays: creditDays || supplier?.credit_days || 0,
      paymentTerms: paymentTerms || supplier?.payment_terms || 'Contado'
    };
  }, [purchaseOrders, serviceOrders, supplier, creditDays, paymentTerms]);

  // Suggested materials calculation (Más Comprados)
  const suggestedMaterials = useMemo(() => {
    const allItems: any[] = [];
    (purchaseOrders || []).forEach((po: any) => {
      (po.purchase_order_items || []).forEach((item: any) => {
        allItems.push({
          ...item,
          issue_date: po.issue_date || po.created_at,
        });
      });
    });

    if (allItems.length === 0) return [];

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

    allItems.forEach((item: any) => {
      const key = item.material_id || item.material_name;
      if (!key) return;

      const orderDate = item.issue_date ? new Date(item.issue_date) : new Date(0);

      if (!materialMap[key]) {
        materialMap[key] = {
          material_id: item.material_id || null,
          material_name: item.material_name,
          supplier_code: item.supplier_code || null,
          unit: item.unit || null,
          unit_id: item.unit_id || null,
          is_exempt: !!item.is_exempt,
          unit_price: Number(item.unit_price) || 0,
          count: 0,
          dates: [orderDate],
        };
      } else {
        materialMap[key].dates.push(orderDate);
        const currentDates = materialMap[key].dates;
        const latestDateIndex = currentDates.findIndex(d => d.getTime() === Math.max(...currentDates.map(x => x.getTime())));
        if (latestDateIndex === currentDates.length - 1) {
          materialMap[key].unit_price = Number(item.unit_price) || 0;
        }
      }
      materialMap[key].count += 1;
    });

    return Object.values(materialMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [purchaseOrders]);

  const [selectedSuggestIds, setSelectedSuggestIds] = useState<Set<string>>(new Set());

  useEffect(() => {
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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      toast.error('Por favor selecciona al menos un material sugerido.');
      return;
    }

    navigate('/generate-po', {
      state: {
        supplier: supplier,
        suggestedItems: selectedItems,
      },
    });
  };

  // Price analysis metrics (Historial de Precios)
  const priceAnalysisByMaterial = useMemo(() => {
    const rawEntries: Array<{
      materialId: string;
      name: string;
      code: string;
      unit: string;
      price: number;
      date: Date;
      recorded_at: string;
      currency: string;
    }> = [];

    // 1. From explicit price_history table
    (supplierPriceHistory || []).forEach(entry => {
      const matId = entry.material_id;
      if (!matId) return;
      rawEntries.push({
        materialId: matId,
        name: entry.materials?.name || 'Desconocido',
        code: (entry.materials as any)?.code || 'S/C',
        unit: entry.units_of_measure?.name || entry.materials?.unit || 'UND',
        price: Number(entry.unit_price) || 0,
        date: new Date(entry.recorded_at),
        recorded_at: entry.recorded_at,
        currency: entry.currency || 'USD'
      });
    });

    // 2. From purchase order items
    (purchaseOrders || []).forEach((po: any) => {
      (po.purchase_order_items || []).forEach((item: any) => {
        const matId = item.material_id || item.material_name;
        if (!matId) return;
        const recorded = po.issue_date || po.created_at || new Date().toISOString();
        rawEntries.push({
          materialId: matId,
          name: item.material_name || 'Material',
          code: item.supplier_code || 'S/C',
          unit: item.unit || 'UND',
          price: Number(item.unit_price) || 0,
          date: new Date(recorded),
          recorded_at: recorded,
          currency: po.currency || 'USD'
        });
      });
    });

    if (rawEntries.length === 0) return [];

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

    rawEntries.forEach(entry => {
      const key = entry.materialId;
      if (!groups[key]) {
        groups[key] = {
          materialId: entry.materialId,
          name: entry.name,
          code: entry.code,
          unit: entry.unit,
          prices: [entry.price],
          dates: [entry.date],
          latestPrice: entry.price,
          latestDate: entry.recorded_at,
          currency: entry.currency
        };
      } else {
        groups[key].prices.push(entry.price);
        groups[key].dates.push(entry.date);
        if (entry.date > new Date(groups[key].latestDate)) {
          groups[key].latestPrice = entry.price;
          groups[key].latestDate = entry.recorded_at;
          groups[key].currency = entry.currency;
        }
      }
    });

    return Object.values(groups).map(g => {
      const validPrices = g.prices.filter(p => p > 0);
      const min = validPrices.length > 0 ? Math.min(...validPrices) : 0;
      const max = validPrices.length > 0 ? Math.max(...validPrices) : 0;
      const avg = validPrices.length > 0 ? validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length : 0;
      
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
  }, [supplierPriceHistory, purchaseOrders]);

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

  // Filter materials in profile table
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

  const totalMaterialPages = Math.ceil(filteredMaterials.length / MATERIAL_PAGE_SIZE) || 1;

  const paginatedMaterials = useMemo(() => {
    const start = (materialPage - 1) * MATERIAL_PAGE_SIZE;
    return filteredMaterials.slice(start, start + MATERIAL_PAGE_SIZE);
  }, [filteredMaterials, materialPage]);

  useEffect(() => {
    setMaterialPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (materialPage > totalMaterialPages) {
      setMaterialPage(totalMaterialPages);
    }
  }, [totalMaterialPages, materialPage]);

  // Format WhatsApp Link
  const formatPhoneNumberForWhatsApp = (rawPhone: string) => {
    const digitsOnly = rawPhone.replace(/\D/g, '');
    if (!digitsOnly.startsWith('58')) {
      return `58${digitsOnly}`;
    }
    return digitsOnly;
  };

  const handleViewFicha = async (materialName: string) => {
    if (!supplier?.id) return;
    const ficha: FichaTecnica | null = await getFichaTecnicaBySupplierAndProduct(supplier.id, materialName);
    if (ficha && ficha.storage_url) {
      setCurrentFichaUrl(ficha.storage_url);
      setCurrentFichaTitle(`Ficha Técnica: ${materialName}`);
      setIsViewerOpen(true);
    } else {
      toast.error(`No se encontró una ficha técnica para el material "${materialName}".`);
    }
  };

  if (isLoadingSupplier) {
    return (
      <div className="container mx-auto p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Skeleton className="h-44 rounded-[2rem]" />
          <Skeleton className="h-44 rounded-[2rem]" />
          <Skeleton className="h-44 rounded-[2rem]" />
        </div>
      </div>
    );
  }

  if (!supplier && !isNew) {
    return (
      <div className="container mx-auto p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="h-12 w-12 text-procarni-primary animate-bounce" />
        <h2 className="text-xl font-bold text-procarni-dark">Proveedor no encontrado</h2>
        <p className="text-sm text-gray-500">El ID especificado no corresponde a ningún proveedor registrado.</p>
        <Button onClick={() => navigate('/supplier-management')} className="bg-procarni-blue hover:bg-procarni-blue/90 text-white rounded-xl active:scale-95 transition-all">
          Volver a Proveedores
        </Button>
      </div>
    );
  }

  const tableHeaderClass = "text-[10px] uppercase tracking-wider font-bold text-slate-400 py-3";

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <div className="container mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Back navigation */}
        <button
          onClick={() => navigate('/supplier-management')}
          className="group flex items-center gap-2 text-sm font-bold text-procarni-blue hover:text-procarni-primary transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver a Gestión de Proveedores</span>
        </button>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              {!isNew && (
                <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                  {supplier?.code || 'SIN CÓDIGO'}
                </span>
              )}
              <Badge
                variant="outline"
                className={cn(
                  'font-bold text-xs border px-2.5 py-0.5',
                  isActive
                    ? 'bg-emerald-50 text-procarni-secondary border-procarni-secondary/20'
                    : 'bg-red-50 text-procarni-primary border-procarni-primary/20'
                )}
              >
                {isActive ? 'Activo' : 'Inactivo'}
              </Badge>
              {!isNew && isGenericRif(supplier?.rif || '') && (
                <Badge variant="outline" className="bg-amber-50 text-procarni-alert border-procarni-alert/30 font-bold text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" /> RIF Pendiente
                </Badge>
              )}
              {rubros && (
                <span className="font-semibold text-xs text-slate-600 bg-slate-100/90 px-3 py-1 rounded-lg border border-slate-200/80 flex items-center gap-1.5">
                  <Tag className="h-3 w-3 text-slate-400" />
                  <span>{rubros}</span>
                </span>
              )}
            </div>
            <h1 className="text-[34px] font-black text-procarni-blue tracking-tight leading-tight mt-2">
              {isNew ? 'Añadir Nuevo Proveedor' : (name || 'Detalles del Proveedor')}
            </h1>
            {!isNew && supplier?.id && (
              <p className="text-[13px] text-gray-500 font-medium italic">
                ID de catálogo: {supplier.id}
              </p>
            )}
          </div>
        </div>

        {/* Operational Alert Notice if present */}
        {!isNew && supplier?.alert_comment && (
          <div className="p-4 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-start gap-3 shadow-sm animate-in fade-in">
            <AlertTriangle className="h-5 w-5 text-procarni-alert shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <p className="font-bold text-amber-900 uppercase tracking-wider text-[10px]">Alerta / Aviso Operativo</p>
              <p className="text-amber-800 font-medium leading-relaxed">{supplier.alert_comment}</p>
            </div>
          </div>
        )}

        {/* KPI Bar */}
        {!isNew && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Materiales Suministrados */}
            <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-emerald-50 text-procarni-secondary">
                    <Package className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Materiales Habilitados</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                      {stats.materialsCount}
                    </span>
                    <span className="text-gray-500 font-bold text-sm uppercase">ÍTEMS</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Productos vinculados en catálogo
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Órdenes Emitidas */}
            <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-procarni-blue/10 text-procarni-blue">
                    <FileText className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Órdenes Generadas</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                      {stats.totalOrdersCount}
                    </span>
                    <Badge variant="outline" className="bg-blue-50 text-procarni-blue border-procarni-blue/20 text-[10px] font-bold">
                      {stats.approvedOrdersCount} Aprobadas
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Total de OCs y OSs registradas
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Condición Comercial */}
            <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-amber-50 text-procarni-alert">
                    <CreditCard className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Condición Comercial</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                      {stats.creditDays}
                    </span>
                    <span className="text-gray-500 font-bold text-sm uppercase">DÍAS CRÉDITO</span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold mt-2">
                    Términos: <span className="text-procarni-dark">{stats.paymentTerms}</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Layout Grid */}
        <div className="grid grid-cols-12 gap-8">

          {/* Central Section (Form + Materials + History) */}
          <div className="col-span-12 lg:col-span-9 space-y-8">

            {/* 1. FICHA Y CONFIGURACIÓN DEL PROVEEDOR */}
            <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-8 rounded-[2rem] shadow-2xl shadow-gray-200/50 space-y-6">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <Building2 className="h-5 w-5 text-procarni-primary" />
                <h3 className="font-extrabold text-lg text-procarni-dark tracking-tight">Ficha y Datos del Proveedor</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Nombre / Razón Social */}
                <div className="space-y-1.5 col-span-1 md:col-span-2">
                  <Label htmlFor="supplierName" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Nombre o Razón Social <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="supplierName"
                    placeholder="Ej: DISTRIBUIDORA CARNICA C.A."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm font-semibold focus:ring-procarni-primary/20"
                  />
                </div>

                {/* RIF */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierRif" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    RIF Fiscal (Ej: J-12345678-9 o SR)
                  </Label>
                  <Input
                    id="supplierRif"
                    placeholder="Ej: J-12345678-9 o SR"
                    value={rif}
                    onChange={(e) => setRif(e.target.value.toUpperCase())}
                    className="bg-slate-50/50 border-slate-200 rounded-xl h-11 font-mono text-sm uppercase focus:ring-procarni-primary/20"
                  />
                </div>

                {/* Correo Electrónico */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierEmail" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Correo Electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="supplierEmail"
                      type="email"
                      placeholder="ventas@proveedor.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm focus:ring-procarni-primary/20"
                    />
                  </div>
                </div>

                {/* Teléfono 1 */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierPhone" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Teléfono Principal
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="supplierPhone"
                        placeholder="0414-1234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm font-mono focus:ring-procarni-primary/20"
                      />
                    </div>
                    {phone && (
                      <a
                        href={`https://wa.me/${formatPhoneNumberForWhatsApp(phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-procarni-secondary hover:bg-emerald-100 transition-colors shrink-0"
                        title="Abrir en WhatsApp"
                      >
                        <Send className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Teléfono 2 */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierPhone2" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Teléfono Secundario (Opcional)
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        id="supplierPhone2"
                        placeholder="0241-1234567"
                        value={phone2}
                        onChange={(e) => setPhone2(e.target.value)}
                        className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm font-mono focus:ring-procarni-primary/20"
                      />
                    </div>
                    {phone2 && (
                      <a
                        href={`https://wa.me/${formatPhoneNumberForWhatsApp(phone2)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-11 w-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-procarni-secondary hover:bg-emerald-100 transition-colors shrink-0"
                        title="Abrir en WhatsApp"
                      >
                        <Send className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Instagram */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierInstagram" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Instagram
                  </Label>
                  <div className="relative">
                    <Instagram className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="supplierInstagram"
                      placeholder="@proveedor_oficial"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm focus:ring-procarni-primary/20"
                    />
                  </div>
                </div>

                {/* Sitio Web */}
                <div className="space-y-1.5">
                  <Label htmlFor="supplierWebsite" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Sitio Web / Enlace
                  </Label>
                  <div className="relative">
                    <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="supplierWebsite"
                      type="url"
                      placeholder="https://www.proveedor.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm focus:ring-procarni-primary/20"
                    />
                  </div>
                </div>

                {/* Dirección */}
                <div className="space-y-1.5 col-span-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="supplierAddress" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                      Dirección Fiscal / Operativa (Auto-detecta Estado y Ciudad)
                    </Label>
                    {(state || city) && (
                      <span className="text-[10px] text-procarni-secondary font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                        <Check className="h-3 w-3" /> Ubicación: {city || '—'}, {state || '—'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-gray-400" />
                    <Textarea
                      id="supplierAddress"
                      placeholder="Ej: Zona Industrial San Diego, Valencia, Edo. Carabobo..."
                      value={address}
                      onChange={(e) => handleAddressChange(e.target.value)}
                      className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl min-h-[70px] text-sm focus:ring-procarni-primary/20 resize-none"
                    />
                  </div>
                </div>

                {/* Selector Rápido de Ciudad/Municipio de Venezuela */}
                <div className="space-y-1.5 col-span-1 md:col-span-2">
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Búsqueda / Selección de Municipio y Estado (Venezuela)
                  </Label>
                  <Popover open={openLocationPopover} onOpenChange={setOpenLocationPopover}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openLocationPopover}
                        className={cn(
                          "w-full justify-between bg-slate-50/50 border-slate-200 rounded-xl h-11 text-xs font-normal",
                          (!city && !state) && "text-muted-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <MapPin className="h-3.5 w-3.5 text-procarni-primary shrink-0" />
                          <span className="truncate font-medium text-slate-800">
                            {city || state ? `${city || 'Ciudad'}, ${state || 'Estado'}` : "Buscar o seleccionar municipio / estado..."}
                          </span>
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[340px] sm:w-[420px] p-0 bg-white shadow-2xl rounded-2xl border border-slate-100" align="start">
                      <Command>
                        <CommandInput placeholder="Escribe municipio, ciudad o estado..." className="h-10 text-xs" />
                        <CommandList className="max-h-60 overflow-y-auto">
                          <CommandEmpty className="p-4 text-xs text-muted-foreground text-center">
                            No se encontraron ubicaciones coincidentes.
                          </CommandEmpty>
                          <CommandGroup>
                            {municipalitiesFlat.map((loc) => (
                              <CommandItem
                                key={`${loc.city}-${loc.state}`}
                                value={loc.label}
                                className="text-xs cursor-pointer py-2.5"
                                onSelect={() => {
                                  setCity(loc.city);
                                  setState(loc.state);
                                  setOpenLocationPopover(false);
                                  toast.success(`Ubicación seleccionada: ${loc.city}, ${loc.state}`);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-3.5 w-3.5 text-procarni-secondary",
                                    (city === loc.city && state === loc.state) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="font-semibold text-slate-800">{loc.city}</span>
                                <span className="text-slate-400 ml-1.5">({loc.state})</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Rubro / Especialidad (Debajo de Dirección Fiscal y Ubicación) */}
                <div className="space-y-1.5 col-span-1 md:col-span-2">
                  <Label htmlFor="supplierRubros" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-slate-400" /> Rubro / Especialidad (Opcional)
                  </Label>
                  <div className="relative">
                    <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="supplierRubros"
                      placeholder="Ej: Carnes, Empaques, Ferretería, Químicos, Insumos de Limpieza..."
                      value={rubros}
                      onChange={(e) => setRubros(e.target.value)}
                      className="pl-10 bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm focus:ring-procarni-primary/20"
                    />
                  </div>
                </div>

                {/* Términos de Pago */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Términos de Pago
                  </Label>
                  <Select value={paymentTerms} onValueChange={handlePaymentTermsChange}>
                    <SelectTrigger className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20">
                      <SelectValue placeholder="Seleccione Términos" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Días de Crédito */}
                <div className="space-y-1.5">
                  <Label htmlFor="creditDays" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                    Días de Crédito {paymentTerms === 'Crédito' && <span className="text-procarni-primary font-bold">*</span>}
                  </Label>
                  <Input
                    id="creditDays"
                    type="number"
                    min="0"
                    placeholder="Ej: 15, 30..."
                    value={paymentTerms === 'Crédito' ? (creditDays || '') : 0}
                    onChange={(e) => setCreditDays(parseInt(e.target.value, 10) || 0)}
                    disabled={paymentTerms !== 'Crédito'}
                    className="bg-slate-50/50 border-slate-200 rounded-xl h-11 font-mono text-sm focus:ring-procarni-primary/20 disabled:opacity-50"
                  />
                </div>

                {/* Términos Personalizados si aplica */}
                {paymentTerms === 'Otro' && (
                  <div className="space-y-1.5 col-span-1 md:col-span-2 animate-in fade-in">
                    <Label htmlFor="customPaymentTerms" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">
                      Detalle de Términos Personalizados <span className="text-procarni-primary font-bold">*</span>
                    </Label>
                    <Input
                      id="customPaymentTerms"
                      placeholder="Ej: 50% anticipo, 50% contra entrega..."
                      value={customPaymentTerms}
                      onChange={(e) => setCustomPaymentTerms(e.target.value)}
                      className="bg-slate-50/50 border-slate-200 rounded-xl h-11 text-sm focus:ring-procarni-primary/20"
                    />
                  </div>
                )}

                {/* Nota o Alerta Especial */}
                <div className="space-y-1.5 col-span-1 md:col-span-2">
                  <Label htmlFor="alertComment" className="text-[10px] uppercase tracking-wider font-semibold text-amber-600 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Alerta o Nota Especial para Compras (Opcional)
                  </Label>
                  <Textarea
                    id="alertComment"
                    placeholder="Ej: No despacha viernes después de las 2pm / Requiere confirmación bancaria previa..."
                    value={alertComment}
                    onChange={(e) => setAlertComment(e.target.value)}
                    className="bg-amber-50/30 border-amber-200/60 rounded-xl min-h-[60px] text-xs focus:ring-amber-500/20 resize-none"
                  />
                </div>

              </div>
            </section>
          </div>

          {/* Right Column: Actions & Contact */}
          <div className="col-span-12 lg:col-span-3 space-y-6">

            {/* Actions Card */}
            <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] shadow-xl shadow-gray-200/50 space-y-4">
              <h4 className="font-extrabold text-sm text-procarni-dark uppercase tracking-wider text-[11px] pb-2 border-b border-slate-100">
                Acciones del Proveedor
              </h4>

              <div className="space-y-3 pt-1">
                <Button
                  disabled={isSaving}
                  onClick={handleSaveChanges}
                  className="w-full bg-procarni-primary hover:bg-procarni-primary/95 text-white py-6 rounded-2xl font-bold shadow-lg shadow-procarni-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? (isNew ? 'Creando...' : 'Guardando...') : (isNew ? 'Crear Proveedor' : 'Guardar Cambios')}
                </Button>

                {!isNew && (
                  <>
                    <Button
                      onClick={() => navigate('/generate-quote', { state: { supplier } })}
                      className="w-full bg-white text-procarni-dark hover:bg-slate-50 py-5 rounded-2xl font-bold hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs border border-slate-200"
                    >
                      <FileText className="h-4 w-4 text-procarni-blue" />
                      Generar Cotización (SC)
                    </Button>

                    <Button
                      onClick={() => navigate('/generate-po', { state: { supplier } })}
                      className="w-full bg-white text-procarni-dark hover:bg-slate-50 py-5 rounded-2xl font-bold hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs border border-slate-200"
                    >
                      <ShoppingCart className="h-4 w-4 text-procarni-secondary" />
                      Generar Orden Compra (OC)
                    </Button>

                    <Button
                      onClick={() => navigate('/ficha-tecnica-upload')}
                      variant="ghost"
                      className="w-full text-slate-600 hover:text-procarni-primary py-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2"
                    >
                      <FileUp className="h-4 w-4" />
                      Subir Ficha Técnica
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Quick Contact Card */}
            {!isNew && (
              <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] shadow-md border border-slate-100 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">Contacto Rápido</span>

                <div className="space-y-2 text-xs">
                  {phone ? (
                    <a
                      href={`https://wa.me/${formatPhoneNumberForWhatsApp(phone)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 text-emerald-800 font-semibold transition-colors group"
                      title="WhatsApp (Teléfono Principal)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Send className="h-3.5 w-3.5 text-procarni-secondary" />
                        <span className="truncate font-mono">{phone}</span>
                        <span className="text-[9px] font-bold uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md">Ppal</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                    </a>
                  ) : null}

                  {phone2 ? (
                    <a
                      href={`https://wa.me/${formatPhoneNumberForWhatsApp(phone2)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50/30 hover:bg-emerald-50/70 border border-emerald-100/80 text-emerald-800 font-semibold transition-colors group"
                      title="WhatsApp (Teléfono Secundario)"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Phone className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="truncate font-mono">{phone2}</span>
                        <span className="text-[9px] font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">Sec</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                    </a>
                  ) : null}

                  {email ? (
                    <a
                      href={`mailto:${email}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-blue-50/50 hover:bg-blue-50 border border-blue-100 text-procarni-blue font-semibold transition-colors group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 text-procarni-blue" />
                        <span className="truncate">{email}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                    </a>
                  ) : null}

                  {website ? (
                    <a
                      href={website.startsWith('http') ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold transition-colors group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Globe className="h-3.5 w-3.5 text-procarni-blue" />
                        <span className="truncate">{website.replace(/^https?:\/\//, '')}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                    </a>
                  ) : null}

                  {instagram ? (
                    <a
                      href={`https://instagram.com/${instagram.replace(/^@/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-2.5 rounded-xl bg-pink-50/50 hover:bg-pink-50 border border-pink-100 text-pink-800 font-semibold transition-colors group"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Instagram className="h-3.5 w-3.5 text-pink-600" />
                        <span className="truncate">@{instagram.replace(/^@/, '')}</span>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
                    </a>
                  ) : null}

                  {!phone && !phone2 && !email && !website && !instagram && (
                    <p className="text-gray-400 text-[11px] italic">Sin información de contacto registrada.</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* FILA 2: MATERIALES SUMINISTRADOS + TARJETA DE PAGINACIÓN ALINEADA A LA DERECHA */}
        {!isNew && (
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 lg:col-span-9">
              <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-5 sm:p-8 rounded-[2rem] shadow-xl shadow-gray-200/50 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-procarni-primary shrink-0" />
                    <div>
                      <h3 className="font-extrabold text-base sm:text-lg text-procarni-dark tracking-tight">Materiales Suministrados</h3>
                      <p className="text-[11px] sm:text-xs text-gray-400">Catálogo de productos que provee esta empresa ({filteredMaterials.length})</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {/* Buscador */}
                    <div className="relative flex-1 sm:w-52">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <Input
                        placeholder="Buscar material..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 bg-slate-50 border-slate-200 rounded-xl h-9 text-xs focus:ring-procarni-primary/20 w-full"
                      />
                    </div>

                    {/* Botón Asociar */}
                    <Button
                      onClick={handleOpenAddMaterial}
                      className="bg-procarni-secondary hover:bg-green-700 text-white font-bold text-xs rounded-xl h-9 px-3.5 shadow-md flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <PlusCircle className="h-4 w-4" />
                      <span>Asociar</span>
                    </Button>
                  </div>
                </div>

                {filteredMaterials.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <Package className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-500 font-semibold">No hay materiales asociados que coincidan con la búsqueda.</p>
                    <p className="text-[11px] text-gray-400 mt-1">Presiona "Asociar" para vincular productos del catálogo a este proveedor.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* VISTA DESKTOP: TABLA CLÁSICA (md+) */}
                    <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
                      <Table>
                        <TableHeader className="bg-slate-50/70">
                          <TableRow className="border-b border-slate-100">
                            <TableHead className={cn(tableHeaderClass, "pl-4")}>Código</TableHead>
                            <TableHead className={tableHeaderClass}>Nombre del Material</TableHead>
                            <TableHead className={tableHeaderClass}>Categoría</TableHead>
                            <TableHead className={tableHeaderClass}>Unidad</TableHead>
                            <TableHead className={tableHeaderClass}>Ficha Técnica</TableHead>
                            <TableHead className={cn(tableHeaderClass, "text-right pr-4")}>Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedMaterials.map((sm) => {
                            const catColor = CATEGORY_COLORS[sm.materials.category?.toUpperCase() || ''] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
                            return (
                              <TableRow key={sm.id} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none transition-colors">
                                <TableCell className="font-mono text-xs font-bold text-slate-500 pl-4 py-3">
                                  {sm.materials.code || '—'}
                                </TableCell>
                                <TableCell className="py-3">
                                  <span
                                    onClick={() => navigate(`/material/${sm.material_id}`)}
                                    className="font-bold text-xs text-slate-800 hover:text-procarni-primary cursor-pointer transition-colors"
                                  >
                                    {sm.materials.name}
                                  </span>
                                </TableCell>
                                <TableCell className="py-3">
                                  <Badge variant="outline" className={cn("text-[10px] font-bold border px-2 py-0.5", catColor.bg, catColor.text, catColor.border)}>
                                    {sm.materials.category || 'Sin Cat.'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-xs font-semibold text-slate-600 py-3">
                                  {sm.units_of_measure?.name || sm.materials.unit || 'UND'}
                                </TableCell>
                                <TableCell className="py-3">
                                  {sm.hasFichaResult ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleViewFicha(sm.materials.name)}
                                      className="h-7 text-[10px] font-bold text-procarni-secondary border-procarni-secondary/30 hover:bg-emerald-50 rounded-lg"
                                    >
                                      <FileText className="h-3 w-3 mr-1" /> Ver Ficha
                                    </Button>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 italic">No disponible</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right pr-4 py-3" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500"
                                        title="Opciones"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                                      <DropdownMenuItem
                                        onClick={() => navigate(`/material/${sm.material_id}`)}
                                        className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                                      >
                                        <Eye className="h-4 w-4 text-slate-400" />
                                        <span>Ver Perfil</span>
                                      </DropdownMenuItem>
                                      {sm.hasFichaResult && (
                                        <DropdownMenuItem
                                          onClick={() => handleViewFicha(sm.materials.name)}
                                          className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-procarni-secondary hover:bg-emerald-50"
                                        >
                                          <FileText className="h-4 w-4 text-procarni-secondary" />
                                          <span>Ver Ficha Técnica</span>
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem
                                        onClick={() => handleRemoveSingleMaterial(sm.id)}
                                        className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        <span>Desvincular</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    {/* VISTA MOBILE: TARJETAS STACKEADAS (< md) */}
                    <div className="block md:hidden space-y-3">
                      {paginatedMaterials.map((sm) => {
                        const catColor = CATEGORY_COLORS[sm.materials.category?.toUpperCase() || ''] || { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' };
                        return (
                          <div
                            key={`mobile-mat-${sm.id}`}
                            className="bg-white/80 backdrop-blur-sm p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2.5 transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                                  {sm.materials.code || 'S/C'}
                                </span>
                                <Badge variant="outline" className={cn("text-[9px] font-bold border px-1.5 py-0.5", catColor.bg, catColor.text, catColor.border)}>
                                  {sm.materials.category || 'Sin Cat.'}
                                </Badge>
                              </div>
                              <div onClick={(e) => e.stopPropagation()}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0 -mt-1 -mr-1"
                                      title="Opciones"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-44 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                                    <DropdownMenuItem
                                      onClick={() => navigate(`/material/${sm.material_id}`)}
                                      className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                                    >
                                      <Eye className="h-4 w-4 text-slate-400" />
                                      <span>Ver Perfil</span>
                                    </DropdownMenuItem>
                                    {sm.hasFichaResult && (
                                      <DropdownMenuItem
                                        onClick={() => handleViewFicha(sm.materials.name)}
                                        className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-procarni-secondary hover:bg-emerald-50"
                                      >
                                        <FileText className="h-4 w-4 text-procarni-secondary" />
                                        <span>Ver Ficha Técnica</span>
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => handleRemoveSingleMaterial(sm.id)}
                                      className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-destructive hover:bg-red-50 focus:text-destructive focus:bg-red-50"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span>Desvincular</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>

                            <p
                              onClick={() => navigate(`/material/${sm.material_id}`)}
                              className="font-bold text-xs text-slate-900 leading-snug cursor-pointer hover:text-procarni-primary transition-colors"
                            >
                              {sm.materials.name}
                            </p>

                            <div className="flex items-center justify-between pt-1 border-t border-slate-100/80 text-xs">
                              <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                <span>Unidad:</span>
                                <span className="font-mono font-bold text-slate-700">{sm.units_of_measure?.name || sm.materials.unit || 'UND'}</span>
                              </div>

                              {sm.hasFichaResult ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleViewFicha(sm.materials.name)}
                                  className="h-6 text-[10px] font-bold text-procarni-secondary border-procarni-secondary/30 hover:bg-emerald-50 rounded-lg px-2"
                                >
                                  <FileText className="h-3 w-3 mr-1" /> Ficha Técnica
                                </Button>
                              ) : (
                                <span className="text-[10px] text-gray-400 italic">Sin ficha</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* PAGINACIÓN DISCRETA Y COMPACTA PARA MÓVILES (< md) */}
                    {totalMaterialPages > 1 && (
                      <div className="flex md:hidden items-center justify-between pt-2 border-t border-slate-100 text-xs">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {((materialPage - 1) * MATERIAL_PAGE_SIZE) + 1}–{Math.min(materialPage * MATERIAL_PAGE_SIZE, filteredMaterials.length)} de {filteredMaterials.length}
                        </span>

                        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-xl p-0.5 shadow-sm">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={materialPage <= 1}
                            onClick={() => setMaterialPage(p => Math.max(1, p - 1))}
                            className="h-6 w-6 rounded-lg text-slate-600 disabled:opacity-20"
                            title="Página anterior"
                          >
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <span className="text-[10px] font-bold text-slate-700 px-1 font-mono">
                            {materialPage} / {totalMaterialPages}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={materialPage >= totalMaterialPages}
                            onClick={() => setMaterialPage(p => Math.min(totalMaterialPages, p + 1))}
                            className="h-6 w-6 rounded-lg text-slate-600 disabled:opacity-20"
                            title="Página siguiente"
                          >
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {/* Columna Derecha Alineada con Materiales (Exactamente en el recuadro naranja!) */}
            <div className="col-span-12 lg:col-span-3">
              {totalMaterialPages > 1 ? (
                <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] shadow-xl shadow-gray-200/50 space-y-4 animate-in fade-in sticky top-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-procarni-primary" />
                      <span className="font-extrabold text-xs text-procarni-dark uppercase tracking-wider">
                        Páginas de Materiales
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700">
                      {filteredMaterials.length} ítems
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] text-gray-500 font-medium">
                      Selecciona libremente la página que deseas visualizar:
                    </p>

                    {/* Grid de Botones de Página libres */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {Array.from({ length: totalMaterialPages }, (_, i) => i + 1).map((pageNum) => (
                        <Button
                          key={`page-btn-${pageNum}`}
                          variant={materialPage === pageNum ? 'default' : 'outline'}
                          onClick={() => setMaterialPage(pageNum)}
                          className={cn(
                            "h-8 font-mono text-xs font-bold rounded-xl transition-all",
                            materialPage === pageNum
                              ? "bg-procarni-primary text-white shadow-md shadow-procarni-primary/20 scale-105"
                              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                          )}
                        >
                          {pageNum}
                        </Button>
                      ))}
                    </div>

                    {/* Selector directo si hay muchas páginas */}
                    {totalMaterialPages > 5 && (
                      <div className="pt-1">
                        <Select
                          value={String(materialPage)}
                          onValueChange={(val) => setMaterialPage(Number(val))}
                        >
                          <SelectTrigger className="w-full bg-slate-50 border-slate-200 rounded-xl h-8 text-xs">
                            <SelectValue placeholder="Ir a la página..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-56">
                            {Array.from({ length: totalMaterialPages }, (_, i) => i + 1).map((pageNum) => (
                              <SelectItem key={`select-page-${pageNum}`} value={String(pageNum)} className="text-xs">
                                Página {pageNum} de {totalMaterialPages}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Botones Anterior / Siguiente */}
                    <div className="flex items-center justify-between pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={materialPage <= 1}
                        onClick={() => setMaterialPage(p => Math.max(1, p - 1))}
                        className="h-8 text-xs font-bold rounded-xl border-slate-200 text-slate-600 disabled:opacity-30 px-2.5"
                      >
                        <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Ant.
                      </Button>
                      <span className="text-[10px] font-bold text-slate-500 font-mono">
                        {materialPage} / {totalMaterialPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={materialPage >= totalMaterialPages}
                        onClick={() => setMaterialPage(p => Math.min(totalMaterialPages, p + 1))}
                        className="h-8 text-xs font-bold rounded-xl border-slate-200 text-slate-600 disabled:opacity-30 px-2.5"
                      >
                        Sig. <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* FILA 3: PESTAÑAS DE HISTORIAL Y ANÁLISIS + AUDITORÍA */}
        {!isNew && (
          <div className="grid grid-cols-12 gap-8 items-start">
            <div className="col-span-12 lg:col-span-9">
              <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-8 rounded-[2rem] shadow-xl shadow-gray-200/50 space-y-6">
                <Tabs defaultValue="ordenes-compra" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 bg-slate-100/80 p-1.5 rounded-2xl gap-1">
                    <TabsTrigger value="ordenes-compra" className="text-xs font-bold py-2.5 rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm transition-all">
                      Órdenes Compra ({purchaseOrders.length})
                    </TabsTrigger>
                    <TabsTrigger value="ordenes-servicio" className="text-xs font-bold py-2.5 rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm transition-all">
                      Servicios ({serviceOrders.length})
                    </TabsTrigger>
                    <TabsTrigger value="historial-precios" className="text-xs font-bold py-2.5 rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm transition-all">
                      Historial Precios ({supplierPriceHistory.length})
                    </TabsTrigger>
                    <TabsTrigger value="sugeridos" className="text-xs font-bold py-2.5 rounded-xl text-slate-600 data-[state=active]:bg-white data-[state=active]:text-procarni-blue data-[state=active]:shadow-sm transition-all">
                      Más Comprados ({suggestedMaterials.length})
                    </TabsTrigger>
                  </TabsList>

                  {/* TAB 1: ÓRDENES DE COMPRA */}
                  <TabsContent value="ordenes-compra" className="pt-4 space-y-3">
                    {purchaseOrders.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        No hay órdenes de compra registradas para este proveedor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
                        <Table>
                          <TableHeader className="bg-slate-50/70">
                            <TableRow className="border-b border-slate-100">
                              <TableHead className={cn(tableHeaderClass, "pl-4")}>Nº Orden</TableHead>
                              <TableHead className={tableHeaderClass}>Fecha</TableHead>
                              <TableHead className={tableHeaderClass}>Total ($)</TableHead>
                              <TableHead className={tableHeaderClass}>Estado</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right pr-4")}>Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {purchaseOrders.map((po: any) => {
                              const orderTotal = calculateTotals(po.purchase_order_items || []).total;
                              return (
                                <TableRow key={po.id} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none transition-colors">
                                  <TableCell className="font-mono text-xs font-bold text-slate-700 pl-4 py-3">
                                    {po.sequence_number ? `OC-${po.sequence_number}` : (po.id ? String(po.id).substring(0, 8) : '—')}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-500 py-3">
                                    {po.issue_date ? new Date(po.issue_date).toLocaleDateString() : '—'}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs font-bold text-procarni-dark py-3">
                                    ${orderTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <Badge variant="outline" className={cn("text-[10px] font-bold border", getStatusColor(po.status))}>
                                      {po.status || 'Registrado'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right pr-4 py-3">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                                      className="h-7 text-xs font-bold text-procarni-blue hover:bg-blue-50 rounded-lg"
                                    >
                                      Ver <ExternalLink className="h-3 w-3 ml-1" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 2: ÓRDENES DE SERVICIO */}
                  <TabsContent value="ordenes-servicio" className="pt-4 space-y-3">
                    {serviceOrders.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        No hay órdenes de servicio registradas para este proveedor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
                        <Table>
                          <TableHeader className="bg-slate-50/70">
                            <TableRow className="border-b border-slate-100">
                              <TableHead className={cn(tableHeaderClass, "pl-4")}>Nº Servicio</TableHead>
                              <TableHead className={tableHeaderClass}>Fecha</TableHead>
                              <TableHead className={tableHeaderClass}>Monto ($)</TableHead>
                              <TableHead className={tableHeaderClass}>Estado</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-right pr-4")}>Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {serviceOrders.map((so: any) => {
                              const serviceTotal = calculateTotals([
                                ...(so.service_order_items || []),
                                ...(so.service_order_materials || [])
                              ]).total;
                              return (
                                <TableRow key={so.id} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none transition-colors">
                                  <TableCell className="font-mono text-xs font-bold text-slate-700 pl-4 py-3">
                                    {so.sequence_number ? `OS-${so.sequence_number}` : (so.id ? String(so.id).substring(0, 8) : '—')}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-500 py-3">
                                    {so.issue_date ? new Date(so.issue_date).toLocaleDateString() : '—'}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs font-bold text-procarni-dark py-3">
                                    ${serviceTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <Badge variant="outline" className={cn("text-[10px] font-bold border", getStatusColor(so.status))}>
                                      {so.status || 'Registrado'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right pr-4 py-3">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => navigate(`/service-orders/${so.id}`)}
                                      className="h-7 text-xs font-bold text-procarni-blue hover:bg-blue-50 rounded-lg"
                                    >
                                      Ver <ExternalLink className="h-3 w-3 ml-1" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 3: HISTORIAL DE PRECIOS */}
                  <TabsContent value="historial-precios" className="pt-4 space-y-3">
                    {priceAnalysisByMaterial.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        No hay registros de precios históricos para este proveedor.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
                        <Table>
                          <TableHeader className="bg-slate-50/70">
                            <TableRow className="border-b border-slate-100">
                              <TableHead className={cn(tableHeaderClass, "pl-4")}>Material</TableHead>
                              <TableHead className={tableHeaderClass}>Unidad</TableHead>
                              <TableHead className={tableHeaderClass}>Precio Mínimo</TableHead>
                              <TableHead className={tableHeaderClass}>Precio Promedio</TableHead>
                              <TableHead className={tableHeaderClass}>Precio Máximo</TableHead>
                              <TableHead className={tableHeaderClass}>Último Precio</TableHead>
                              <TableHead className={cn(tableHeaderClass, "text-center pr-4")}>Tendencia</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {priceAnalysisByMaterial.map((m) => (
                              <TableRow key={m.materialId} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-none transition-colors">
                                <TableCell className="font-bold text-xs text-slate-800 pl-4 py-3">{m.name}</TableCell>
                                <TableCell className="font-mono text-xs text-slate-500 py-3">{m.unit}</TableCell>
                                <TableCell className="font-mono text-xs text-slate-600 py-3">${m.min.toFixed(4)}</TableCell>
                                <TableCell className="font-mono text-xs font-semibold text-slate-700 py-3">${m.avg.toFixed(4)}</TableCell>
                                <TableCell className="font-mono text-xs text-slate-600 py-3">${m.max.toFixed(4)}</TableCell>
                                <TableCell className="font-mono text-xs font-black text-procarni-primary py-3">${m.latestPrice.toFixed(4)}</TableCell>
                                <TableCell className="text-center pr-4 py-3">
                                  {m.trend === 'up' && (
                                    <Badge className="bg-red-50 text-procarni-primary border-red-200 text-[10px] font-bold">
                                      <TrendingUp className="h-3 w-3 mr-1" /> Alza
                                    </Badge>
                                  )}
                                  {m.trend === 'down' && (
                                    <Badge className="bg-emerald-50 text-procarni-secondary border-emerald-200 text-[10px] font-bold">
                                      <TrendingDown className="h-3 w-3 mr-1" /> Baja
                                    </Badge>
                                  )}
                                  {m.trend === 'stable' && (
                                    <Badge variant="outline" className="text-[10px] font-bold text-slate-500">
                                      Estable
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 4: MÁS COMPRADOS / SUGERIDOS */}
                  <TabsContent value="sugeridos" className="pt-4 space-y-4">
                    {suggestedMaterials.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 text-xs italic bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        No hay historial de compras suficiente para generar sugerencias.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <p className="text-xs text-gray-500 font-medium">
                            Seleccione los materiales recurrentes para generar una nueva Orden de Compra automáticamente.
                          </p>
                          <Button
                            onClick={handleGenerateOCFromSuggestions}
                            className="bg-procarni-primary hover:bg-procarni-primary/95 text-white font-bold text-xs rounded-xl h-9 px-4 shadow-md flex items-center gap-1.5 transition-all"
                          >
                            <ShoppingCart className="h-4 w-4" />
                            <span>Generar OC ({selectedSuggestIds.size})</span>
                          </Button>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white/60">
                          <Table>
                            <TableHeader className="bg-slate-50/70">
                              <TableRow className="border-b border-slate-100">
                                <TableHead className="w-12 pl-4">
                                  <Checkbox
                                    checked={selectedSuggestIds.size === suggestedMaterials.length && suggestedMaterials.length > 0}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        const allIds = new Set(suggestedMaterials.map(m => m.material_id || m.material_name).filter(Boolean) as string[]);
                                        setSelectedSuggestIds(allIds);
                                      } else {
                                        setSelectedSuggestIds(new Set());
                                      }
                                    }}
                                  />
                                </TableHead>
                                <TableHead className={tableHeaderClass}>Material</TableHead>
                                <TableHead className={tableHeaderClass}>Unidad</TableHead>
                                <TableHead className={tableHeaderClass}>Veces Comprado</TableHead>
                                <TableHead className={tableHeaderClass}>Último Precio ($)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {suggestedMaterials.map((item) => {
                                const key = (item.material_id || item.material_name) as string;
                                const isChecked = selectedSuggestIds.has(key);
                                return (
                                  <TableRow
                                    key={`suggest-${key}`}
                                    className={cn("hover:bg-slate-50/50 border-b border-slate-50 last:border-none transition-colors cursor-pointer", isChecked && "bg-blue-50/20")}
                                    onClick={() => toggleSuggestSelection(key)}
                                  >
                                    <TableCell className="pl-4 py-3" onClick={(e) => e.stopPropagation()}>
                                      <Checkbox
                                        checked={isChecked}
                                        onCheckedChange={() => toggleSuggestSelection(key)}
                                      />
                                    </TableCell>
                                    <TableCell className="font-bold text-xs text-slate-800 py-3">
                                      {item.material_name}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500 py-3">
                                      {item.unit || 'UND'}
                                    </TableCell>
                                    <TableCell className="py-3">
                                      <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-procarni-blue border-blue-200">
                                        {item.count} {item.count === 1 ? 'orden' : 'órdenes'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs font-bold text-procarni-dark py-3">
                                      ${(item.unit_price || 0).toFixed(4)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </section>
            </div>

            {/* Columna Derecha: Auditoría */}
            <div className="col-span-12 lg:col-span-3">
              {supplier && (
                <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] border border-dashed border-slate-200/80 shadow-sm space-y-1">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Auditoría</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium italic leading-relaxed">
                    Registrado: {supplier.created_at ? new Date(supplier.created_at).toLocaleDateString() : '—'}<br />
                    Última actualización: {supplier.updated_at ? new Date(supplier.updated_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* MODAL: ASOCIAR MATERIALES EN LOTE */}
      <Dialog open={isAddMaterialOpen} onOpenChange={setIsAddMaterialOpen}>
        <DialogContent className="max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-lg font-black text-procarni-blue tracking-tight">
              Asociar Materiales al Proveedor
            </DialogTitle>
            <p className="text-xs text-gray-500 font-medium">
              Vincule múltiples materiales del catálogo general a este proveedor.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar material por nombre o código..."
                className="pl-9 bg-slate-50 border-slate-200 rounded-xl h-10 text-xs focus:ring-procarni-primary/20"
                value={materialSearchQuery}
                onChange={(e) => setMaterialSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              {allCatalogMaterials.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4">
                  No se encontraron materiales.
                </p>
              ) : (
                allCatalogMaterials.map((mat) => {
                  const isChecked = selectedMaterialIds.includes(mat.id);
                  return (
                    <div
                      key={`mat-item-${mat.id}`}
                      onClick={() => {
                        if (isChecked) {
                          setSelectedMaterialIds(selectedMaterialIds.filter(id => id !== mat.id));
                        } else {
                          setSelectedMaterialIds([...selectedMaterialIds, mat.id]);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border",
                        isChecked
                          ? "bg-emerald-50/20 border-emerald-200/50"
                          : "bg-white border-transparent hover:bg-slate-50"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isChecked} onCheckedChange={() => {}} />
                        <div className="space-y-0.5">
                          <p className="text-xs font-bold text-slate-800">{mat.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">Cód: {mat.code || 'S/C'} • {mat.category || 'Sin cat.'} • {mat.unit || 'UND'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddMaterialOpen(false)}
              className="flex-1 bg-slate-50 hover:bg-slate-100 text-procarni-dark font-bold text-xs py-5 rounded-xl border border-slate-200"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isAssociating}
              onClick={handleSaveMaterialAssociations}
              className="flex-1 bg-procarni-primary hover:bg-procarni-primary/95 text-white font-bold text-xs py-5 rounded-xl shadow-md"
            >
              {isAssociating ? 'Guardando...' : 'Guardar Asociaciones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: VISOR DE FICHA TÉCNICA */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col bg-white rounded-3xl p-6">
          <DialogHeader className="pb-3 border-b border-slate-100">
            <DialogTitle className="text-lg font-black text-procarni-blue">{currentFichaTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-2xl bg-slate-50 border border-slate-100 mt-2">
            {currentFichaUrl ? (
              <iframe src={currentFichaUrl} className="w-full h-full border-none" title="PDF Viewer" />
            ) : (
              <div className="text-center text-destructive py-10">No se pudo cargar el documento.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default SupplierDetails;