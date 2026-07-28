import React, { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getAllSuppliers } from '@/integrations/supabase/data';
import { getAllMaterialsWithoutFilters } from '@/integrations/supabase/services';
import { currencyService } from '@/services/currencyService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSession } from '@/components/SessionContextProvider';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { 
  Search, 
  Trash, 
  Plus, 
  Coins, 
  Edit2, 
  Check, 
  X, 
  ChevronDown, 
  ChevronRight, 
  Tag, 
  Award,
  ArrowUpDown,
  Filter,
  FileSpreadsheet,
  FileDown,
  Pin
} from 'lucide-react';
import { Supplier, Material } from '@/integrations/supabase/types';

interface PriceSource {
  price: number;
  currency: 'USD' | 'VES' | 'EUR';
  exchange_rate: number | null;
  date: string;
  type: 'OC' | 'OS' | 'Cotización' | 'Manual';
  label: string;
}

export default function PriceComparisonMatrix() {
  const { role } = useSession();
  const [selectedSuppliers, setSelectedSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [onlyCommonMaterials, setOnlyCommonMaterials] = useState(false);
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [usdRate, setUsdRate] = useState<number>(1);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [editingCell, setEditingCell] = useState<{ materialId: string; supplierId: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [onlyPinned, setOnlyPinned] = useState(false);
  
  // Custom manual prices map: { [materialId]: { [supplierId]: number } }
  const [customPrices, setCustomPrices] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const saved = localStorage.getItem('procarni_matrix_custom_prices');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Pinned materials list
  const [pinnedMaterials, setPinnedMaterials] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('procarni_matrix_pinned_materials');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Save custom prices to localStorage
  useEffect(() => {
    localStorage.setItem('procarni_matrix_custom_prices', JSON.stringify(customPrices));
  }, [customPrices]);

  // Save pinned materials to localStorage
  useEffect(() => {
    localStorage.setItem('procarni_matrix_pinned_materials', JSON.stringify(pinnedMaterials));
  }, [pinnedMaterials]);

  const togglePinMaterial = (materialId: string) => {
    setPinnedMaterials(prev =>
      prev.includes(materialId) ? prev.filter(id => id !== materialId) : [...prev, materialId]
    );
  };

  // Fetch Exchange Rate
  useEffect(() => {
    async function loadExchangeRate() {
      try {
        const rateObj = await currencyService.getUsdRate();
        const rateValue = rateObj?.promedio || rateObj?.valor || 0;
        if (rateValue > 0) {
          setUsdRate(rateValue);
        }
      } catch (err) {
        console.error('Error fetching exchange rate:', err);
      }
    }
    loadExchangeRate();
  }, []);

  // Query Suppliers
  const { data: allSuppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['matrix-suppliers'],
    queryFn: async () => {
      const suppliers = await getAllSuppliers();
      // Filter raw material suppliers
      return suppliers.filter(s => s.status?.toLowerCase() === 'active' && s.is_raw_material === true);
    }
  });

  // Query Supplier Frequencies (from last 500 purchase orders)
  const { data: supplierFrequencies = {} } = useQuery<Record<string, number>>({
    queryKey: ['matrix-supplier-frequencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('supplier_id')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error fetching supplier frequencies:', error);
        return {};
      }

      const freq: Record<string, number> = {};
      data?.forEach(po => {
        if (po.supplier_id) {
          freq[po.supplier_id] = (freq[po.supplier_id] || 0) + 1;
        }
      });
      return freq;
    }
  });

  // Query Materials
  const { data: allMaterials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['matrix-materials'],
    queryFn: async () => {
      const materials = await getAllMaterialsWithoutFilters();
      return materials.filter(m => m.status === 'active');
    }
  });

  // Get categories from materials (restricted to raw materials)
  const categories = ['SECA', 'FRESCA', 'EMPAQUE'];

  // Fetch prices, quotes, and catalog relations for selected suppliers
  const { data: priceMatrixData = { prices: {}, relations: [] }, isLoading: loadingPrices } = useQuery({
    queryKey: ['matrix-prices', selectedSuppliers.map(s => s.id)],
    enabled: selectedSuppliers.length > 0,
    queryFn: async () => {
      const supplierIds = selectedSuppliers.map(s => s.id);

      // 1. Fetch Price History
      const { data: historyData, error: historyErr } = await supabase
        .from('price_history')
        .select(`
          material_id,
          supplier_id,
          unit_price,
          currency,
          exchange_rate,
          recorded_at,
          purchase_order_id,
          service_order_id,
          purchase_orders (sequence_number),
          service_orders (sequence_number)
        `)
        .in('supplier_id', supplierIds);

      if (historyErr) throw historyErr;

      // 2. Fetch Supplier Quotes
      const { data: quotesData, error: quotesErr } = await supabase
        .from('supplier_quotes')
        .select(`
          material_id,
          supplier_id,
          unit_price,
          currency,
          exchange_rate,
          created_at,
          quote_request_id,
          quote_requests (sequence_number)
        `)
        .in('supplier_id', supplierIds);

      if (quotesErr) throw quotesErr;

      // Combine prices
      const matrix: Record<string, Record<string, PriceSource>> = {};

      interface HistoryItem {
        material_id: string | null;
        supplier_id: string | null;
        unit_price: number;
        currency: 'USD' | 'VES' | 'EUR';
        exchange_rate: number | null;
        recorded_at: string | null;
        purchase_order_id: string | null;
        service_order_id: string | null;
        purchase_orders: { sequence_number: number | null } | null;
        service_orders: { sequence_number: number | null } | null;
      }

      // Process history
      (historyData as unknown as HistoryItem[])?.forEach((item) => {
        const matId = item.material_id;
        const supId = item.supplier_id;
        if (!matId || !supId) return;

        let label = 'Historial';
        let type: 'OC' | 'OS' = 'OC';
        if (item.purchase_order_id && item.purchase_orders) {
          label = `OC #${item.purchase_orders.sequence_number || item.purchase_order_id.substring(0, 4)}`;
          type = 'OC';
        } else if (item.service_order_id && item.service_orders) {
          label = `OS #${item.service_orders.sequence_number || item.service_order_id.substring(0, 4)}`;
          type = 'OS';
        }

        const source: PriceSource = {
          price: Number(item.unit_price),
          currency: item.currency,
          exchange_rate: item.exchange_rate,
          date: item.recorded_at || '',
          type,
          label
        };

        if (!matrix[matId]) matrix[matId] = {};
        const existing = matrix[matId][supId];
        if (!existing || new Date(source.date) > new Date(existing.date)) {
          matrix[matId][supId] = source;
        }
      });

      interface QuoteItem {
        material_id: string | null;
        supplier_id: string | null;
        unit_price: number;
        currency: 'USD' | 'VES' | 'EUR';
        exchange_rate: number | null;
        created_at: string | null;
        quote_request_id: string | null;
        quote_requests: { sequence_number: number | null } | null;
      }

      // Process quotes
      (quotesData as unknown as QuoteItem[])?.forEach((item) => {
        const matId = item.material_id;
        const supId = item.supplier_id;
        if (!matId || !supId) return;

        const seq = item.quote_requests?.sequence_number || '';
        const label = `Cotiz. ${seq ? `#${seq}` : ''}`;
        const source: PriceSource = {
          price: Number(item.unit_price),
          currency: item.currency,
          exchange_rate: item.exchange_rate,
          date: item.created_at || '',
          type: 'Cotización',
          label
        };

        if (!matrix[matId]) matrix[matId] = {};
        const existing = matrix[matId][supId];
        if (!existing || new Date(source.date) > new Date(existing.date)) {
          matrix[matId][supId] = source;
        }
      });

      // 3. Fetch Supplier Materials relations
      const { data: relationsData, error: relationsErr } = await supabase
        .from('supplier_materials')
        .select('material_id, supplier_id')
        .in('supplier_id', supplierIds);

      if (relationsErr) throw relationsErr;

      return {
        prices: matrix,
        relations: relationsData || []
      };
    }
  });

  // Filter suppliers in left sidebar
  const filteredSuppliersList = useMemo(() => {
    if (!allSuppliers) return [];

    const list = allSuppliers.filter(s => {
      if (!s) return false;
      const name = s.name || '';
      const rif = s.rif || '';
      const code = s.code || '';
      const matchSearch = name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                          rif.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                          code.toLowerCase().includes(supplierSearch.toLowerCase());
      const notSelected = !selectedSuppliers || !selectedSuppliers.some(sel => sel && sel.id === s.id);
      return matchSearch && notSelected;
    });

    // If search is empty, sort by frequency (highest first)
    if (!supplierSearch.trim() && supplierFrequencies) {
      return [...list].sort((a, b) => {
        const freqA = supplierFrequencies[a.id] ?? 0;
        const freqB = supplierFrequencies[b.id] ?? 0;
        return freqB - freqA;
      });
    }

    return list;
  }, [allSuppliers, supplierSearch, selectedSuppliers, supplierFrequencies]);

  // Handle Drag & Drop
  const handleDragStart = (e: React.DragEvent, supplier: Supplier) => {
    e.dataTransfer.setData('application/json', JSON.stringify(supplier));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const supplierData = e.dataTransfer.getData('application/json');
      if (supplierData) {
        const supplier: Supplier = JSON.parse(supplierData);
        if (!selectedSuppliers.some(s => s.id === supplier.id)) {
          setSelectedSuppliers(prev => [...prev, supplier]);
          toast.success(`${supplier.name} añadido a la matriz.`);
        }
      }
    } catch (err) {
      console.error('Error parsing dropped supplier:', err);
    }
  };

  const addSupplier = (supplier: Supplier) => {
    if (!selectedSuppliers.some(s => s.id === supplier.id)) {
      setSelectedSuppliers(prev => [...prev, supplier]);
      toast.success(`${supplier.name} añadido a la matriz.`);
    }
  };

  const removeSupplier = (supplierId: string) => {
    setSelectedSuppliers(prev => prev.filter(s => s.id !== supplierId));
  };

  // Convert price to the display currency
  const getDisplayPrice = (source: PriceSource | undefined, customValInUSD: number | undefined) => {
    if (customValInUSD !== undefined) {
      const displayPrice = currency === 'USD' ? customValInUSD : customValInUSD * usdRate;
      return { price: displayPrice, label: 'Manual', type: 'Manual' as const };
    }
    if (!source) return null;

    let priceInUSD = source.price;
    if (source.currency === 'VES') {
      const rate = source.exchange_rate || usdRate;
      priceInUSD = rate > 0 ? source.price / rate : source.price;
    }

    if (currency === 'USD') {
      return { price: priceInUSD, label: source.label, type: source.type };
    } else {
      return { price: priceInUSD * usdRate, label: source.label, type: source.type };
    }
  };

  // Grouping and Filtering Materials
  const processedMaterialsData = useMemo(() => {
    if (selectedSuppliers.length === 0) return [];

    const rawMaterialCategories = ['SECA', 'FRESCA', 'EMPAQUE'];

    // Filter materials by search & category (strictly raw materials associated with selected suppliers)
    const initialFiltered = allMaterials.filter(m => {
      if (!m) return false;
      
      const isPinned = pinnedMaterials.includes(m.id) || (m.base_material_id && pinnedMaterials.includes(m.base_material_id));
      if (onlyPinned && !isPinned) return false;
      
      if (!onlyPinned && isPinned) return true;
      
      const isRawMaterial = m.category && rawMaterialCategories.includes(m.category.toUpperCase());
      if (!isRawMaterial) return false;

      const matchesCategory = selectedCategory === 'all' || (m.category && m.category.toUpperCase() === selectedCategory.toUpperCase());
      if (!matchesCategory) return false;

      const name = m.name || '';
      const code = m.code || '';
      const matchesSearch = name.toLowerCase().includes(materialSearch.toLowerCase()) ||
                            code.toLowerCase().includes(materialSearch.toLowerCase());
      if (!matchesSearch) return false;

      // Check relationship or pricing with selected suppliers
      const supplierIds = selectedSuppliers.map(s => s.id);
      
      const checkSupplierLink = (supId: string) => {
        const hasRelation = priceMatrixData?.relations?.some(r => r.material_id === m.id && r.supplier_id === supId);
        const hasPrice = priceMatrixData?.prices?.[m.id]?.[supId] !== undefined;
        const hasCustom = customPrices?.[m.id]?.[supId] !== undefined;
        return hasRelation || hasPrice || hasCustom;
      };

      if (onlyCommonMaterials) {
        return supplierIds.every(supId => checkSupplierLink(supId));
      } else {
        return supplierIds.some(supId => checkSupplierLink(supId));
      }
    });

    const finalFiltered = initialFiltered;

    // Separate base (groups) and children
    const groupMap: Record<string, { base: Material | null; items: Material[] }> = {};

    finalFiltered.forEach(m => {
      if (m.base_material_id) {
        if (!groupMap[m.base_material_id]) {
          groupMap[m.base_material_id] = { base: null, items: [] };
        }
        groupMap[m.base_material_id].items.push(m);
      } else {
        if (!groupMap[m.id]) {
          groupMap[m.id] = { base: m, items: [] };
        } else {
          groupMap[m.id].base = m;
        }
      }
    });

    // Clean up empty groups or resolve missing base records
    const result: Array<{ base: Material; items: Material[]; isGroup: boolean; isPinned: boolean }> = [];
    Object.keys(groupMap).forEach(key => {
      const g = groupMap[key];
      let baseRecord = g.base;
      if (!baseRecord) {
        // Try to find the base material in the original list
        baseRecord = allMaterials.find(m => m.id === key) || null;
      }
      
      if (baseRecord) {
        const isPinned = pinnedMaterials.includes(baseRecord.id);
        result.push({
          base: baseRecord,
          items: g.items,
          isGroup: g.items.length > 0,
          isPinned
        });
      }
    });

    return result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return a.base.name.localeCompare(b.base.name);
    });
  }, [allMaterials, selectedSuppliers, selectedCategory, materialSearch, onlyCommonMaterials, priceMatrixData, customPrices, pinnedMaterials, onlyPinned]);

  // Find lowest price for a material across selected suppliers
  const getLowestSupplierId = (materialId: string, materialsInGroup: Material[] = []) => {
    if (selectedSuppliers.length < 2) return null;

    let minPriceObj: { price: number; supplierId: string } | null = null;

    // Check for the base material first
    selectedSuppliers.forEach(sup => {
      const rawPrice = priceMatrixData?.prices?.[materialId]?.[sup.id];
      const customVal = customPrices?.[materialId]?.[sup.id];
      const res = getDisplayPrice(rawPrice, customVal);

      if (res) {
        if (!minPriceObj || res.price < minPriceObj.price) {
          minPriceObj = { price: res.price, supplierId: sup.id };
        }
      }
    });

    return minPriceObj ? minPriceObj.supplierId : null;
  };

  const handleCellClick = (materialId: string, supplierId: string, currentVal: number | undefined) => {
    setEditingCell({ materialId, supplierId });
    setEditValue(currentVal !== undefined ? currentVal.toString() : '');
  };

  const saveCustomPrice = () => {
    if (!editingCell) return;
    const { materialId, supplierId } = editingCell;
    const value = parseFloat(editValue);
    const valueInUSD = currency === 'VES' ? (usdRate > 0 ? value / usdRate : value) : value;

    setCustomPrices(prev => {
      const next = { ...prev };
      if (isNaN(value) || value <= 0) {
        if (next[materialId]) {
          delete next[materialId][supplierId];
          if (Object.keys(next[materialId]).length === 0) {
            delete next[materialId];
          }
        }
      } else {
        if (!next[materialId]) next[materialId] = {};
        next[materialId][supplierId] = valueInUSD;
      }
      return next;
    });

    setEditingCell(null);
    toast.success('Precio simulación actualizado.');
  };

  const clearAllCustomPrices = () => {
    setCustomPrices({});
    toast.success('Todos los precios simulados han sido restablecidos.');
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const dateStr = new Date().toLocaleDateString('es-VE');

      // Header (PROCARNI SYSTEM style from CXP reports)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(27, 41, 74); // #1B294A
      doc.text('PROCARNI', 14, 20);

      doc.setFontSize(8);
      doc.setTextColor(136, 10, 10); // #880a0a
      doc.text('SYSTEM', 14, 24);

      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // #0f172a
      doc.text('Matriz Comparativa de Precios - Materia Prima', 280, 18, { align: 'right' });

      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Fecha Emisión: ${dateStr}`, 280, 23, { align: 'right' });

      // Filters summary line (CXP reports style)
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      
      const catStr = selectedCategory === 'all' ? 'Todas las categorías' : `Categoría: ${selectedCategory}`;
      const searchStr = materialSearch.trim() ? `Búsqueda: "${materialSearch}"` : 'Búsqueda: Sin filtro';
      const commonStr = onlyCommonMaterials ? 'Solo en común' : 'Todos los materiales';
      doc.text(`Moneda: ${currency}  |  Tasa BCV: Bs. ${usdRate.toFixed(2)}  |  ${catStr}  |  ${searchStr}  |  ${commonStr}`, 14, 32);

      const headers = ['Material / Grupo', 'U.M.'];
      selectedSuppliers.forEach(sup => {
        headers.push(sup.name);
      });

      const rows: string[][] = [];
      const rowMaterialIds: { id: string; items: Material[] }[] = [];
      processedMaterialsData.forEach(({ base, items, isGroup }) => {
        const baseRow = [
          base.name + (base.code ? ` (${base.code})` : ''),
          base.unit || '-'
        ];
        
        selectedSuppliers.forEach(sup => {
          const rawPrice = priceMatrixData?.prices?.[base.id]?.[sup.id];
          const customVal = customPrices?.[base.id]?.[sup.id];
          const res = getDisplayPrice(rawPrice, customVal);
          if (res) {
            baseRow.push(`${currency === 'USD' ? '$' : 'Bs'} ${res.price.toFixed(2)} (${res.label})`);
          } else {
            baseRow.push('-');
          }
        });
        rows.push(baseRow);
        rowMaterialIds.push({ id: base.id, items });

        if (isGroup && items.length > 0) {
          items.forEach(child => {
            const childRow = [
              `    • ${base.name}` + (child.code ? ` (${child.code})` : ''),
              child.unit || '-'
            ];
            selectedSuppliers.forEach(sup => {
              const rawPrice = priceMatrixData?.prices?.[child.id]?.[sup.id];
              const customVal = customPrices?.[child.id]?.[sup.id];
              const res = getDisplayPrice(rawPrice, customVal);
              if (res) {
                childRow.push(`${currency === 'USD' ? '$' : 'Bs'} ${res.price.toFixed(2)} (${res.label})`);
              } else {
                childRow.push('-');
              }
            });
            rows.push(childRow);
            rowMaterialIds.push({ id: child.id, items: [] });
          });
        }
      });

      // Plain style table configuration from CXP reports
      autoTable(doc, {
        startY: 38,
        head: [headers],
        body: rows,
        theme: 'plain',
        headStyles: {
          fillColor: [248, 250, 252],
          textColor: [71, 85, 105],
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: { bottom: 1.5 },
          lineColor: [203, 213, 225],
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
          lineWidth: { bottom: 0.5 },
          lineColor: [226, 232, 240],
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255],
        },
        styles: {
          cellPadding: 2.5,
        },
        columnStyles: {
          0: { cellWidth: 75, fontStyle: 'bold', textColor: [27, 41, 74] }, // Procarni blue
          1: { cellWidth: 15, halign: 'center' }
        },
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index < 2) return;

          const rowData = rowMaterialIds[data.row.index];
          if (!rowData) return;

          const supplierIndex = data.column.index - 2;
          const supplier = selectedSuppliers[supplierIndex];
          if (!supplier) return;

          const lowestSupId = getLowestSupplierId(rowData.id, rowData.items);
          if (lowestSupId === supplier.id) {
            data.cell.styles.fillColor = [209, 250, 229]; // light green bg (emerald-100)
            data.cell.styles.textColor = [6, 95, 70]; // emerald-800
            data.cell.styles.fontStyle = 'bold';
          }
        }
      });

      // Add page numbers in a loop over all generated pages (CXP reports style)
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        
        // Print page X of Y at the bottom right corner (Landscape height: 210, width: 297)
        doc.text(`Página ${i} de ${pageCount}`, 280, 202, { align: 'right' });
        
        // Print report footer at the bottom left corner
        doc.text('PROCARNI SYSTEM - Reporte de Comparativa de Precios', 14, 202);
      }

      doc.save(`comparativa-precios-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Reporte PDF descargado con éxito.');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Ocurrió un error al generar el reporte PDF.');
    }
  };

  const exportToExcel = () => {
    if (role !== 'admin') {
      toast.error('Acceso denegado: Solo los administradores pueden descargar reportes en Excel.');
      return;
    }

    try {
      const data: Record<string, string | number>[] = [];
      processedMaterialsData.forEach(({ base, items, isGroup }) => {
        const lowestBaseSupId = getLowestSupplierId(base.id, items);
        const baseRow: Record<string, string | number> = {
          'Código': base.code || '',
          'Material / Grupo': base.name,
          'Categoría': base.category || '',
          'U.M.': base.unit || '-'
        };
        
        selectedSuppliers.forEach(sup => {
          const rawPrice = priceMatrixData?.prices?.[base.id]?.[sup.id];
          const customVal = customPrices?.[base.id]?.[sup.id];
          const res = getDisplayPrice(rawPrice, customVal);
          const isLowest = lowestBaseSupId === sup.id;
          
          baseRow[`${sup.name} (${currency})`] = res ? res.price : '';
          baseRow[`${sup.name} (Origen)`] = res ? (isLowest ? `${res.label} (MÍNIMO)` : res.label) : '-';
        });
        data.push(baseRow);

        if (isGroup && items.length > 0) {
          items.forEach(child => {
            const lowestChildSupId = getLowestSupplierId(child.id);
            const childRow: Record<string, string | number> = {
              'Código': child.code || '',
              'Material / Grupo': `    • ${base.name}`,
              'Categoría': child.category || '',
              'U.M.': child.unit || '-'
            };
            selectedSuppliers.forEach(sup => {
              const rawPrice = priceMatrixData?.prices?.[child.id]?.[sup.id];
              const customVal = customPrices?.[child.id]?.[sup.id];
              const res = getDisplayPrice(rawPrice, customVal);
              const isLowest = lowestChildSupId === sup.id;
              
              childRow[`${sup.name} (${currency})`] = res ? res.price : '';
              childRow[`${sup.name} (Origen)`] = res ? (isLowest ? `${res.label} (MÍNIMO)` : res.label) : '-';
            });
            data.push(childRow);
          });
        }
      });

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparativa');
      
      XLSX.writeFile(workbook, `comparativa-precios-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Reporte Excel descargado con éxito.');
    } catch (error) {
      console.error('Error generating Excel:', error);
      toast.error('Ocurrió un error al generar el reporte Excel.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in-50 duration-300">
      
      {/* Sección Superior: Selección de Proveedores */}
      <Card className="lg:col-span-4 bg-white/70 backdrop-blur-xl border border-white/20 shadow-2xl shadow-gray-200/50 rounded-3xl overflow-hidden flex flex-col">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-md font-bold text-gray-800 flex items-center gap-2">
              <Filter className="w-4 h-4 text-procarni-primary" />
              Proveedores para Comparar
            </CardTitle>
            <CardDescription className="text-xs">
              Busca y añade proveedores para comparar sus precios.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar proveedor..."
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-white/50 border-gray-200 focus:ring-procarni-primary/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-5 flex flex-col gap-4">
          {/* Active selection row */}
          {selectedSuppliers.length > 0 && (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Seleccionados ({selectedSuppliers.length}):</span>
              {selectedSuppliers.map((sup) => (
                <Badge 
                  key={sup.id} 
                  variant="secondary" 
                  className="pl-3 pr-1 py-1 rounded-xl bg-blue-50 text-procarni-blue border border-blue-100 flex items-center gap-1.5 text-xs font-bold shadow-sm"
                >
                  <span>{sup.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeSupplier(sup.id)}
                    className="h-5 w-5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 p-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </Badge>
              ))}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setSelectedSuppliers([])}
                className="text-xs text-red-600 hover:bg-red-50 rounded-xl px-3"
              >
                Limpiar Todos
              </Button>
            </div>
          )}
          
          {/* Horizontal scrollable row of available suppliers */}
          <ScrollArea className="w-full whitespace-nowrap border border-gray-100 rounded-2xl bg-gray-50/30 p-3">
            <div className="flex space-x-3 pb-2 overflow-x-auto">
              {loadingSuppliers ? (
                <div className="text-center text-xs text-gray-500 py-2 w-full">Cargando proveedores...</div>
              ) : filteredSuppliersList.length === 0 ? (
                <div className="text-center text-xs text-gray-500 py-2 w-full">No se encontraron proveedores.</div>
              ) : (
                filteredSuppliersList.map((sup) => {
                  const isAlreadySelected = selectedSuppliers.some(s => s.id === sup.id);
                  if (isAlreadySelected) return null;
                  const freq = supplierFrequencies[sup.id] || 0;
                  return (
                    <div
                      key={sup.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, sup)}
                      onClick={() => addSupplier(sup)}
                      className="inline-flex items-center gap-3 p-3 bg-white border border-gray-150 rounded-2xl shadow-sm hover:border-procarni-primary/30 hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing select-none shrink-0"
                    >
                      <div className="text-left">
                        <p className="text-xs font-bold text-gray-800 truncate max-w-[180px] leading-tight">{sup.name}</p>
                        <p className="text-[9px] text-gray-400 font-semibold mt-0.5">
                          {sup.rif || 'Sin RIF'} {freq > 0 ? `• ${freq} OCs` : ''}
                        </p>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
 
      {/* Panel Derecho: Matriz Comparativa (Ahora de Ancho Completo) */}
      <Card 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="lg:col-span-4 bg-white/70 backdrop-blur-xl border border-white/20 shadow-2xl shadow-gray-200/50 rounded-3xl overflow-hidden flex flex-col h-[880px]"
      >
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Coins className="w-5 h-5 text-procarni-primary" />
              Matriz Comparativa de Precios
            </CardTitle>
            <CardDescription className="text-xs italic text-gray-500">
              Visualiza y compara la tendencia y precios de los materiales compartidos.
            </CardDescription>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Filtro de Materiales Pineados (Al lado izquierdo del convertidor) */}
            <Button
              variant={onlyPinned ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyPinned(prev => !prev)}
              className={cn(
                "h-9 px-3 rounded-2xl text-xs font-bold shadow-sm flex items-center gap-1.5",
                onlyPinned 
                  ? "bg-procarni-primary text-white hover:bg-procarni-primary/95" 
                  : "bg-white text-gray-500 border-gray-200 hover:text-procarni-primary hover:bg-gray-50"
              )}
              title={onlyPinned ? "Mostrando solo materiales pineados" : "Mostrar solo materiales pineados"}
            >
              <Pin className={cn("w-3.5 h-3.5", onlyPinned && "fill-current")} />
              <span>{onlyPinned ? "Pineados" : "Todos"}</span>
            </Button>

            {/* Convertidor de Divisas */}
            <div className="flex items-center gap-2">
              <div className="flex items-center space-x-2 bg-white px-3 h-9 rounded-2xl border border-gray-200 shadow-sm">
                <Label htmlFor="currency-toggle" className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Moneda: {currency}
                </Label>
                <Switch
                  id="currency-toggle"
                  checked={currency === 'VES'}
                  onCheckedChange={(checked) => setCurrency(checked ? 'VES' : 'USD')}
                />
              </div>
              <span className="text-[10px] text-gray-400 italic font-medium hidden md:inline" title={`Tasa oficial BCV de referencia: Bs. ${usdRate > 0 ? usdRate.toFixed(2) : '...'}`}>
                BCV: Bs. {usdRate > 0 ? usdRate.toFixed(2) : '...'}
              </span>
            </div>

            {/* Restablecer Simulación */}
            {Object.keys(customPrices).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearAllCustomPrices}
                className="h-9 px-3 rounded-2xl text-xs font-bold text-gray-500 hover:text-red-600 border-gray-200 shadow-sm bg-white"
              >
                Limpiar Simulación
              </Button>
            )}

            {selectedSuppliers.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToPDF}
                  className="h-9 px-3 rounded-2xl text-xs font-bold text-gray-600 border-gray-200 shadow-sm bg-white hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4 text-red-600 animate-pulse" />
                  Descargar PDF
                </Button>

                {role === 'admin' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportToExcel}
                    className="h-9 px-3 rounded-2xl text-xs font-bold text-gray-600 border-gray-200 shadow-sm bg-white hover:bg-gray-50 flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Exportar Excel
                  </Button>
                )}
              </>
            )}
          </div>
        </CardHeader>

        {/* Filtros de la Matriz */}
        <div className="p-4 border-b border-gray-100 bg-gray-50/20 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar materia prima..."
              value={materialSearch}
              onChange={(e) => setMaterialSearch(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-white border-gray-200"
            />
          </div>
          
          <div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-9 text-xs rounded-xl bg-white border-gray-200">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 justify-end">
            <Switch
              id="common-materials-toggle"
              checked={onlyCommonMaterials}
              onCheckedChange={setOnlyCommonMaterials}
            />
            <Label htmlFor="common-materials-toggle" className="text-xs font-bold text-gray-500 uppercase tracking-widest cursor-pointer">
              En Común
            </Label>
          </div>
        </div>

        {/* Contenido de la Tabla */}
        <div className="flex-1 overflow-auto flex flex-col">
          {selectedSuppliers.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-8 bg-gray-50/10 min-h-[400px]">
              <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-3xl flex items-center justify-center text-gray-400 mb-4 animate-pulse">
                <Plus className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-700">Ningún proveedor seleccionado</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
                Arrastra o añade proveedores desde el panel izquierdo para comenzar la comparativa.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[18%] min-w-[160px] text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    Material / Grupo
                  </TableHead>
                  <TableHead className="w-[8%] text-[10px] uppercase font-bold text-gray-400 tracking-wider text-center">
                    U.M.
                  </TableHead>
                  {selectedSuppliers.map(sup => (
                    <TableHead key={sup.id} className="text-[10px] uppercase font-bold text-gray-400 tracking-wider text-center group min-w-[140px]">
                      <div className="flex items-center justify-center gap-2">
                        <span className="truncate max-w-[120px]" title={sup.name}>{sup.name}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeSupplier(sup.id)}
                          className="h-5 w-5 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {loadingMaterials || loadingPrices ? (
                  <TableRow>
                    <TableCell colSpan={selectedSuppliers.length + 2} className="text-center py-12 text-xs text-gray-500">
                      Cargando datos comparativos...
                    </TableCell>
                  </TableRow>
                ) : processedMaterialsData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={selectedSuppliers.length + 2} className="text-center py-12 text-xs text-gray-500">
                      No se encontraron materiales coincidentes con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  processedMaterialsData.map(({ base, items, isGroup }) => {
                    const isExpanded = !!expandedGroups[base.id];
                    const lowestSupplierId = getLowestSupplierId(base.id, items);

                    return (
                      <React.Fragment key={base.id}>
                        {/* Fila Principal (Base) */}
                        <TableRow className="hover:bg-blue-50/20 group border-b border-gray-100">
                          <TableCell className="font-medium text-xs text-procarni-dark py-4 flex items-center gap-2 w-[160px] max-w-[160px] min-w-[160px] whitespace-normal break-words">
                            {isGroup && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 rounded-md text-gray-400 hover:text-procarni-primary"
                                onClick={() => setExpandedGroups(prev => ({ ...prev, [base.id]: !prev[base.id] }))}
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </Button>
                            )}

                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => togglePinMaterial(base.id)}
                              className={`h-5 w-5 rounded-md transition-all duration-200 shrink-0 ${
                                pinnedMaterials.includes(base.id)
                                  ? 'text-procarni-primary opacity-100 scale-110'
                                  : 'text-gray-400 opacity-0 group-hover:opacity-100'
                              }`}
                              title={pinnedMaterials.includes(base.id) ? "Desanclar material" : "Anclar material"}
                            >
                              <Pin className={`w-3.5 h-3.5 ${pinnedMaterials.includes(base.id) ? 'fill-current' : ''}`} />
                            </Button>
                            
                            <div className="flex flex-col min-w-0 flex-1">
                              <span className="font-bold text-gray-900 leading-tight whitespace-normal break-words" title={base.name}>{base.name}</span>
                              <span className="text-[9px] text-gray-400 tracking-wider uppercase font-semibold">{base.code || 'SIN CÓDIGO'}</span>
                            </div>
                          </TableCell>
                          
                          <TableCell className="text-center text-xs text-gray-500">
                            {base.unit || '-'}
                          </TableCell>

                          {/* Columnas de precios para el material base */}
                          {selectedSuppliers.map(sup => {
                            const rawPrice = priceMatrixData?.prices?.[base.id]?.[sup.id];
                            const customVal = customPrices?.[base.id]?.[sup.id];
                            const res = getDisplayPrice(rawPrice, customVal);
                            const isCheapest = lowestSupplierId === sup.id;
                            const isEditing = editingCell?.materialId === base.id && editingCell?.supplierId === sup.id;

                            return (
                              <TableCell
                                key={sup.id}
                                className={`text-center py-2 transition-all relative ${
                                  isCheapest ? 'bg-emerald-50/30' : ''
                                }`}
                              >
                                {isEditing ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-7 w-20 text-xs text-center rounded-lg border-gray-300"
                                      autoFocus
                                    />
                                    <Button size="icon" onClick={saveCustomPrice} className="h-7 w-7 rounded-lg bg-emerald-600 hover:bg-emerald-700">
                                      <Check className="w-3.5 h-3.5 text-white" />
                                    </Button>
                                    <Button size="icon" variant="outline" onClick={() => setEditingCell(null)} className="h-7 w-7 rounded-lg border-gray-200">
                                      <X className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div 
                                    onClick={() => handleCellClick(base.id, sup.id, customVal)}
                                    className="cursor-pointer hover:bg-gray-100/50 p-2 rounded-xl transition-all flex flex-col items-center justify-center min-h-[44px]"
                                  >
                                    {res ? (
                                      <>
                                        <div className="flex items-center gap-1">
                                          {isCheapest && <Award className="w-3.5 h-3.5 text-emerald-600 fill-emerald-100" />}
                                          <span className={`text-xs font-mono font-bold tracking-tight ${
                                            isCheapest ? 'text-emerald-700' : 'text-gray-800'
                                          }`}>
                                            {currency === 'USD' ? '$' : 'Bs'}{res.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                        
                                        {/* Origen del precio */}
                                        <Badge 
                                          variant="outline" 
                                          className={`text-[8px] px-1 py-0 h-4 mt-1 font-semibold ${
                                            res.type === 'Manual' 
                                              ? 'bg-amber-50 text-amber-700 border-amber-300' 
                                              : res.type === 'Cotización' 
                                                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                                                : 'bg-gray-50 text-gray-500 border-gray-200'
                                          }`}
                                        >
                                          {res.label}
                                        </Badge>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-gray-300 italic group-hover:text-gray-400">
                                        Ingresar
                                      </span>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>

                        {/* Filas Hijas (si el grupo está expandido) */}
                        {isGroup && isExpanded && items.map(child => {
                          const childLowestSupplierId = getLowestSupplierId(child.id);
                          return (
                            <TableRow key={child.id} className="bg-gray-50/30 hover:bg-blue-50/10 border-b border-gray-100/50">
                              <TableCell className="pl-10 text-xs py-3 w-[160px] max-w-[160px] min-w-[160px] whitespace-normal break-words">
                                <div className="flex flex-col min-w-0 border-l-2 border-gray-200 pl-3">
                                  <span className="font-semibold text-gray-700 leading-tight whitespace-normal break-words" title={child.name}>{child.name}</span>
                                  <span className="text-[9px] text-gray-400 font-semibold">{child.code || 'SIN CÓDIGO'}</span>
                                </div>
                              </TableCell>
                              
                              <TableCell className="text-center text-xs text-gray-400">
                                {child.unit || '-'}
                              </TableCell>

                              {/* Columnas de precios para el hijo */}
                              {selectedSuppliers.map(sup => {
                                 const rawPrice = priceMatrixData?.prices?.[child.id]?.[sup.id];
                                 const customVal = customPrices?.[child.id]?.[sup.id];
                                 const res = getDisplayPrice(rawPrice, customVal);
                                const isCheapest = childLowestSupplierId === sup.id;
                                const isEditing = editingCell?.materialId === child.id && editingCell?.supplierId === sup.id;

                                return (
                                  <TableCell
                                    key={sup.id}
                                    className={`text-center py-1 transition-all ${
                                      isCheapest ? 'bg-emerald-50/20' : ''
                                    }`}
                                  >
                                    {isEditing ? (
                                      <div className="flex items-center justify-center gap-1">
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editValue}
                                          onChange={(e) => setEditValue(e.target.value)}
                                          className="h-6 w-16 text-[11px] text-center rounded-lg border-gray-300"
                                          autoFocus
                                        />
                                        <Button size="icon" onClick={saveCustomPrice} className="h-6 w-6 rounded-lg bg-emerald-600 hover:bg-emerald-700">
                                          <Check className="w-3 h-3 text-white" />
                                        </Button>
                                        <Button size="icon" variant="outline" onClick={() => setEditingCell(null)} className="h-6 w-6 rounded-lg border-gray-200">
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <div 
                                        onClick={() => handleCellClick(child.id, sup.id, customVal)}
                                        className="cursor-pointer hover:bg-gray-100/50 p-1.5 rounded-lg transition-all flex flex-col items-center justify-center min-h-[38px]"
                                      >
                                        {res ? (
                                          <>
                                            <span className={`text-[11px] font-mono font-bold tracking-tight ${
                                              isCheapest ? 'text-emerald-700' : 'text-gray-600'
                                            }`}>
                                              {currency === 'USD' ? '$' : 'Bs'}{res.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[7px] text-gray-400 font-semibold mt-0.5">
                                              {res.label}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="text-[9px] text-gray-300 italic">
                                            -
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
