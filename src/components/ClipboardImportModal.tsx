import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { searchMaterialsBySupplier, searchMaterials, getAllUnits } from '@/integrations/supabase/data';
import { ClipboardPaste, FileSpreadsheet, Check, Trash2, HelpCircle, Loader2, ShoppingCart, ArrowRight, Search, ChevronsUpDown, Star, Sparkles } from 'lucide-react';
import { UnitOfMeasure } from '@/integrations/supabase/services/unitService';
import { BatchItemForm, filterUnitsForCategory } from './MaterialCatalogBatchModal';

interface ClipboardImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId?: string;
  supplierName?: string;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  onInsertItems: (items: BatchItemForm[]) => void;
}

interface ParsedLine {
  id: string;
  originalText: string;
  rawMaterialName: string;
  quantity: number;
  unitName: string;
  unitPrice: number;
  matchedMaterial: any | null;
  status: 'matched' | 'partial' | 'unmatched';
}

const UNIT_PATTERNS: { [key: string]: RegExp } = {
  KG: /\b(kg|kgs|kilo|kilos|kilogramo|kilogramos)\b/i,
  LT: /\b(lt|lts|litro|litros)\b/i,
  UND: /\b(und|unds|unid|unids|unidad|unidades|pza|pzas|pz|pieza|piezas)\b/i,
  MT: /\b(mt|mts|metro|metros)\b/i,
  GR: /\b(gr|grs|gramo|gramos)\b/i,
  CAJA: /\b(caja|cajas|cja|cjas)\b/i,
  PQTE: /\b(paquete|paquetes|pqte|pqtes|pack)\b/i,
};

