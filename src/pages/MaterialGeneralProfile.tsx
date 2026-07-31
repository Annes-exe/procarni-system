import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { m } from 'framer-motion';
import {
  ArrowLeft, Package, DollarSign, TrendingUp, Settings,
  History, Save, ShoppingCart, Truck, ChevronRight, AlertCircle, Info, Tag, Layers, Search,
  Calendar, RefreshCw, FileText, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { updateMaterial, createMaterial } from '@/integrations/supabase/services/materialService';
import { getSuppliersByMaterial, getAllUnits } from '@/integrations/supabase/data';
import { getPriceHistoryByMaterialId } from '@/integrations/supabase/services/priceHistoryService';
import { getAllMaterialCategories } from '@/integrations/supabase/services/materialCategoryService';
import { useSession } from '@/components/SessionContextProvider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
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
import SmartSearch from '@/components/SmartSearch';

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

const MaterialGeneralProfile = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addItem, clearCart } = useShoppingCart();
  const { session } = useSession();
  const isNew = id === 'new';

  // Fetch material from materials table
  const { data: material, isLoading: isLoadingMaterial } = useQuery({
    queryKey: ['materialDetail', id],
    queryFn: async () => {
      if (!id || id === 'new') return null;
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id && id !== 'new',
  });

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
    queryFn: () => (id && id !== 'new' ? getSuppliersByMaterial(id) : Promise.resolve([])),
    enabled: !!id && id !== 'new',
  });

  // Fetch price history to calculate metrics
  const { data: priceHistory = [], refetch: refetchPriceHistory, isFetching: isFetchingPriceHistory } = useQuery({
    queryKey: ['priceHistory', id],
    queryFn: () => (id && id !== 'new' ? getPriceHistoryByMaterialId(id) : Promise.resolve([])),
    enabled: !!id && id !== 'new',
  });

  // States for Price History Report Filters
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Filter Price History
  const filteredPriceHistory = useMemo(() => {
    if (!priceHistory || priceHistory.length === 0) return [];
    
    return priceHistory.filter((item: any) => {
      const recDate = new Date(item.recorded_at);
      
      if (filterPeriod === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        return recDate >= oneWeekAgo;
      }
      if (filterPeriod === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return recDate >= oneMonthAgo;
      }
      if (filterPeriod === 'day') {
        if (!startDate) return true;
        const targetDate = new Date(startDate + 'T00:00:00');
        return recDate.toDateString() === targetDate.toDateString();
      }
      if (filterPeriod === 'custom') {
        let matchStart = true;
        let matchEnd = true;
        if (startDate) {
          const start = new Date(startDate + 'T00:00:00');
          matchStart = recDate >= start;
        }
        if (endDate) {
          const end = new Date(endDate + 'T23:59:59');
          matchEnd = recDate <= end;
        }
        return matchStart && matchEnd;
      }
      return true; // 'all'
    });
  }, [priceHistory, filterPeriod, startDate, endDate]);

  // Generate and Download Price History PDF Report (CXP & Recepciones style)
  const handleDownloadPriceHistoryPDF = () => {
    try {
      const doc = new jsPDF();
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Title & Header setup
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(27, 41, 74); // Procarni blue
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // Primary red
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // Dark slate
      doc.text('Reporte de Historial de Precios', 200, 18, { align: 'right' });

      // Period and Item Info
      let periodLabel = 'Todos los registros';
      if (filterPeriod === 'week') periodLabel = 'Última Semana';
      else if (filterPeriod === 'month') periodLabel = 'Último Mes';
      else if (filterPeriod === 'day') {
        periodLabel = startDate ? `Día: ${format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')}` : 'Todos los registros';
      }
      else if (filterPeriod === 'custom') {
        if (!startDate && !endDate) {
          periodLabel = 'Todos los registros';
        } else {
          const from = startDate ? format(new Date(startDate), 'dd/MM/yyyy') : 'Inicio';
          const to = endDate ? format(new Date(endDate), 'dd/MM/yyyy') : 'Fin';
          periodLabel = `Periodo: ${from} - ${to}`;
        }
      }

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Ítem: ${materialName || 'Material'} (${material?.code || 'S/C'})`, 14, 32);
      doc.text(`Periodo: ${periodLabel}`, 200, 23, { align: 'right' });
      doc.text(`Fecha Emisión: ${dateStr}`, 200, 28, { align: 'right' });

      const tableData = filteredPriceHistory.map((ph: any) => {
        const po = ph.purchase_orders;
        const year = po?.issue_date ? new Date(po.issue_date).getFullYear() : new Date(ph.recorded_at).getFullYear();
        const month = po?.issue_date ? String(new Date(po.issue_date).getMonth() + 1).padStart(2, '0') : String(new Date(ph.recorded_at).getMonth() + 1).padStart(2, '0');
        const displayId = po ? `OC-${year}-${month}-${String(po.sequence_number || 0).padStart(3, '0')}` : (ph.reference_doc || 'Manual');
        
        return [
          new Date(ph.recorded_at).toLocaleDateString('es-VE'),
          ph.suppliers?.name || 'Desconocido',
          displayId,
          ph.unit || material?.unit || 'KG',
          `$ ${ph.unit_price.toFixed(4)}`,
          ph.currency || 'USD',
          ph.exchange_rate ? ph.exchange_rate.toFixed(2) : '-'
        ];
      });

      autoTable(doc, {
        startY: 38,
        head: [['Fecha', 'Proveedor', 'Referencia', 'Unidad', 'Precio Unitario', 'Moneda', 'Tasa']],
        body: tableData,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1 },
          lineColor: [226, 232, 240],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [241, 245, 249],
        },
        alternateRowStyles: {
          fillColor: [250, 250, 250],
        },
        margin: { top: 38 },
      });

      const finalY = (doc as any).lastAutoTable.finalY || 40;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text('Reporte generado automáticamente desde el Perfil de Materiales - Procarni.', 14, finalY + 15);

      const fileDate = new Date().toISOString().split('T')[0];
      doc.save(`Reporte_Historial_Precios_${(materialName || 'Material').replace(/\s+/g, '_')}_${fileDate}.pdf`);
      toast.success('Reporte PDF del Historial de Precios descargado exitosamente.');
    } catch (error) {
      console.error('PDF Export Error:', error);
      toast.error('Ocurrió un error al generar el PDF del historial de precios.');
    }
  };

  // Fetch all Purchase Orders containing this material
  const { data: materialPOs = [], isLoading: isLoadingPOs } = useQuery({
    queryKey: ['materialPOs', id],
    queryFn: async () => {
      if (!id || id === 'new') return [];
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
    enabled: !!id && id !== 'new',
  });

  // Local state fields matching the creation modal
  const [materialName, setMaterialName] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isExempt, setIsExempt] = useState<boolean>(false);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedParentName, setSelectedParentName] = useState<string>('');
  const [isMasterLocal, setIsMasterLocal] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState<boolean>(false);
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
  const [isSaving, setIsSaving] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activeHistoryTab, setActiveHistoryTab] = useState('precios');

  // Supplier Association Dialog state
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('');
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [isAssociating, setIsAssociating] = useState(false);

  const handleOpenAddSupplier = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, city')
        .eq('status', 'Active')
        .order('name', { ascending: true })
        .limit(50);
      if (error) throw error;
      setAllSuppliers(data || []);
      setSelectedSupplierIds(suppliers.map(s => s.id));
      setSupplierSearchQuery('');
      setIsAddSupplierOpen(true);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      toast.error('No se pudieron cargar los proveedores.');
    }
  };

  const handleSaveSupplierAssociations = async () => {
    if (!material) return;
    try {
      setIsAssociating(true);
      const originalIds = suppliers.map(s => s.id);
      
      const idsToAdd = selectedSupplierIds.filter(id => !originalIds.includes(id));
      const idsToRemove = originalIds.filter(id => !selectedSupplierIds.includes(id));

      // 1. Add new associations
      if (idsToAdd.length > 0) {
        const insertPayloads = idsToAdd.map(supplierId => ({
          supplier_id: supplierId,
          material_id: material.id,
          unit_id: selectedUnitId || material.unit_id || '',
          user_id: session?.user?.id || ''
        }));
        const { error: insertError } = await supabase
          .from('supplier_materials')
          .insert(insertPayloads);
        if (insertError) throw insertError;
      }

      // 2. Remove old associations
      if (idsToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('supplier_materials')
          .delete()
          .eq('material_id', material.id)
          .in('supplier_id', idsToRemove);
        if (deleteError) throw deleteError;
      }

      toast.success('Relaciones de proveedores actualizadas.');
      queryClient.invalidateQueries({ queryKey: ['materialSuppliers', id] });
      setIsAddSupplierOpen(false);
    } catch (err) {
      console.error('Error saving supplier associations:', err);
      toast.error('Ocurrió un error al guardar las asociaciones.');
    } finally {
      setIsAssociating(false);
    }
  };

  // Search effect on suppliers with 300ms debounce
  useEffect(() => {
    if (!isAddSupplierOpen) return;

    const delayDebounceFn = setTimeout(async () => {
      try {
        let queryBuilder = supabase
          .from('suppliers')
          .select('id, name, city')
          .eq('status', 'Active')
          .order('name', { ascending: true })
          .limit(50);

        if (supplierSearchQuery.trim()) {
          queryBuilder = queryBuilder.ilike('name', `%${supplierSearchQuery.trim()}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;
        setAllSuppliers(data || []);
      } catch (err) {
        console.error('Error searching suppliers:', err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [supplierSearchQuery, isAddSupplierOpen]);

  const filteredSuppliers = allSuppliers;

  // Sync state with loaded material data
  useEffect(() => {
    if (isNew) {
      if (categories.length > 0 && !selectedCategory) {
        setSelectedCategory(categories[0].name);
      }
      if (units.length > 0 && !selectedUnitId) {
        setSelectedUnitId(units[0].id);
      }
    } else if (material) {
      setMaterialName(material.name || '');
      setSelectedCategory(material.category || '');
      setIsActive(material.status !== 'archived');
      setIsExempt(material.is_exempt || false);
      setIsMasterLocal(material.is_master || false);
      setSelectedParentId(material.base_material_id || '');
      setShowSearch(!!material.base_material_id);
      setColor(material.color || '');
      setBrand(material.brand || '');
      setNameProvided(material.search_aliases ? material.search_aliases.join(', ') : '');

      // Parse structured name if editing an existing material (TRIPAS, BOLSAS, TERMOFORMADO)
      if (material.name && material.name.toUpperCase().startsWith('TRIPAS')) {
        setSpecialStructure('TRIPAS');
        const nameUpper = material.name.toUpperCase();
        
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
      } else if (material.name && (material.name.toUpperCase().startsWith('BOLSAS') || material.name.toUpperCase().startsWith('TERMOFORMADO'))) {
        setSpecialStructure('BOLSAS_TERMO');
        const nameUpper = material.name.toUpperCase();
        
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

      // Load parent name if base_material_id exists
      if (material.base_material_id) {
        supabase
          .from('materials')
          .select('name')
          .eq('id', material.base_material_id)
          .single()
          .then(({ data }) => {
            if (data) setSelectedParentName(data.name);
          });
      } else {
        setSelectedParentName('');
      }

      // Sync Unit ID
      if (material.unit_id) {
        setSelectedUnitId(material.unit_id);
      } else if (units.length > 0 && material.unit) {
        const matchingUnit = units.find(u => u.name.toUpperCase() === material.unit.toUpperCase());
        if (matchingUnit) {
          setSelectedUnitId(matchingUnit.id);
        }
      }
    }
  }, [material, units]);

  // Auto-compile TRIPAS name based on structured fields (without parentheses, omitting empty/blank values)
  useEffect(() => {
    if (specialStructure === 'TRIPAS' && selectedCategory === 'EMPAQUE') {
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
  }, [specialStructure, tripaTipo, tripaMedida, tripaColor, tripaMetros, tripaVariaciones, selectedCategory]);

  // Auto-compile BOLSAS & TERMOFORMADO name based on structured fields (without parentheses, omitting empty/blank values)
  useEffect(() => {
    if (specialStructure === 'BOLSAS_TERMO' && selectedCategory === 'EMPAQUE') {
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
  }, [specialStructure, btPrefix, btTipo, btVariaciones, btMedidaValor, btMedidaUnidad, btColor, btMicra, btUso, selectedCategory]);

  // Automatically enable TRIPAS or BOLSAS/TERMO UI when category is EMPAQUE and item is new or is already structured
  useEffect(() => {
    if (selectedCategory === 'EMPAQUE') {
      if (isNew || !materialName) {
        setSpecialStructure('TRIPAS');
      } else if (materialName.toUpperCase().startsWith('TRIPAS')) {
        setSpecialStructure('TRIPAS');
      } else if (materialName.toUpperCase().startsWith('BOLSAS') || materialName.toUpperCase().startsWith('TERMOFORMADO')) {
        setSpecialStructure('BOLSAS_TERMO');
      } else {
        setSpecialStructure('NONE');
      }
    } else {
      setSpecialStructure('NONE');
    }
  }, [selectedCategory, isNew]);
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

  // Enforce is_exempt=true when category is FRESCA
  useEffect(() => {
    if (selectedCategory === 'FRESCA') {
      setIsExempt(true);
    }
  }, [selectedCategory]);

  // Calculate purchase history metrics
  const purchaseStats = useMemo(() => {
    if (priceHistory.length === 0) {
      return {
        timesPurchasedThisMonth: 0,
        lastCost: 0,
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
  }, [priceHistory]);

  const handleSaveChanges = async () => {
    if (!material && !isNew) return;
    const trimmedMaterialName = materialName.trim().toUpperCase();
    if (!trimmedMaterialName) {
      toast.error('El nombre del material es requerido.');
      return;
    }

    try {
      setIsSaving(true);
      const targetUnit = units.find(u => u.id === selectedUnitId);
      const unitName = targetUnit ? targetUnit.name : 'KG';

      const catUpper = selectedCategory.toUpperCase();
      const unitUpper = unitName.toUpperCase();
      if (catUpper === 'SECA' && !['KG', 'LT', 'GR'].includes(unitUpper)) {
        toast.error('Para la categoría SECA, las unidades permitidas son: KG, LT, GR');
        return;
      }
      if (catUpper === 'FRESCA' && unitUpper !== 'KG') {
        toast.error('Para la categoría FRESCA, la única unidad permitida es: KG');
        return;
      }
      if (catUpper === 'EMPAQUE' && !['MT', 'UND'].includes(unitUpper)) {
        toast.error('Para la categoría EMPAQUE, las unidades permitidas son: MT (TRIPAS), UND (BOLSAS)');
        return;
      }

      if (!isNew && selectedParentId === material.id) {
        toast.error('Un material no puede ser su propio patrón de oro.');
        return;
      }

      const payload = {
        name: trimmedMaterialName,
        category: selectedCategory || null,
        unit_id: selectedUnitId || null,
        unit: unitName,
        is_exempt: selectedCategory === 'FRESCA' ? true : isExempt,
        status: isActive ? 'active' : 'archived',
        is_master: isMasterLocal,
        base_material_id: isMasterLocal ? null : (selectedParentId || null),
        color: color.trim() || null,
        brand: brand.trim() || null,
        search_aliases: nameProvided.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      };

      if (isNew) {
        // Insert new material
        const newMaterial = await createMaterial({
          ...payload,
          user_id: session?.user?.id || '',
          code: '', // Will be generated by DB trigger
          status: 'active'
        });

        if (newMaterial) {
          toast.success('Material creado correctamente.');
          queryClient.invalidateQueries({ queryKey: ['materialDetail'] });
          navigate(`/material/${newMaterial.id}`);
        } else {
          throw new Error('No se pudo crear el material.');
        }
      } else {
        // Update existing material
        await updateMaterial(material.id, payload);
        toast.success('Cambios guardados correctamente.');
        queryClient.invalidateQueries({ queryKey: ['materialDetail', id] });
        queryClient.invalidateQueries({ queryKey: ['materialSuppliers', id] });
      }
    } catch (error) {
      console.error('Error saving material changes:', error);
      toast.error('Ocurrió un error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerarOrdenCompra = () => {
    if (!material) return;
    clearCart();
    addItem({
      material_id: material.id,
      material_name: material.name || '',
      quantity: 1,
      unit_price: purchaseStats.lastCost || 0,
      unit: material.unit || 'KG',
      unit_id: selectedUnitId || null,
      is_exempt: selectedCategory === 'FRESCA' ? true : isExempt,
    });
    navigate('/generate-po');
    toast.success('Material agregado a la orden de compra.');
  };

  if (isLoadingMaterial) {
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

  if (!material && !isNew) {
    return (
      <div className="container mx-auto p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="h-12 w-12 text-procarni-primary animate-bounce" />
        <h2 className="text-xl font-bold text-procarni-dark">Ítem no encontrado</h2>
        <p className="text-sm text-gray-500">El ID especificado no corresponde a ningún material en el catálogo.</p>
        <Button onClick={() => navigate('/material-management')} className="bg-procarni-blue hover:bg-procarni-blue/90 text-white rounded-xl active:scale-95 transition-all">
          Volver a Catálogo
        </Button>
      </div>
    );
  }

  const categoryColor = CATEGORY_COLORS[selectedCategory.toUpperCase()] || { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-slate-200' };

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-surface selection:bg-primary-fixed selection:text-on-primary-fixed">
      <div className="container mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">

        {/* Back navigation */}
        <button
          onClick={() => navigate('/material-management')}
          className="group flex items-center gap-2 text-sm font-bold text-procarni-blue hover:text-procarni-primary transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver a Catálogo</span>
        </button>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              {!isNew && (
                <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                  {material.code || 'SIN CÓDIGO'}
                </span>
              )}
              <Badge variant="outline" className={cn('font-bold text-xs border px-2.5 py-0.5', categoryColor.bg, categoryColor.text, categoryColor.border)}>
                {selectedCategory || 'Sin Categoría'}
              </Badge>
              {!isNew && material.status === 'archived' && (
                <Badge variant="outline" className="bg-red-50 text-procarni-primary border-procarni-primary/20 font-bold">
                  Inactivo / Archivado
                </Badge>
              )}
            </div>
            <h1 className="text-[34px] font-black text-procarni-blue tracking-tight leading-tight mt-2">
              {isNew ? 'Añadir Nuevo Material' : (materialName || 'Detalles del Ítem')}
            </h1>
            {!isNew && (
              <p className="text-[13px] text-gray-500 font-medium italic">
                ID de catálogo: {material.id}
              </p>
            )}
          </div>
        </div>

        {/* KPI Bar */}
        {!isNew && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Proveedores Vinculados */}
            <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-emerald-50 text-procarni-secondary">
                    <Truck className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Proveedores Vinculados</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                      {suppliers.length}
                    </span>
                    <span className="text-gray-500 font-bold text-sm uppercase">PROV</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Proveedores que suministran este material
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: Último Costo */}
            <Card className="border-none bg-white/70 backdrop-blur-xl ring-1 ring-white/60 shadow-2xl shadow-gray-200/50 rounded-[2rem] p-1.5 transition-all duration-300 hover:scale-[1.01]">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 rounded-2xl bg-procarni-blue/10 text-procarni-blue">
                    <DollarSign className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Último Costo Registrado</p>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                      ${fmt(purchaseStats.lastCost, 4)}
                    </span>
                    <span className="text-gray-500 font-bold text-sm">USD</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Por unidad registrada: {material.unit || 'KG'}
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
        )}

        {/* Layout Wrapper */}
        <div className="grid grid-cols-12 gap-8">

          {/* Central Configuration Section */}
          <div className="col-span-12 lg:col-span-9 space-y-8">
            <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-8 rounded-[2rem] shadow-2xl shadow-gray-200/50">
              <div className="flex items-center gap-3 mb-6 pb-3 border-b border-slate-100">
                <Settings className="h-5 w-5 text-procarni-primary" />
                <h3 className="font-extrabold text-lg text-procarni-dark tracking-tight">Ficha y Configuración del Ítem</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                <div className="space-y-5">
                  {selectedCategory === 'EMPAQUE' && (
                    <div className="space-y-1.5 mb-4">
                      <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nomenclatura Estructurada de Empaque</Label>
                      <Select value={specialStructure} onValueChange={(val: any) => setSpecialStructure(val)}>
                        <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Texto Libre (Sin Estructurar)</SelectItem>
                          <SelectItem value="TRIPAS">Tripas de Empaque</SelectItem>
                          <SelectItem value="BOLSAS_TERMO">Bolsas / Termoformados</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {specialStructure === 'TRIPAS' && selectedCategory === 'EMPAQUE' ? (
                    <div className="space-y-4 p-5 bg-slate-50/40 border border-slate-200/60 rounded-[1.5rem] shadow-inner mb-4">
                      {/* Old Name Guide */}
                      {!isNew && material?.name && (
                        <div className="p-3.5 bg-amber-50/50 border border-amber-200/40 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-amber-800 uppercase tracking-wider text-[9px]">Nombre Anterior (Referencia/Guía)</p>
                          <p className="font-mono text-slate-700 bg-white/80 p-2.5 rounded-lg border border-slate-200/40 break-all select-all font-semibold">
                            {material.name}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Vista Previa del Nombre Consolidado</Label>
                        <div className="p-3.5 bg-slate-900 text-white rounded-xl font-mono text-xs font-bold break-all select-all tracking-tight leading-relaxed">
                          {materialName || 'TRIPAS...'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Tipo de Tripa</Label>
                          <Select value={tripaTipo} onValueChange={setTripaTipo}>
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
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Medida (Ej: 90X300)</Label>
                          <Input
                            placeholder="Ej: 90X300"
                            value={tripaMedida}
                            onChange={(e) => setTripaMedida(e.target.value.toUpperCase().replace(/\*/g, 'X'))}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Color</Label>
                          <Input
                            placeholder="Ej: ROJO, AMARILLO..."
                            value={tripaColor}
                            onChange={(e) => setTripaColor(e.target.value)}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Metros por Caja</Label>
                          <Input
                            placeholder="Ej: 500"
                            value={tripaMetros}
                            onChange={(e) => setTripaMetros(e.target.value)}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Variación (Selección Múltiple)</Label>
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
                  ) : specialStructure === 'BOLSAS_TERMO' && selectedCategory === 'EMPAQUE' ? (
                    <div className="space-y-4 p-5 bg-slate-50/40 border border-slate-200/60 rounded-[1.5rem] shadow-inner mb-4">
                      {/* Old Name Guide */}
                      {!isNew && material?.name && (
                        <div className="p-3.5 bg-amber-50/50 border border-amber-200/40 rounded-xl text-xs space-y-1">
                          <p className="font-bold text-amber-800 uppercase tracking-wider text-[9px]">Nombre Anterior (Referencia/Guía)</p>
                          <p className="font-mono text-slate-700 bg-white/80 p-2.5 rounded-lg border border-slate-200/40 break-all select-all font-semibold">
                            {material.name}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <Label className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">Vista Previa del Nombre Consolidado</Label>
                        <div className="p-3.5 bg-slate-900 text-white rounded-xl font-mono text-xs font-bold break-all select-all tracking-tight leading-relaxed">
                          {materialName || 'BOLSAS / TERMOFORMADO...'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Prefijo</Label>
                          <Select value={btPrefix} onValueChange={setBtPrefix}>
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
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Tipo</Label>
                          <Select value={btTipo} onValueChange={setBtTipo}>
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
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Medida</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Ej: 20X30 o 5"
                              value={btMedidaValor}
                              onChange={(e) => setBtMedidaValor(e.target.value.toUpperCase().replace(/\*/g, 'X'))}
                              className="bg-white border-slate-200 rounded-xl h-10 flex-1 focus:ring-procarni-primary/20"
                            />
                            <Select value={btMedidaUnidad} onValueChange={setBtMedidaUnidad}>
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
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Color / Fondo</Label>
                          <Input
                            placeholder="Ej: TRANSPARENTE, BLANCO..."
                            value={btColor}
                            onChange={(e) => setBtColor(e.target.value)}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Micras (UM)</Label>
                          <Input
                            placeholder="Ej: 70"
                            value={btMicra}
                            onChange={(e) => setBtMicra(e.target.value)}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Uso (Receta/Aplicación)</Label>
                          <Input
                            placeholder="Ej: TOCINETA, REBANADOS..."
                            value={btUso}
                            onChange={(e) => setBtUso(e.target.value)}
                            className="bg-white border-slate-200 rounded-xl h-10 focus:ring-procarni-primary/20"
                          />
                        </div>

                        <div className="space-y-1.5 col-span-2">
                          <Label className="text-[9px] uppercase tracking-wider font-semibold text-gray-500">Variación (Selección Múltiple)</Label>
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
                    <div className="space-y-1.5">
                      <Label htmlFor="materialName" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nombre del Material *</Label>
                      <Input
                        id="materialName"
                        placeholder="Ej: Pollo entero, Carne molida..."
                        value={materialName}
                        onChange={(e) => setMaterialName(e.target.value)}
                        className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Patrón de Oro</Label>

                    {isMasterLocal ? (
                      <div className="flex items-center justify-between p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                        <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                          ⭐ Este ítem es un Patrón de Oro
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 text-[10px] uppercase font-bold text-procarni-primary hover:bg-red-50"
                          onClick={() => {
                            setIsMasterLocal(false);
                            setSelectedParentId('');
                            setSelectedParentName('');
                            setShowSearch(false);
                          }}
                        >
                          Cambiar
                        </Button>
                      </div>
                    ) : selectedParentId ? (
                      <div className="flex items-center justify-between p-3 bg-blue-50/50 border border-blue-200/50 rounded-xl">
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase tracking-widest text-gray-400 font-bold">Vinculado al Patrón</span>
                          <span className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{selectedParentName}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 text-[10px] uppercase font-bold text-procarni-primary hover:bg-red-50"
                          onClick={() => {
                            setSelectedParentId('');
                            setSelectedParentName('');
                            setShowSearch(true);
                          }}
                        >
                          Cambiar
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {!showSearch ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                className="w-full bg-slate-50 hover:bg-slate-100 text-procarni-dark font-bold text-xs py-5 rounded-xl border border-slate-200 active:scale-95 transition-all flex items-center justify-between"
                              >
                                <span>Configurar Patrón de Oro</span>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-xl border-slate-100 bg-white">
                              <DropdownMenuItem
                                onClick={() => {
                                  setIsMasterLocal(true);
                                  setShowSearch(false);
                                }}
                                className="font-bold text-xs py-3 cursor-pointer"
                              >
                                Hacer Patrón de Oro (Ítem Oficial)
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setIsMasterLocal(false);
                                  setShowSearch(true);
                                }}
                                className="font-bold text-xs py-3 cursor-pointer"
                              >
                                Buscar Patrón de Oro Existente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <div className="space-y-2">
                            <SmartSearch
                              placeholder="Buscar patrón de oro..."
                              displayValue={selectedParentName}
                              selectedId={selectedParentId}
                              onSelect={(item) => {
                                setSelectedParentId(item.id);
                                setSelectedParentName(item.name.split(' - ')[0]);
                              }}
                              fetchFunction={async (query) => {
                                const searchTargetName = materialName.trim() || query.trim();

                                const { data, error } = await supabase.rpc('search_master_materials_suggested', {
                                  p_target_name: searchTargetName,
                                  p_search_query: query.trim(),
                                  p_exclude_id: material.id || null
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
                            <Button
                              type="button"
                              variant="ghost"
                              className="text-[10px] text-gray-400 font-bold uppercase tracking-wider h-6 p-0 hover:bg-transparent hover:text-procarni-primary"
                              onClick={() => {
                                setShowSearch(false);
                                setSelectedParentId('');
                                setSelectedParentName('');
                              }}
                            >
                              Cancelar búsqueda
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="nameProvided" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Variación de nombres (Separados por coma)</Label>
                    <Input
                      id="nameProvided"
                      placeholder="Ej: Pechuga Deshuesada, Pollo entero, Suprema"
                      value={nameProvided}
                      onChange={(e) => setNameProvided(e.target.value)}
                      className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20"
                    />
                  </div>

                  {((specialStructure === 'TRIPAS' || specialStructure === 'BOLSAS_TERMO') && selectedCategory === 'EMPAQUE') ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="brand" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca (Opcional)</Label>
                      <Input
                        id="brand"
                        placeholder="Ej: Procarni, Polar..."
                        value={brand}
                        onChange={(e) => setBrand(e.target.value)}
                        className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="color" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Color (Opcional)</Label>
                        <Input
                          id="color"
                          placeholder="Ej: Blanco, Rojo..."
                          value={color}
                          onChange={(e) => setColor(e.target.value)}
                          className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="brand" className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca (Opcional)</Label>
                        <Input
                          id="brand"
                          placeholder="Ej: Procarni, Polar..."
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          className="bg-slate-50/50 border-slate-200 rounded-xl h-11 focus:ring-procarni-primary/20"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Categoría de Material</Label>
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
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad de Medida</Label>
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

                  <div className="flex items-center justify-between p-4 bg-slate-50/70 rounded-2xl border border-slate-100 mt-2">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-procarni-dark">Estado Activo</p>
                      <p className="text-[10px] text-gray-400">Activar o archivar el ítem del catálogo general</p>
                    </div>
                    <Switch
                      checked={isActive}
                      onCheckedChange={setIsActive}
                      className="data-[state=checked]:bg-procarni-primary"
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50/70 rounded-2xl border border-slate-100">
                    <div className="space-y-0.5">
                      <p className="font-bold text-sm text-procarni-dark">Exento de IVA</p>
                      <p className="text-[10px] text-gray-400">Aplica tasa 0% en cálculos de cotización/compra</p>
                    </div>
                    <Switch
                      checked={isExempt}
                      onCheckedChange={setIsExempt}
                      disabled={selectedCategory === 'FRESCA'}
                      className="data-[state=checked]:bg-procarni-primary"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Bottom Grid: Tables */}
            {!isNew && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Proveedores */}
                <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-6 rounded-[2rem] shadow-xl shadow-gray-200/50">
                  <div className="flex justify-between items-center mb-6 pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-procarni-primary" />
                      <h4 className="font-extrabold text-sm text-procarni-dark tracking-tight">Proveedores Habilitados</h4>
                    </div>
                    <Button
                      onClick={handleOpenAddSupplier}
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
                      <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                        <Info className="h-5 w-5 text-gray-400 mb-1" />
                        <p className="text-xs text-gray-400 font-medium">Ningún proveedor habilitado.</p>
                      </div>
                    ) : (
<<<<<<< HEAD
                      suppliers.map((s: any) => (
                        <div
                          key={s.id}
=======
                      suppliers.map((s: any, idx: number) => (
                        <div
                          key={`${s.id}-${idx}`}
>>>>>>> main
                          onClick={() => navigate(`/suppliers/${s.id}`)}
                          className="flex items-center justify-between p-4 bg-white border border-slate-200/80 rounded-2xl hover:border-slate-300 hover:shadow-sm cursor-pointer transition-all"
                        >
                          <div className="space-y-0.5">
                            <p className="font-bold text-xs text-slate-800">{s.name}</p>
                            <p className="text-[10px] text-gray-400">{s.city || 'Ubicación no registrada'}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Ultimos precios de compra */}
                <section className="bg-white/70 backdrop-blur-xl ring-1 ring-white/60 p-6 rounded-[2rem] shadow-xl shadow-gray-200/50">
                  <div className="flex items-center gap-2 mb-6 pb-2 border-b border-slate-100">
                    <DollarSign className="h-5 w-5 text-procarni-primary" />
                    <h4 className="font-extrabold text-sm text-procarni-dark tracking-tight">Últimos Precios de Compra</h4>
                  </div>

                  <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                    {priceHistory.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                        <Info className="h-5 w-5 text-gray-400 mb-1" />
                        <p className="text-xs text-gray-400 font-medium">Sin compras registradas aún.</p>
                      </div>
                    ) : (
                      priceHistory.slice(0, 5).map((ph: any, idx: number) => (
                        <div key={`price-${ph.id || ph.recorded_at}-${idx}`} className="flex justify-between items-center p-4 bg-white border border-slate-200/80 rounded-2xl text-xs">
                          <div>
                            <p className="font-bold text-slate-800 truncate max-w-[150px]">{ph.suppliers?.name || 'Desconocido'}</p>
                            <p className="text-[9px] text-gray-400">
                              Ref: {ph.purchase_orders ? `OC-${new Date(ph.purchase_orders.issue_date).getFullYear()}-${String(ph.purchase_orders.sequence_number).padStart(3, '0')}` : 'Manual'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-procarni-secondary">${fmt(ph.unit_price, 4)}</p>
                            <p className="text-[9px] text-gray-400">{new Date(ph.recorded_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>

          {/* Sticky Action Sidebar */}
          <div className="col-span-12 lg:col-span-3">
            <div className="sticky top-24 space-y-6">
              <div className="bg-procarni-dark rounded-[2rem] p-6 shadow-2xl text-white space-y-6">
                <div className="pb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Acciones de Compra</p>

                  {!isNew ? (
                    <Sheet open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
                      <SheetTrigger asChild>
                        <Button
                          onClick={() => {
                            setActiveHistoryTab('precios');
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
                      <div className="grid grid-cols-2 gap-2 px-1 mt-3 pb-2 border-b border-white/10">
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
                            Historial de Compras del Ítem
                          </SheetTitle>
                          <p className="text-xs text-slate-500 font-medium">Nombre: {materialName}</p>
                        </SheetHeader>
                        <Tabs value={activeHistoryTab} onValueChange={setActiveHistoryTab} className="w-full mt-6">
                          <TabsList className="grid w-full grid-cols-2 bg-slate-100 p-1 rounded-xl">
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

                          {/* Precios Tab */}
                          <TabsContent value="precios" className="space-y-4 mt-4">
                            {/* Filter Controls */}
                            <div className="space-y-4 my-2">
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border shadow-sm">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setFilterPeriod('week');
                                        setStartDate('');
                                        setEndDate('');
                                      }}
                                      className={cn(
                                        "h-7 text-xs px-2.5 rounded-lg transition-all",
                                        filterPeriod === 'week' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white font-bold"
                                      )}
                                    >
                                      Semana
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setFilterPeriod('month');
                                        setStartDate('');
                                        setEndDate('');
                                      }}
                                      className={cn(
                                        "h-7 text-xs px-2.5 rounded-lg transition-all",
                                        filterPeriod === 'month' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white font-bold"
                                      )}
                                    >
                                      Mes
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setFilterPeriod('day');
                                        setStartDate('');
                                        setEndDate('');
                                      }}
                                      className={cn(
                                        "h-7 text-xs px-2.5 rounded-lg transition-all",
                                        filterPeriod === 'day' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white font-bold"
                                      )}
                                    >
                                      Día
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setFilterPeriod('custom');
                                        setStartDate('');
                                        setEndDate('');
                                      }}
                                      className={cn(
                                        "h-7 text-xs px-2.5 rounded-lg transition-all",
                                        filterPeriod === 'custom' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white font-bold"
                                      )}
                                    >
                                      Rango
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setFilterPeriod('all');
                                        setStartDate('');
                                        setEndDate('');
                                      }}
                                      className={cn(
                                        "h-7 text-xs px-2.5 rounded-lg transition-all",
                                        filterPeriod === 'all' && "bg-procarni-blue text-white hover:bg-procarni-blue hover:text-white font-bold"
                                      )}
                                    >
                                      Todos
                                    </Button>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={() => refetchPriceHistory()}
                                    disabled={isFetchingPriceHistory}
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 rounded-xl shrink-0 border-slate-200 text-slate-500 hover:text-procarni-primary"
                                    title="Actualizar datos"
                                  >
                                    <RefreshCw className={cn("h-3.5 w-3.5", isFetchingPriceHistory && "animate-spin")} />
                                  </Button>

                                  <Button
                                    onClick={handleDownloadPriceHistoryPDF}
                                    disabled={filteredPriceHistory.length === 0}
                                    className="h-8 text-xs font-bold bg-procarni-secondary hover:bg-green-700 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    Descargar PDF ({filteredPriceHistory.length})
                                  </Button>
                                </div>
                              </div>

                              {filterPeriod === 'day' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div className="grid grid-cols-1 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Seleccionar Día</label>
                                      <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                          type="date"
                                          value={startDate}
                                          onChange={(e) => setStartDate(e.target.value)}
                                          className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-procarni-primary/20"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  {startDate && (
                                    <div className="flex justify-end">
                                      <Button
                                        variant="ghost"
                                        onClick={() => setStartDate('')}
                                        className="h-6 text-[10px] text-slate-400 hover:text-procarni-primary hover:bg-slate-100 rounded-lg px-2"
                                      >
                                        Limpiar fecha (Ver todos)
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {filterPeriod === 'custom' && (
                                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-2xl border border-slate-100/50">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Desde</label>
                                      <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                          type="date"
                                          value={startDate}
                                          onChange={(e) => setStartDate(e.target.value)}
                                          className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-procarni-primary/20"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hasta</label>
                                      <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                        <input
                                          type="date"
                                          value={endDate}
                                          onChange={(e) => setEndDate(e.target.value)}
                                          className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-procarni-primary/20"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  {(startDate || endDate) && (
                                    <div className="flex justify-end">
                                      <Button
                                        variant="ghost"
                                        onClick={() => {
                                          setStartDate('');
                                          setEndDate('');
                                        }}
                                        className="h-6 text-[10px] text-slate-400 hover:text-procarni-primary hover:bg-slate-100 rounded-lg px-2"
                                      >
                                        Limpiar fechas (Ver todos)
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {filteredPriceHistory.length === 0 ? (
                              <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-3xl flex flex-col items-center justify-center gap-2 text-slate-400">
                                <FileText className="h-8 w-8 text-slate-300 animate-pulse" />
                                <p className="text-xs font-bold text-slate-600">No se encontraron registros</p>
                                <p className="text-[10px] max-w-xs px-4">No hay precios registrados en el periodo seleccionado.</p>
                              </div>
                            ) : (
                              <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[50vh] overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                      <th className="text-[10px] uppercase font-bold text-slate-500 py-3 px-4">Fecha</th>
                                      <th className="text-[10px] uppercase font-bold text-slate-500 py-3 px-2">Proveedor</th>
                                      <th className="text-[10px] uppercase font-bold text-slate-500 py-3 px-2">Referencia</th>
                                      <th className="text-[10px] uppercase font-bold text-slate-500 py-3 px-4 text-right">Precio</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-xs">
                                    {filteredPriceHistory.map((ph: any, idx: number) => {
                                      const po = ph.purchase_orders;
                                      const year = po?.issue_date ? new Date(po.issue_date).getFullYear() : new Date(ph.recorded_at).getFullYear();
                                      const month = po?.issue_date ? String(new Date(po.issue_date).getMonth() + 1).padStart(2, '0') : String(new Date(ph.recorded_at).getMonth() + 1).padStart(2, '0');
                                      const displayId = po ? `OC-${year}-${month}-${String(po.sequence_number || 0).padStart(3, '0')}` : (ph.reference_doc || 'Manual');
                                      return (
                                        <tr key={`history-${ph.id || ph.recorded_at}-${idx}`} className="hover:bg-slate-50/30 transition-colors">
                                          <td className="py-3 px-4 text-slate-500 font-mono">
                                            {new Date(ph.recorded_at).toLocaleDateString()}
                                          </td>
                                          <td className="py-3 px-2 font-bold text-slate-800 truncate max-w-[150px]" title={ph.suppliers?.name}>
                                            {ph.suppliers?.name || 'Desconocido'}
                                          </td>
                                          <td className="py-3 px-2">
                                            {po ? (
                                              <span
                                                onClick={() => navigate(`/purchase-orders/${po.id}`)}
                                                className="text-procarni-blue hover:underline cursor-pointer font-bold"
                                              >
                                                {displayId}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400 font-medium">{displayId}</span>
                                            )}
                                          </td>
                                          <td className="py-3 px-4 text-right font-mono">
                                            <span className="font-extrabold text-procarni-secondary">${fmt(ph.unit_price, 4)}</span>
                                            <span className="text-[9px] text-slate-400 ml-1">/ {ph.unit || material?.unit || 'KG'}</span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
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
                                {materialPOs.map((item: any, idx: number) => {
                                  const po = item.purchase_orders;
                                  if (!po) return null;
                                  const year = po.issue_date ? new Date(po.issue_date).getFullYear() : new Date().getFullYear();
                                  const month = po.issue_date ? String(new Date(po.issue_date).getMonth() + 1).padStart(2, '0') : '01';
                                  const displayId = `OC-${year}-${month}-${String(po.sequence_number || 0).padStart(3, '0')}`;
                                  return (
                                    <div
                                      key={`po-item-${item.id}-${idx}`}
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
                                        <p className="font-bold text-slate-800 text-sm">{fmt(item.quantity, 2)} {material?.unit || 'KG'}</p>
                                        <p className="text-[10px] text-slate-500 font-bold">${fmt(item.unit_price, 4)} / {material?.unit || 'KG'}</p>
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
                  ) : (
                    <div className="p-4 text-center bg-white/5 rounded-xl border border-dashed border-white/10 text-xs text-slate-300 italic">
                      Guarda el material para ver su historial
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  <Button
                    disabled={isSaving}
                    onClick={handleSaveChanges}
                    className="w-full bg-procarni-primary hover:bg-procarni-primary/95 text-white py-6 rounded-2xl font-bold shadow-lg shadow-procarni-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? (isNew ? 'Creando...' : 'Guardando...') : (isNew ? 'Crear Material' : 'Guardar Cambios')}
                  </Button>

                  {!isNew && (
                    <Button
                      onClick={handleGenerarOrdenCompra}
                      className="w-full bg-white text-procarni-dark hover:bg-slate-50 py-6 rounded-2xl font-bold hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 text-xs border border-slate-200"
                    >
                      <ShoppingCart className="h-4 w-4 text-procarni-primary" />
                      Generar Orden Compra
                    </Button>
                  )}
                </div>
              </div>

              {/* Audit Card */}
              {!isNew && (
                <div className="p-6 bg-white/70 backdrop-blur-xl ring-1 ring-white/60 rounded-[2rem] border border-dashed border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-2 text-gray-400 mb-2">
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Auditoría</span>
                  </div>
                  <p className="text-[11px] text-gray-500 font-medium italic leading-relaxed">
                    Creado: {new Date(material.created_at).toLocaleDateString()}<br />
                    Última actualización: {material.updated_at ? new Date(material.updated_at).toLocaleDateString() : '—'}
                  </p>
                </div>
              )}
            </div>
          </div>

      <Dialog open={isAddSupplierOpen} onOpenChange={setIsAddSupplierOpen}>
        <DialogContent className="max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <DialogHeader className="pb-4 border-b border-slate-100">
            <DialogTitle className="text-lg font-black text-procarni-blue tracking-tight">
              Asociar Proveedores
            </DialogTitle>
            <p className="text-xs text-gray-500 font-medium">
              Vincule múltiples proveedores a este material para habilitar cotizaciones.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* Associated Suppliers (Always visible at top so they can be deselected) */}
            {suppliers.length > 0 && (
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Habilitados Actualmente ({suppliers.length})</p>
                <div className="space-y-1.5">
                  {suppliers.map((s) => {
                    const isChecked = selectedSupplierIds.includes(s.id);
                    return (
                      <div
                        key={`assoc-${s.id}`}
                        onClick={() => {
                          if (isChecked) {
                            setSelectedSupplierIds(selectedSupplierIds.filter(id => id !== s.id));
                          } else {
                            setSelectedSupplierIds([...selectedSupplierIds, s.id]);
                          }
                        }}
                        className={cn(
                          "flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border",
                          isChecked 
                            ? "bg-emerald-50/20 border-emerald-200/50" 
                            : "bg-slate-50/50 border-slate-200/40 opacity-70"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id={`assoc-chk-${s.id}`}
                            checked={isChecked}
                            onCheckedChange={() => {}}
                          />
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-800">{s.name}</p>
                            <p className="text-[9px] text-gray-400">{s.city || 'Sin ciudad'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Buscar otros proveedores</p>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Escriba nombre del proveedor..."
                  className="pl-9 bg-slate-50 border-slate-200 rounded-xl h-10 text-xs focus:ring-procarni-primary/20"
                  value={supplierSearchQuery}
                  onChange={(e) => setSupplierSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {filteredSuppliers.filter(s => !suppliers.some(curr => curr.id === s.id)).length === 0 ? (
                  <p className="text-xs text-gray-400 italic text-center py-4">
                    {supplierSearchQuery.trim() ? "No se encontraron otros proveedores." : "Escriba para buscar y agregar proveedores."}
                  </p>
                ) : (
                  filteredSuppliers
                    .filter(s => !suppliers.some(curr => curr.id === s.id))
                    .map((s) => {
                      const isChecked = selectedSupplierIds.includes(s.id);
                      return (
                        <div
                          key={`search-${s.id}`}
                          onClick={() => {
                            if (isChecked) {
                              setSelectedSupplierIds(selectedSupplierIds.filter(id => id !== s.id));
                            } else {
                              setSelectedSupplierIds([...selectedSupplierIds, s.id]);
                            }
                          }}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border",
                            isChecked 
                              ? "bg-blue-50/30 border-blue-200/50" 
                              : "bg-white border-transparent hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id={`sup-${s.id}`}
                              checked={isChecked}
                              onCheckedChange={() => {}}
                            />
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-slate-800">{s.name}</p>
                              <p className="text-[10px] text-gray-400">{s.city || 'Sin ciudad'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddSupplierOpen(false)}
              className="flex-1 bg-slate-50 hover:bg-slate-100 text-procarni-dark font-bold text-xs py-5 rounded-xl border border-slate-200"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={isAssociating}
              onClick={handleSaveSupplierAssociations}
              className="flex-1 bg-procarni-primary hover:bg-procarni-primary/95 text-white font-bold text-xs py-5 rounded-xl shadow-md"
            >
              {isAssociating ? 'Guardando...' : 'Guardar Asociaciones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </div>
      </div>
    </div>
  );
};

export default MaterialGeneralProfile;