const normalizeText = (str: string) => {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// Searchable Combobox for selecting material in each row with accent-insensitive multi-word search
const SearchableMaterialSelect: React.FC<{
  selectedMaterial: any | null;
  onSelect: (material: any) => void;
  availableMaterials: any[];
  placeholder?: string;
  isMatched: boolean;
}> = ({ selectedMaterial, onSelect, availableMaterials, placeholder = "Buscar material...", isMatched }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    let list = availableMaterials;

    if (categoryFilter !== 'ALL') {
      list = list.filter((m: any) => m.category && m.category.toUpperCase() === categoryFilter.toUpperCase());
    }

    if (!search.trim()) {
      return list.slice(0, 200);
    }

    const queryNormalized = normalizeText(search);
    const words = queryNormalized.split(/\s+/).filter(Boolean);

    const matches = list.filter((m: any) => {
      const normName = normalizeText(m.name || '');
      const normCode = normalizeText(m.code || '');
      const normCategory = normalizeText(m.category || '');
      const aliases = (m.search_aliases || []).map((a: string) => normalizeText(a));

      return words.every((word) =>
        normName.includes(word) ||
        normCode.includes(word) ||
        normCategory.includes(word) ||
        aliases.some((a: string) => a.includes(word))
      );
    });

    return matches.slice(0, 200);
  }, [availableMaterials, search, categoryFilter]);

  // Split into suggested/associated vs others
  const { associatedList, othersList } = useMemo(() => {
    const assoc: any[] = [];
    const others: any[] = [];

    filtered.forEach((m: any) => {
      if (m.isSupplierAssociated) {
        assoc.push(m);
      } else {
        others.push(m);
      }
    });

    return { associatedList: assoc, othersList: others };
  }, [filtered]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between h-9 text-xs rounded-xl px-2.5 font-bold border transition-all text-left ${
            isMatched
              ? 'border-slate-200 text-slate-900 bg-slate-50/50 hover:bg-slate-100/80 hover:border-slate-300'
              : 'border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100/80 ring-1 ring-amber-200'
          }`}
        >
          <span className="truncate flex-1 pr-1">
            {selectedMaterial ? (
              <span className="flex items-center gap-1.5 truncate">
                <span className="truncate">{selectedMaterial.name}</span>
                {selectedMaterial.code && (
                  <span className="text-[10px] font-mono text-slate-400 font-normal">
                    ({selectedMaterial.code})
                  </span>
                )}
              </span>
            ) : (
              <span className="text-amber-700 font-medium italic flex items-center gap-1">
                <Search className="h-3 w-3 inline shrink-0" /> {placeholder}
              </span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] sm:w-[460px] p-0 rounded-2xl shadow-2xl border-slate-200 z-[9999]" align="start">
        {/* Search Header */}
        <div className="p-2.5 border-b border-slate-100 bg-slate-50/70 space-y-2">
          <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <Input
              placeholder="Buscar material por nombre, código o alias..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs border-none bg-transparent shadow-none focus-visible:ring-0 p-0"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Filter Pills in Dropdown */}
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[10px]">
            {['ALL', 'SECA', 'FRESCA', 'EMPAQUE', 'EQUIPOS'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-2 py-0.5 rounded-md font-bold transition-all shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat === 'ALL' ? 'TODAS' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-1.5 text-xs space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs space-y-1">
              <p className="font-semibold">No se encontraron materiales</p>
              <p className="text-[11px] text-slate-400">Prueba con otra palabra o elimina los filtros.</p>
            </div>
          ) : (
            <>
              {/* Supplier Associated Section */}
              {associatedList.length > 0 && (
                <div className="space-y-0.5">
                  <div className="px-2 py-1 text-[10px] font-black uppercase text-emerald-800 bg-emerald-50 rounded-lg flex items-center gap-1">
                    <Star className="h-3 w-3 fill-emerald-600 text-emerald-600" />
                    Asociados a este Proveedor ({associatedList.length})
                  </div>
                  {associatedList.map((mat: any) => {
                    const isSelected = selectedMaterial?.id === mat.id;
                    return (
                      <div
                        key={mat.id}
                        onClick={() => {
                          onSelect(mat);
                          setOpen(false);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-procarni-primary/10 text-procarni-primary font-bold'
                            : 'hover:bg-slate-100 text-slate-800 font-medium'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs truncate font-bold text-slate-900">{mat.name}</p>
                          <div className="flex gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            {mat.code && <span>Ref: <strong>{mat.code}</strong></span>}
                            {mat.category && <span className="bg-slate-100 px-1 rounded">{mat.category}</span>}
                            {mat.unit && <span>Ud: {mat.unit}</span>}
                          </div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-procarni-primary" />}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Other Catalog Materials Section */}
              {othersList.length > 0 && (
                <div className="space-y-0.5 pt-1">
                  {associatedList.length > 0 && (
                    <div className="px-2 py-1 text-[10px] font-bold uppercase text-slate-400">
                      Otros Materiales del Catálogo ({othersList.length})
                    </div>
                  )}
                  {othersList.map((mat: any) => {
                    const isSelected = selectedMaterial?.id === mat.id;
                    return (
                      <div
                        key={mat.id}
                        onClick={() => {
                          onSelect(mat);
                          setOpen(false);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-procarni-primary/10 text-procarni-primary font-bold'
                            : 'hover:bg-slate-100 text-slate-800 font-medium'
                        }`}
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs truncate font-bold text-slate-900">{mat.name}</p>
                          <div className="flex gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            {mat.code && <span>Ref: <strong>{mat.code}</strong></span>}
                            {mat.category && <span className="bg-slate-100 px-1 rounded">{mat.category}</span>}
                            {mat.unit && <span>Ud: {mat.unit}</span>}
                          </div>
                        </div>
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-procarni-primary" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info in combobox */}
        <div className="p-2 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500 font-mono text-center">
          Mostrando {filtered.length} de {availableMaterials.length} materiales disponibles
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ClipboardImportModal: React.FC<ClipboardImportModalProps> = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  currency,
  exchangeRate,
  onInsertItems,
}) => {
  const [rawText, setRawText] = useState('');
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'preview'>('input');
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRawText('');
      setParsedLines([]);
      setIsProcessing(false);
      setActiveTab('input');
      setShowExamples(false);
    }
  }, [isOpen]);

  const { data: units = [] } = useQuery<UnitOfMeasure[]>({
    queryKey: ['units_of_measure'],
    queryFn: getAllUnits,
  });

  const { data: supplierMaterials = [] } = useQuery({
    queryKey: ['supplier_batch_materials', supplierId],
    queryFn: () => (supplierId ? searchMaterialsBySupplier(supplierId, '') : Promise.resolve([])),
    enabled: isOpen && !!supplierId,
  });

  const { data: allMaterials = [] } = useQuery({
    queryKey: ['all_batch_materials'],
    queryFn: () => searchMaterials(''),
    enabled: isOpen,
  });

  // Combine and deduplicate materials list
  const combinedAvailableMaterials = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Add supplier materials first (marked as associated)
    supplierMaterials.forEach((m: any) => {
      if (m && m.id) {
        map.set(m.id, { ...m, isSupplierAssociated: true });
      }
    });

    // 2. Add all general catalog materials
    allMaterials.forEach((m: any) => {
      if (m && m.id) {
        const existing = map.get(m.id);
        if (!existing) {
          map.set(m.id, { ...m, isSupplierAssociated: false });
        }
      }
    });

    return Array.from(map.values());
  }, [supplierMaterials, allMaterials]);

  // Smart Line Parser
  const parseRawLines = () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);

    const lines = rawText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    const catalog = combinedAvailableMaterials;
    const supplierIds = new Set(supplierMaterials.map((m: any) => m.id));

    const results: ParsedLine[] = lines.map((line, idx) => {
      let cleaned = line;
      let quantity = 1;
      let unitName = 'KG';
      let unitPrice = 0;
      let rawMaterial = '';

      // 1. Check for Excel Tab-Separated Values (TSV)
      if (line.includes('\t')) {
        const parts = line.split('\t').map(p => p.trim());
        if (parts.length >= 2) {
          const firstIsNum = !isNaN(parseFloat(parts[0].replace(',', '.')));
          if (firstIsNum) {
            quantity = parseFloat(parts[0].replace(',', '.')) || 1;
            rawMaterial = parts[1];
            if (parts.length >= 3 && !isNaN(parseFloat(parts[2].replace(',', '.')))) {
              unitPrice = parseFloat(parts[2].replace(',', '.')) || 0;
            }
          } else {
            rawMaterial = parts[0];
            quantity = parseFloat(parts[1].replace(',', '.')) || 1;
            if (parts.length >= 3 && !isNaN(parseFloat(parts[2].replace(',', '.')))) {
              unitPrice = parseFloat(parts[2].replace(',', '.')) || 0;
            }
          }
        }
      } else {
        // 2. Free Text parsing (WhatsApp / Email format)
        cleaned = cleaned.replace(/^[•\-\*\d+\.\)\s]+/, '').trim();

        // Extract potential trailing price: e.g. "$4.50" or "4.50" or "a 3.80"
        const priceMatch = cleaned.match(/(?:a\s+|\$\s*|USD\s*|VES\s*|precio\s*:?\s*)(\d+([.,]\d+)?)\s*$/i);
        if (priceMatch) {
          unitPrice = parseFloat(priceMatch[1].replace(',', '.')) || 0;
          cleaned = cleaned.substring(0, priceMatch.index).trim();
        }

        // Detect Unit
        for (const [unitKey, regex] of Object.entries(UNIT_PATTERNS)) {
          if (regex.test(cleaned)) {
            unitName = unitKey;
            cleaned = cleaned.replace(regex, ' ').trim();
            break;
          }
        }

        // Detect Quantity (numbers like "10", "15.5", "10,5")
        const leadingQtyMatch = cleaned.match(/^(\d+([.,]\d+)?)\s*/);
        const trailingQtyMatch = cleaned.match(/\s+(\d+([.,]\d+)?)$/);

        if (leadingQtyMatch) {
          quantity = parseFloat(leadingQtyMatch[1].replace(',', '.')) || 1;
          cleaned = cleaned.replace(leadingQtyMatch[0], '').trim();
        } else if (trailingQtyMatch) {
          quantity = parseFloat(trailingQtyMatch[1].replace(',', '.')) || 1;
          cleaned = cleaned.substring(0, trailingQtyMatch.index).trim();
        }

        // Clean leftover conjunctions
        cleaned = cleaned.replace(/^(de|para|x|ud|uds)\s+/i, '').trim();
        rawMaterial = cleaned;
      }

      // 3. Find Best Matching Material from Catalog
      const normalizedQuery = normalizeText(rawMaterial);
      let bestMatch: any = null;
      let highestScore = 0;

      if (normalizedQuery) {
        const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 1);

        catalog.forEach((mat: any) => {
          const normName = normalizeText(mat.name || '');
          const normCode = normalizeText(mat.code || '');
          let score = 0;

          // Exact match
          if (normName === normalizedQuery) score += 100;
          else if (normCode === normalizedQuery) score += 95;
          // Full substring containment
          else if (normName.includes(normalizedQuery)) score += 80;
          else if (normalizedQuery.includes(normName)) score += 75;
          else {
            // Words overlap
            let matchingWords = 0;
            queryWords.forEach(word => {
              if (normName.includes(word)) matchingWords++;
            });
            if (queryWords.length > 0 && matchingWords > 0) {
              score += (matchingWords / queryWords.length) * 60;
            }
          }

          // Alias match
          if (mat.search_aliases && Array.isArray(mat.search_aliases)) {
            mat.search_aliases.forEach((alias: string) => {
              const normAlias = normalizeText(alias);
              if (normAlias === normalizedQuery) score += 90;
              else if (normAlias.includes(normalizedQuery)) score += 70;
            });
          }

          // Supplier priority boost
          if (supplierIds.has(mat.id)) {
            score += 10;
          }

          if (score > highestScore && score >= 40) {
            highestScore = score;
            bestMatch = mat;
          }
        });
      }

      // If matched, verify default unit if not explicitly parsed
      if (bestMatch && !line.match(/\b(kg|lt|und|mt|gr|caja)\b/i)) {
        if (bestMatch.unit) unitName = bestMatch.unit;
      }

      return {
        id: `line-${idx}-${Date.now()}`,
        originalText: line,
        rawMaterialName: rawMaterial || line,
        quantity: quantity > 0 ? quantity : 1,
        unitName: unitName.toUpperCase(),
        unitPrice,
        matchedMaterial: bestMatch,
        status: bestMatch ? (highestScore >= 80 ? 'matched' : 'partial') : 'unmatched',
      };
    });

    setParsedLines(results);
    setIsProcessing(false);
    setActiveTab('preview');
  };

  const handleUpdateLine = (id: string, updates: Partial<ParsedLine>) => {
    setParsedLines(prev =>
      prev.map(l => (l.id === id ? { ...l, ...updates } : l))
    );
  };

  const handleSelectMaterialForLine = (lineId: string, material: any) => {
    if (material) {
      setParsedLines(prev =>
        prev.map(l => {
          if (l.id === lineId) {
            return {
              ...l,
              matchedMaterial: material,
              unitName: material.unit || l.unitName,
              status: 'matched',
            };
          }
          return l;
        })
      );
    }
  };

  const handleDeleteLine = (id: string) => {
    setParsedLines(prev => prev.filter(l => l.id !== id));
  };

  const handleConfirmInsert = () => {
    const validItems: BatchItemForm[] = [];

    parsedLines.forEach(l => {
      if (l.matchedMaterial && l.quantity > 0) {
        const mat = l.matchedMaterial;
        const validUnits = filterUnitsForCategory(mat.category, units);
        const matchedUnit = validUnits.find(u => u.name.toUpperCase() === l.unitName.toUpperCase()) || validUnits[0] || units[0];

        validItems.push({
          material_id: mat.id,
          material_name: mat.name,
          supplier_code: mat.code || '',
          quantity: l.quantity,
          unit_price: l.unitPrice || 0,
          tax_rate: 0.16,
          is_exempt: !!mat.is_exempt,
          unit: matchedUnit ? matchedUnit.name : (mat.unit || l.unitName),
          unit_id: matchedUnit?.id || mat.unit_id,
          description: mat.specification || '',
          category: mat.category,
          sales_percentage: 0,
          discount_percentage: 0,
        });
      }
    });

    if (validItems.length > 0) {
      onInsertItems(validItems);
      onClose();
    }
  };

  const matchedCount = parsedLines.filter(l => l.matchedMaterial !== null).length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-full sm:w-[96vw] sm:max-w-6xl h-[100dvh] sm:h-auto sm:max-h-[92vh] max-w-none flex flex-col p-0 gap-0 rounded-none sm:rounded-3xl overflow-hidden border-none shadow-2xl bg-white/95 backdrop-blur-xl">
        {/* HEADER */}
        <DialogHeader className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 to-[#1B294A] text-white shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 text-emerald-400">
                <ClipboardPaste className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Carga Rápida / Pegar Portapapeles
                  <Badge variant="outline" className="text-[10px] bg-white/10 text-emerald-300 border-white/20 font-mono">
                    WhatsApp & Excel
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-300 font-medium">
                  {supplierName ? (
                    <span>Proveedor: <strong className="text-white">{supplierName}</strong></span>
                  ) : (
                    "Pega texto copiado y el sistema reconocerá cantidades, unidades y materiales automáticamente."
                  )}
                </DialogDescription>
              </div>
            </div>

            <div className="flex bg-white/10 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setActiveTab('input')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'input' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:text-white'
                }`}
              >
                1. Pegar Texto
              </button>
              <button
                type="button"
                onClick={() => {
                  if (parsedLines.length > 0) setActiveTab('preview');
                  else parseRawLines();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'preview' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-200 hover:text-white'
                }`}
              >
                2. Vista Previa ({parsedLines.length})
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* BODY TABS */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {activeTab === 'input' ? (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Pega aquí el contenido (WhatsApp, Excel o Correo)
                </label>
                <button
                  type="button"
                  onClick={() => setShowExamples(!showExamples)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                >
                  <HelpCircle className="h-3.5 w-3.5" />
                  {showExamples ? 'Ocultar ejemplos' : 'Ver formatos compatibles'}
                </button>
              </div>

              {showExamples && (
                <div className="bg-blue-50/80 border border-blue-200/80 rounded-2xl p-4 text-xs space-y-2 text-slate-700 animate-in fade-in">
                  <p className="font-bold text-blue-900">Formatos reconocidos automáticamente:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px] bg-white p-3 rounded-xl border border-blue-100">
                    <div>
                      <span className="text-emerald-700 font-bold block mb-1">WhatsApp / Texto:</span>
                      • 10 KG PECHUGA DE POLLO<br />
                      • 5 KILOS MUSLO CONGELADO<br />
                      • 20 UND BANDEJA EMPAQUE 12X15<br />
                      • POLLO ENTERO 15KG $4.20
                    </div>
                    <div>
                      <span className="text-emerald-700 font-bold block mb-1">Copiado desde Excel:</span>
                      PECHUGA DESHUESADA &nbsp; 25 &nbsp; 4.50<br />
                      MUSLO ENTERO &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 12 &nbsp; 3.80<br />
                      TRIPA PLASTICA 60MM &nbsp;&nbsp;&nbsp;&nbsp; 50 &nbsp; 1.20
                    </div>
                  </div>
                </div>
              )}

              <Textarea
                placeholder={`Ejemplo:\n10 KG POLLO ENTERO\n15 KG PECHUGA DESHUESADA\n20 UND BANDEJAS AL VACIO`}
                rows={12}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="w-full bg-white border-slate-200 rounded-2xl p-4 font-mono text-xs focus:ring-procarni-primary/20 shadow-xs resize-none"
              />

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={parseRawLines}
                  disabled={!rawText.trim() || isProcessing}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold px-6 h-10 shadow-md transition-all active:scale-95"
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Procesando...</>
                  ) : (
                    <>Procesar y Validar <ArrowRight className="h-4 w-4 ml-2" /></>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-800">Resultado del procesamiento:</span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-mono">
                    {matchedCount} de {parsedLines.length} emparejados
                  </Badge>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab('input')}
                  className="text-xs text-slate-600 hover:text-slate-900 self-start sm:self-auto"
                >
                  ← Editar texto original
                </Button>
              </div>

              <div className="space-y-2.5">
                {parsedLines.map((line, idx) => {
                  const isMatched = !!line.matchedMaterial;

                  return (
                    <div
                      key={line.id}
                      className={`p-3.5 rounded-2xl border transition-all bg-white ${
                        isMatched
                          ? 'border-slate-200/90 shadow-xs hover:border-slate-300'
                          : 'border-amber-300 bg-amber-50/20'
                      }`}
                    >
                      <div className="grid grid-cols-12 gap-3 items-center">
                        {/* Line Index & Original Text snippet */}
                        <div className="col-span-12 md:col-span-3 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-700 truncate" title={line.originalText}>
                              &quot;{line.originalText}&quot;
                            </span>
                          </div>
                        </div>

                        {/* Searchable Matched Material Combobox */}
                        <div className="col-span-12 sm:col-span-6 md:col-span-4">
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                            Material Asociado (Búsqueda en todo el catálogo)
                          </label>
                          <SearchableMaterialSelect
                            selectedMaterial={line.matchedMaterial}
                            availableMaterials={combinedAvailableMaterials}
                            onSelect={(mat) => handleSelectMaterialForLine(line.id, mat)}
                            isMatched={isMatched}
                            placeholder="Buscar y asignar material..."
                          />
                        </div>

                        {/* Quantity */}
                        <div className="col-span-4 sm:col-span-2 md:col-span-1">
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                            Cant.
                          </label>
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantity || ''}
                            onChange={(e) =>
                              handleUpdateLine(line.id, {
                                quantity: e.target.value === '' ? 0 : parseFloat(e.target.value),
                              })
                            }
                            className="h-9 text-xs font-mono font-bold text-center rounded-xl bg-slate-50 border-slate-200"
                            onWheel={(e) => e.currentTarget.blur()}
                          />
                        </div>

                        {/* Unit */}
                        <div className="col-span-4 sm:col-span-2 md:col-span-1">
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                            Ud.
                          </label>
                          <Select
                            value={line.unitName}
                            onValueChange={(val) => handleUpdateLine(line.id, { unitName: val })}
                          >
                            <SelectTrigger className="h-9 text-xs font-medium rounded-xl bg-slate-50 border-slate-200 font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {units.map((u) => (
                                <SelectItem key={u.id} value={u.name} className="text-xs">
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Wide Price Input with visible digits and currency indicator */}
                        <div className="col-span-3 sm:col-span-2 md:col-span-2">
                          <label className="text-[9px] uppercase font-bold text-slate-400 block mb-0.5">
                            Precio ({currency})
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2.5 text-xs text-slate-400 font-medium select-none">
                              {currency === 'USD' ? '$' : currency === 'VES' ? 'Bs' : '€'}
                            </span>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={line.unitPrice || ''}
                              onChange={(e) =>
                                handleUpdateLine(line.id, {
                                  unitPrice: e.target.value === '' ? 0 : parseFloat(e.target.value),
                                })
                              }
                              className="h-9 text-xs font-mono font-bold text-right pl-6 pr-2 rounded-xl bg-slate-50 border-slate-200 focus:bg-white"
                              placeholder="0.00"
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </div>
                        </div>

                        {/* Delete */}
                        <div className="col-span-1 flex justify-end items-end pb-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLine(line.id)}
                            className="h-9 w-9 text-slate-400 hover:text-red-600 rounded-xl hover:bg-red-50"
                            title="Eliminar esta línea"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <DialogFooter className="p-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {activeTab === 'preview' && (
              <span>Se insertarán <strong className="text-procarni-dark font-black">{matchedCount}</strong> de <strong className="font-mono">{parsedLines.length}</strong> ítems en la orden.</span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:flex-initial h-10 rounded-xl text-xs font-semibold border-slate-200"
            >
              Cancelar
            </Button>

            {activeTab === 'preview' && (
              <Button
                type="button"
                onClick={handleConfirmInsert}
                disabled={matchedCount === 0}
                className="flex-1 sm:flex-initial h-10 bg-procarni-primary hover:bg-red-800 text-white rounded-xl text-xs font-bold px-6 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Insertar ({matchedCount}) Ítems
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ClipboardImportModal;
