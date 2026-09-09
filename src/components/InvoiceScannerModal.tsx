import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAllMaterialsWithoutFilters, getAllUnits, getAllSuppliers, searchMaterialsBySupplier } from '@/integrations/supabase/data';
import {
  Camera,
  UploadCloud,
  Sparkles,
  Check,
  Trash2,
  Loader2,
  Search,
  Building2,
  Calendar as CalendarIcon,
  Hash,
  Plus,
  RefreshCw,
  Zap,
  ArrowRight,
  Copy,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  PlusCircle,
  UserPlus,
  CheckCircle2,
  ChevronsUpDown,
  Star
} from 'lucide-react';
import { BatchItemForm, filterUnitsForCategory } from './MaterialCatalogBatchModal';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import SupplierCreationDialog from '@/components/SupplierCreationDialog';
import { cn } from '@/lib/utils';
import { normalizeString } from '@/utils/normalization';
import { showSuccess, showError, showWarning } from '@/utils/toast';
import { Supplier, Material } from '@/integrations/supabase/types';
import { extractStructuredInvoiceFromOcrText, getGeminiApiKey, formatVenRif } from '@/services/invoiceExtractionService';
import { ExtractedInvoiceSchema } from '@/types/invoiceExtractor';

interface InvoiceScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplierId?: string;
  supplierName?: string;
  currency: 'USD' | 'VES' | 'EUR';
  exchangeRate?: number | null;
  onInsertItems: (items: BatchItemForm[]) => void;
  onInvoiceHeaderDetected?: (header: { supplierName?: string; rif?: string; invoiceNumber?: string; issueDate?: string }) => void;
  onSupplierSelected?: (supplier: { id: string; name: string; rif?: string }) => void;
}

export interface ExtractedLineItem {
  id: string;
  originalText: string;
  rawMaterialName: string;
  quantity: number;
  unitName: string;
  unitPrice: number;
  matchedMaterial: any | null;
  status: 'matched' | 'partial' | 'unmatched';
}

const UNIT_REGEX: { [key: string]: RegExp } = {
  KG: /\b(kg|kgs|kilo|kilos|kilogramo|kilogramos)\b/i,
  LT: /\b(lt|lts|litro|litros)\b/i,
  UND: /\b(und|unds|unid|unids|unidad|unidades|pza|pzas|pz|pieza|piezas)\b/i,
  MT: /\b(mt|mts|metro|metros)\b/i,
  GR: /\b(gr|grs|gramo|gramos)\b/i,
  CAJA: /\b(caja|cajas|cja|cjas)\b/i,
  PQTE: /\b(paquete|paquetes|pqte|pqtes|pack)\b/i,
};

const normalizeText = (str: string) => {
  return normalizeString(str || '');
};

// Parse Venezuelan Number format (e.g. "177.058,20" -> 177058.20 or "120.50" -> 120.50)
const parseVenNumber = (str: string | undefined | null): number => {
  if (!str) return 0;
  let clean = str.trim().replace(/[^\d.,]/g, '');
  if (!clean) return 0;

  // Format with dots for thousands and comma for decimals (e.g. 177.058,20 or 1.250,50)
  if (clean.includes('.') && clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes(',')) {
    // Format with comma for decimals (e.g. 177058,20 or 177,05)
    clean = clean.replace(',', '.');
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[0]) > 0 && parseInt(parts[0]) < 1000) {
      // Thousands without decimals e.g. 177.058
      clean = parts[0] + parts[1];
    }
  }

  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
};

// Sanitize OCR confusion on numeric characters (e.g. 'O'/'o' -> '0', 'I'/'l' -> '1', 'S'/'s' -> '5', 'B' -> '8')
const sanitizeOcrDigits = (str: string): string => {
  return str
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[^\d]/g, '');
};

export const InvoiceScannerModal: React.FC<InvoiceScannerModalProps> = ({
  isOpen,
  onClose,
  supplierId,
  supplierName,
  currency,
  exchangeRate,
  onInsertItems,
  onInvoiceHeaderDetected,
  onSupplierSelected
}) => {
  const queryClient = useQueryClient();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [extractedRawText, setExtractedRawText] = useState('');
  const [hasScanned, setHasScanned] = useState(false);
  const [showRawText, setShowRawText] = useState(false);
  const [extractionMethod, setExtractionMethod] = useState<'gemini' | 'regex' | null>(null);

  // Active supplier selected or created in this session
  const [activeSupplierId, setActiveSupplierId] = useState<string>(supplierId || '');
  const [activeSupplierName, setActiveSupplierName] = useState<string>(supplierName || '');

  // Sub-dialogs state for creation
  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState(false);
  const [isCreateMaterialOpen, setIsCreateMaterialOpen] = useState(false);
  const [targetItemForCreation, setTargetItemForCreation] = useState<ExtractedLineItem | null>(null);
  const [materialInitialName, setMaterialInitialName] = useState('');

  // Extracted & Editable Header Info
  const [headerInfo, setHeaderInfo] = useState<{
    supplierName?: string;
    rif?: string;
    invoiceNumber?: string;
    issueDate?: string;
    serialMachine?: string;
  }>({});

  // Extracted Line Items
  const [items, setItems] = useState<ExtractedLineItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Queries
  const { data: allMaterials = [] } = useQuery({
    queryKey: ['allMaterialsForScanner'],
    queryFn: getAllMaterialsWithoutFilters,
    enabled: isOpen
  });

  const { data: units = [] } = useQuery({
    queryKey: ['unitsOfMeasureScanner'],
    queryFn: getAllUnits,
    enabled: isOpen
  });

  const { data: allSuppliers = [] } = useQuery({
    queryKey: ['allSuppliersForScanner'],
    queryFn: getAllSuppliers,
    enabled: isOpen
  });

  const { data: supplierMaterials = [] } = useQuery({
    queryKey: ['supplier_materials_for_scanner', activeSupplierId],
    queryFn: () => (activeSupplierId ? searchMaterialsBySupplier(activeSupplierId, '') : Promise.resolve([])),
    enabled: isOpen && !!activeSupplierId,
  });

  // Combine and deduplicate materials list with supplier association flag
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

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      setImageFile(null);
      setImagePreview(null);
      setIsProcessing(false);
      setOcrProgress(0);
      setOcrStatusText('');
      setExtractedRawText('');
      setHasScanned(false);
      setShowRawText(false);
      setExtractionMethod(null);
      setHeaderInfo({});
      setItems([]);
      setActiveSupplierId(supplierId || '');
      setActiveSupplierName(supplierName || '');
    } else {
      setActiveSupplierId(supplierId || '');
      setActiveSupplierName(supplierName || '');
    }
  }, [isOpen, supplierId, supplierName]);

  // Handle file selection (upload or camera)
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Process image with 2-step extraction (Tesseract OCR -> Gemini AI -> Regex Fallback)
  const processImageOCR = async () => {
    if (!imagePreview) return;
    setIsProcessing(true);
    setOcrProgress(5);
    setOcrStatusText('Iniciando motor de OCR local (Tesseract)...');

    try {
      const worker = await createWorker('spa', 1, {
        logger: m => {
          if (m.status === 'recognizing text') {
            const prog = Math.round((m.progress || 0) * 85);
            setOcrProgress(prog);
            setOcrStatusText(`Reconociendo texto en factura física... ${prog}%`);
          } else if (m.status) {
            setOcrStatusText(`Procesando imagen: ${m.status}...`);
          }
        }
      });

      const ret = await worker.recognize(imagePreview);
      const fullText = ret.data.text;
      setExtractedRawText(fullText);
      await worker.terminate();

      console.log('📄 [InvoiceScannerModal] Texto crudo extraído por Tesseract OCR:', fullText);

      // Check if Gemini API key is configured
      const geminiApiKey = getGeminiApiKey();
      let usedGemini = false;

      if (geminiApiKey) {
        setOcrProgress(90);
        setOcrStatusText('✨ Estructurando datos fiscales e ítems con Gemini 1.5 Flash...');
        try {
          const aiResult = await extractStructuredInvoiceFromOcrText(fullText, geminiApiKey);
          if (aiResult.success && aiResult.data) {
            console.log('🎯 [InvoiceScannerModal] Extracción Gemini exitosa:', aiResult.data);
            await parseGeminiExtractedData(aiResult.data, fullText);
            setExtractionMethod('gemini');
            usedGemini = true;
            showSuccess('Factura estructurada exitosamente con IA Gemini.');
          } else {
            console.warn('[InvoiceScannerModal] Gemini AI extraction failed, falling back to regex:', aiResult.error);
          }
        } catch (geminiErr) {
          console.warn('[InvoiceScannerModal] Gemini error, falling back to regex:', geminiErr);
        }
      }

      // If Gemini was not used or failed, fallback to local regex parsing
      if (!usedGemini) {
        console.log('⚙️ [InvoiceScannerModal] Ejecutando parser local de expresiones regulares (fallback)...');
        setOcrProgress(95);
        setOcrStatusText('Analizando campos fiscales y líneas con expresiones regulares...');
        parseExtractedText(fullText);
        setExtractionMethod('regex');
        if (!geminiApiKey) {
          showWarning('Procesado con OCR regex local. Configura VITE_GOOGLE_AI_API_KEY en .env para extracción con IA.');
        }
      }

      setOcrProgress(100);
      setHasScanned(true);
    } catch (err) {
      console.error('[InvoiceScannerModal] Error processing OCR:', err);
      setOcrStatusText('Error al procesar la imagen. Intenta con una foto más clara.');
      showError('Error al procesar la imagen con OCR.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Parse Header & Items from Gemini AI structured JSON output
  const parseGeminiExtractedData = async (aiData: ExtractedInvoiceSchema, fullText: string) => {
    // 1. Fiscal & Header Data
    const detectedRif = formatVenRif(aiData.emisor?.rif || '');
    const detectedSupplier = aiData.emisor?.razon_social || '';
    const detectedInvNumber = aiData.documento?.numero_factura || '';
    const detectedDate = aiData.documento?.fecha_emision || '';

    // Fiscal Serial from OCR fallback if any
    let detectedSerial = '';
    const serialMatch = fullText.match(/\b([Zz]\d[A-Za-z0-9]{7,11})\b/);
    if (serialMatch) detectedSerial = serialMatch[1].toUpperCase();

    // Check if supplier matches an existing supplier in DB
    let matchedSupp: Supplier | null = null;
    let currentSuppMaterials: any[] = [];

    if (allSuppliers.length > 0) {
      const cleanRif = detectedRif.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const normSupp = normalizeText(detectedSupplier);

      matchedSupp = allSuppliers.find((s: Supplier) => {
        const sRif = (s.rif || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (cleanRif && sRif && (cleanRif === sRif || cleanRif.startsWith(sRif) || sRif.startsWith(cleanRif))) return true;
        if (normSupp && (normalizeText(s.name) === normSupp || normSupp.includes(normalizeText(s.name)) || normalizeText(s.name).includes(normSupp))) return true;
        return false;
      }) || null;

      if (matchedSupp) {
        setActiveSupplierId(matchedSupp.id);
        setActiveSupplierName(matchedSupp.name);
        if (onSupplierSelected) {
          onSupplierSelected({ id: matchedSupp.id, name: matchedSupp.name, rif: matchedSupp.rif });
        }
        // Fetch supplier materials right now for immediate accurate matching
        try {
          currentSuppMaterials = await searchMaterialsBySupplier(matchedSupp.id, '');
          console.log(`📦 [InvoiceScannerModal] Materiales asociados al proveedor "${matchedSupp.name}":`, currentSuppMaterials.length);
        } catch (err) {
          console.warn('Error fetching supplier materials:', err);
        }
      }
    }

    // Build catalog with supplier priority
    const catalogMap = new Map<string, any>();
    currentSuppMaterials.forEach((m: any) => {
      if (m && m.id) catalogMap.set(m.id, { ...m, isSupplierAssociated: true });
    });
    allMaterials.forEach((m: any) => {
      if (m && m.id && !catalogMap.has(m.id)) {
        catalogMap.set(m.id, { ...m, isSupplierAssociated: false });
      }
    });
    const catalogForMatching = Array.from(catalogMap.values());

    const finalSupplierName = (matchedSupp ? matchedSupp.name : detectedSupplier) || activeSupplierName || supplierName || '';
    const finalRif = (matchedSupp?.rif) || detectedRif;

    const header = {
      supplierName: finalSupplierName,
      rif: finalRif,
      invoiceNumber: detectedInvNumber,
      issueDate: detectedDate,
      serialMachine: detectedSerial
    };
    setHeaderInfo(header);
    if (onInvoiceHeaderDetected && (header.rif || header.invoiceNumber)) {
      onInvoiceHeaderDetected(header);
    }

    // 2. Parse and map items
    const parsedLines: ExtractedLineItem[] = (aiData.items || []).map((it, idx) => {
      const matched = matchMaterialInCatalog(it.descripcion, catalogForMatching);
      console.log(`🔍 [InvoiceScannerModal] Match ítem "${it.descripcion}":`, matched.material?.name || 'NO ENCONTRADO', `(${matched.status})`);
      return {
        id: `gemini-${idx}-${Date.now()}`,
        originalText: `${it.cantidad} ${it.unidad} x ${it.precio_unitario} - ${it.descripcion}`,
        rawMaterialName: it.descripcion,
        quantity: it.cantidad || 1,
        unitName: it.unidad || 'UND',
        unitPrice: it.precio_unitario || 0,
        matchedMaterial: matched.material,
        status: matched.status
      };
    });

    setItems(parsedLines);
  };

  // Parse Header & Items from raw OCR text following SENIAT Fiscal Ticket Rules
  const parseExtractedText = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    // ==========================================
    // 1. EMISOR RIF EXTRACTION (Top 12 lines)
    // ==========================================
    let detectedRif = '';
    
    // Look for explicit RIF line first
    for (let i = 0; i < Math.min(12, lines.length); i++) {
      const line = lines[i];
      // Skip if this line is already under CLIENTE / DATOS DEL CLIENTE
      if (/cliente|comprador|tente:|razon social del cliente/i.test(line)) break;

      // Pattern: RIF J-501415420, R.I.F.: J-501415420-0, RIF: J501415420, etc.
      const rifHeaderMatch = line.match(/(?:RIF|R\.?I\.?F\.?|N\.?I\.?F\.?)[\s:#-]*([JVGPEjvgpe\]|1]?)\s*[-:]?\s*([0-9OoIlSsBb\s-]{7,15})/i);
      if (rifHeaderMatch) {
        let rawLetter = (rifHeaderMatch[1] || 'J').toUpperCase();
        if (rawLetter === ']' || rawLetter === '|' || rawLetter === '1') rawLetter = 'J';
        if (!['J', 'V', 'G', 'E', 'P'].includes(rawLetter)) rawLetter = 'J';

        const digits = sanitizeOcrDigits(rifHeaderMatch[2]);
        if (digits.length >= 7 && digits.length <= 10) {
          detectedRif = `${rawLetter}-${digits}`;
          break;
        }
      }
    }

    // Fallback: search for standalone RIF pattern in top lines if explicit tag wasn't matched
    if (!detectedRif) {
      for (let i = 0; i < Math.min(10, lines.length); i++) {
        const line = lines[i];
        if (/cliente|comprador|tente:/i.test(line)) break;
        const genericRifMatch = line.match(/\b([JVGPEjvgpe])-?(\d{7,9})(?:-(\d))?\b/i);
        if (genericRifMatch) {
          const letter = genericRifMatch[1].toUpperCase();
          const body = genericRifMatch[2];
          const check = genericRifMatch[3];
          detectedRif = check ? `${letter}-${body}-${check}` : `${letter}-${body}`;
          break;
        }
      }
    }

    // ==========================================
    // 2. INVOICE NUMBER EXTRACTION (Top 25 lines)
    // ==========================================
    let detectedInvNumber = '';

    // Strategy A: Explicit FACTURA / FACT / DOC. FISCAL line
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const line = lines[i];
      
      if (/factura|fact\.?\b|doc\.?\s*fiscal|comprobante\s*fiscal/i.test(line)) {
        // A1: Check for number on the same line after FACTURA:
        const sameLineMatch = line.match(/(?:factura|fact|doc\.?\s*fiscal|comprobante\s*fiscal)[\s:#.N°n°nro]*([0-9]{4,10})\b/i);
        if (sameLineMatch) {
          detectedInvNumber = sameLineMatch[1];
          break;
        }

        // A2: Any 4-10 digit number on the line that is NOT the control or serial number
        const numbersOnLine = Array.from(line.matchAll(/\b([0-9]{4,10})\b/g)).map(m => m[1]);
        if (numbersOnLine.length > 0) {
          detectedInvNumber = numbersOnLine[0];
          break;
        }

        // A3: Next line has the number (e.g. "FACTURA:" on one line, "00005399" on next)
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          const nextLineMatch = nextLine.match(/^([0-9]{4,10})$/) || nextLine.match(/\b([0-9]{4,10})\b/);
          if (nextLineMatch && !/fecha|hora|rif|cliente|ci|control|serial/i.test(nextLine)) {
            detectedInvNumber = nextLineMatch[1];
            break;
          }
        }
      }
    }

    // Strategy B: Zero-padded 6 to 10 digit number in header (e.g. 00005399)
    if (!detectedInvNumber) {
      for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (/control|rif|ci|telf|telefono|fecha|serial|z\d|subtotal|total/i.test(line)) continue;
        const paddedMatch = line.match(/\b(00[0-9]{4,8})\b/);
        if (paddedMatch) {
          detectedInvNumber = paddedMatch[1];
          break;
        }
      }
    }

    // Strategy C: Generic NRO: 00005399
    if (!detectedInvNumber) {
      for (let i = 0; i < Math.min(20, lines.length); i++) {
        const line = lines[i];
        if (/control|rif|ci|telf|telefono|fecha|serial|z\d/i.test(line)) continue;
        const nroMatch = line.match(/(?:nro|n°|num|no)[\s.:#]*([0-9]{4,10})/i);
        if (nroMatch) {
          detectedInvNumber = nroMatch[1];
          break;
        }
      }
    }

    // ==========================================
    // 3. DATE EXTRACTION
    // ==========================================
    let detectedDate = '';
    const dateMatch = text.match(/\b(?:fecha|fec)?[\s:#]*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/i);
    if (dateMatch) {
      const [_, day, month, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      detectedDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // ==========================================
    // 4. FISCAL SERIAL & SUPPLIER
    // ==========================================
    let detectedSerial = '';
    const serialMatch = text.match(/\b([Zz]\d[A-Za-z0-9]{7,11})\b/);
    if (serialMatch) detectedSerial = serialMatch[1].toUpperCase();

    let detectedSupplier = '';
    for (let i = 0; i < Math.min(8, lines.length); i++) {
      const line = lines[i];
      if (line.length > 3 && !line.match(/seniat|sentat|factura|rif|fecha|control|página|cliente|dir:|telf/i)) {
        if (!detectedSupplier && line.match(/[A-Z]{3,}/)) {
          detectedSupplier = line;
        }
      }
    }

    // Check if supplier matches an existing supplier in DB
    if (!activeSupplierId && allSuppliers.length > 0) {
      const cleanRif = detectedRif.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const normSupp = normalizeText(detectedSupplier);

      const matchedSupp = allSuppliers.find((s: Supplier) => {
        const sRif = (s.rif || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (cleanRif && sRif && cleanRif === sRif) return true;
        if (normSupp && normalizeText(s.name) === normSupp) return true;
        return false;
      });

      if (matchedSupp) {
        setActiveSupplierId(matchedSupp.id);
        setActiveSupplierName(matchedSupp.name);
        if (onSupplierSelected) {
          onSupplierSelected({ id: matchedSupp.id, name: matchedSupp.name, rif: matchedSupp.rif });
        }
      }
    }

    const header = {
      supplierName: detectedSupplier || activeSupplierName || supplierName || '',
      rif: detectedRif,
      invoiceNumber: detectedInvNumber,
      issueDate: detectedDate,
      serialMachine: detectedSerial
    };
    setHeaderInfo(header);
    if (onInvoiceHeaderDetected && (header.rif || header.invoiceNumber)) {
      onInvoiceHeaderDetected(header);
    }

    // ==========================================
    // 5. PARSE LINE ITEMS (SENIAT Thermal Ticket)
    // ==========================================
    const parsedLines: ExtractedLineItem[] = [];

    // Determine starting index of item section (after header metadata)
    let itemStartIndex = 0;
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const l = lines[i];
      if (/fecha|hora|factura:\s*[0-9]|condicion|dep:\s*\d|vend(?:edor)?\s*:/i.test(l)) {
        itemStartIndex = i + 1;
      }
    }

    // Determine ending index of item section (stop at subtotal/totals/payments)
    let itemEndIndex = lines.length;
    for (let i = itemStartIndex; i < lines.length; i++) {
      const l = lines[i];
      if (/^(subttl|subtotal|bi\s|iva|transferencia|efectivo|pago|total\s*(?:bs|\$|:|\d|$)|mu\s|z\d|serial)/i.test(l)) {
        itemEndIndex = i;
        break;
      }
    }

    const itemLines = lines.slice(itemStartIndex, itemEndIndex);

    for (let i = 0; i < itemLines.length; i++) {
      const line = itemLines[i];
      if (line.match(/^(factura|fecha|hora|-{3,})/i)) continue;

      // Pattern 1: SENIAT 2-Line format (e.g. "1x Bs 177.058,20 ; a" -> "AOP-23316-CALENTADOR...")
      const qtyPriceMatch = line.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|lts|lt|und|pza|caja|pqte|mts|gr)?\s*(?:x|\*)\s*(?:bs\.?|\$)?\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/i);

      if (qtyPriceMatch) {
        const qty = parseVenNumber(qtyPriceMatch[1]) || 1;
        let unitName = (qtyPriceMatch[2] || 'UND').toUpperCase();
        const uPrice = parseVenNumber(qtyPriceMatch[3]);

        // Next line is Description + Code + (G)/(E)/(R) + Total
        const nextLine = itemLines[i + 1] || '';
        let rawMaterial = nextLine;

        // Remove tax tags (G), (6), (E), (R), (A), (B) and trailing total price
        rawMaterial = rawMaterial
          .replace(/\((?:G|6|E|R|A|B)\)/gi, '')
          .replace(/(?:bs\.?|\$)?\s*[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?\s*[a-z0-9]?$/i, '')
          .replace(/\b(\d+[.,]\d{2}|\d+\.\d{3},\d{2})\b/g, '')
          .replace(/[^\w\s\u00C0-\u00FF-]/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (rawMaterial.length > 1) {
          const matched = matchMaterialInCatalog(rawMaterial, allMaterials);
          parsedLines.push({
            id: `extracted-${i}-${Date.now()}`,
            originalText: `${line} \n ${nextLine}`,
            rawMaterialName: rawMaterial,
            quantity: qty,
            unitName,
            unitPrice: uPrice,
            matchedMaterial: matched.material,
            status: matched.status
          });
          i++; // Skip next line since it was consumed
          continue;
        }
      }

      // Pattern 2: Single-Line format (e.g. "1 x 177.058,20 AQP-23316-CALENTADOR (G) 177.058,20")
      if (/\d/.test(line)) {
        let quantity = 1;
        let unitName = 'UND';
        let unitPrice = 0;

        // Detect Unit
        for (const [uName, pattern] of Object.entries(UNIT_REGEX)) {
          if (pattern.test(line)) {
            unitName = uName;
            break;
          }
        }

        // Detect Quantity
        const qtyM = line.match(/\b(\d+(?:[.,]\d+)?)\s*(?:x|\*|kg|lts|lt|und|pza|caja|pqte|mts|gr)\b/i);
        if (qtyM) {
          quantity = parseVenNumber(qtyM[1]) || 1;
        }

        // Detect Unit Price or Total
        const priceMatches = line.match(/\b([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\b/g);
        if (priceMatches && priceMatches.length > 0) {
          unitPrice = parseVenNumber(priceMatches[0]);
        }

        let rawMaterial = line
          .replace(/^(item|art|cod|código|descripción|cant|p\.u|total)\b/gi, '')
          .replace(/\b(\d+(?:[.,]\d+)?)\s*(?:x|\*|kg|lts|lt|und|pza|caja|pqte|mts|gr)\b/gi, '')
          .replace(/\((?:G|6|E|R|A|B)\)/gi, '')
          .replace(/(?:bs\.?|\$)?\s*[0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?\s*[a-z0-9]?$/i, '')
          .replace(/\b(\d+[.,]\d{2}|\d+\.\d{3},\d{2})\b/g, '')
          .replace(/[^\w\s\u00C0-\u00FF-]/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (rawMaterial.length > 2 && !rawMaterial.match(/^(seniat|sentat|subtotal|total|fecha|cliente|factura|tente)/i)) {
          const matched = matchMaterialInCatalog(rawMaterial, allMaterials);
          parsedLines.push({
            id: `extracted-${i}-${Date.now()}`,
            originalText: line,
            rawMaterialName: rawMaterial,
            quantity,
            unitName,
            unitPrice,
            matchedMaterial: matched.material,
            status: matched.status
          });
        }
      }
    }

    setItems(parsedLines);
  };

  // Match material by name, code or search_aliases with intelligent scoring & supplier priority
  const matchMaterialInCatalog = (rawText: string, catalog: any[]) => {
    if (!rawText || catalog.length === 0) {
      return { material: null, status: 'unmatched' as const };
    }

    const cleanQuery = normalizeText(rawText)
      .replace(/[^a-z0-9\u00C0-\u00FF]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);

    let bestMatch: any = null;
    let bestScore = 0;

    for (const m of catalog) {
      const cleanName = normalizeText(m.name || '')
        .replace(/[^a-z0-9\u00C0-\u00FF]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const cleanCode = normalizeText(m.code || '')
        .replace(/[^a-z0-9\u00C0-\u00FF]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const cleanSupplierCode = normalizeText(m.supplier_code || '')
        .replace(/[^a-z0-9\u00C0-\u00FF]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const aliases = (m.search_aliases || []).map((a: string) => 
        normalizeText(a).replace(/[^a-z0-9\u00C0-\u00FF]+/gi, ' ').trim()
      );

      // 1. Exact match (Direct hit)
      if (cleanName === cleanQuery || (cleanCode && cleanCode === cleanQuery) || (cleanSupplierCode && cleanSupplierCode === cleanQuery)) {
        return { material: m, status: 'matched' as const };
      }

      if (aliases.some(a => a === cleanQuery)) {
        return { material: m, status: 'matched' as const };
      }

      let score = 0;

      // 2. Full phrase containment (e.g. "aop 23316 calentador de agua 50l" contains "calentador de agua")
      if (cleanName.length >= 3 && cleanQuery.includes(cleanName)) {
        score += 80;
      }

      // 3. Exact Code or Supplier Code containment (e.g. Query contains "23316" or "aop 23316")
      if (cleanCode && cleanCode.length >= 3 && cleanQuery.includes(cleanCode)) {
        score += 45;
      }
      if (cleanSupplierCode && cleanSupplierCode.length >= 3 && cleanQuery.includes(cleanSupplierCode)) {
        score += 50;
      }

      // 4. Catalog Material words coverage
      const matWords = cleanName.split(/\s+/).filter(w => w.length > 2);
      if (matWords.length > 0) {
        let matchedWordsCount = 0;
        matWords.forEach(w => {
          if (queryWords.includes(w) || cleanQuery.includes(w)) {
            matchedWordsCount++;
            score += 20;
          }
        });

        // If ALL words of the catalog item are in the query (e.g. "calentador" AND "agua" are in query)
        if (matchedWordsCount === matWords.length) {
          score += 40;
        } else if (matWords.length > 1 && matchedWordsCount < matWords.length) {
          // If the catalog item has words NOT present in the query (like "mineral" in "agua mineral"), penalize
          const unmatched = matWords.length - matchedWordsCount;
          score -= unmatched * 25;
        }
      }

      // 5. Check aliases containment
      aliases.forEach(alias => {
        if (alias.length >= 3 && cleanQuery.includes(alias)) {
          score += 40;
        }
      });

      // 6. Supplier Association Boost (items from this supplier take priority)
      if (m.isSupplierAssociated) {
        score += 70;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = m;
      }
    }

    if (bestMatch && bestScore >= 35) {
      return { material: bestMatch, status: 'matched' as const };
    } else if (bestMatch && bestScore >= 15) {
      return { material: bestMatch, status: 'partial' as const };
    }

    return { material: null, status: 'unmatched' as const };
  };

  // Update item field
  const updateItem = (id: string, updates: Partial<ExtractedLineItem>) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, ...updates } : item)));
  };

  // Remove line item
  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Add manual empty line
  const addManualLine = () => {
    setItems(prev => [
      ...prev,
      {
        id: `manual-${Date.now()}`,
        originalText: 'Fila manual',
        rawMaterialName: '',
        quantity: 1,
        unitName: 'UND',
        unitPrice: 0,
        matchedMaterial: null,
        status: 'unmatched'
      }
    ]);
  };

  // Open dialog to create new material for a specific item row
  const openMaterialCreationForItem = (item: ExtractedLineItem) => {
    setTargetItemForCreation(item);
    setMaterialInitialName(item.rawMaterialName || '');
    setIsCreateMaterialOpen(true);
  };

  // Handle Material created from dialog
  const handleMaterialCreated = (newMaterial: Material & { specification?: string }) => {
    queryClient.invalidateQueries({ queryKey: ['allMaterialsForScanner'] });
    queryClient.invalidateQueries({ queryKey: ['materials'] });

    if (targetItemForCreation) {
      const selectedUnitName = newMaterial.unit?.toUpperCase() || targetItemForCreation.unitName;
      updateItem(targetItemForCreation.id, {
        matchedMaterial: newMaterial,
        status: 'matched',
        unitName: selectedUnitName
      });
      showSuccess(`Material "${newMaterial.name}" creado y asignado a la fila.`);
    }

    setIsCreateMaterialOpen(false);
    setTargetItemForCreation(null);
  };

  // Handle Supplier created from dialog
  const handleSupplierCreated = (newSupplier: Supplier) => {
    queryClient.invalidateQueries({ queryKey: ['allSuppliersForScanner'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });

    setActiveSupplierId(newSupplier.id);
    setActiveSupplierName(newSupplier.name);
    setHeaderInfo(prev => ({
      ...prev,
      supplierName: newSupplier.name,
      rif: newSupplier.rif || prev.rif
    }));

    if (onSupplierSelected) {
      onSupplierSelected({ id: newSupplier.id, name: newSupplier.name, rif: newSupplier.rif });
    }

    if (onInvoiceHeaderDetected) {
      onInvoiceHeaderDetected({
        supplierName: newSupplier.name,
        rif: newSupplier.rif,
        invoiceNumber: headerInfo.invoiceNumber,
        issueDate: headerInfo.issueDate
      });
    }

    showSuccess(`Proveedor "${newSupplier.name}" creado y asociado a la orden.`);
    setIsCreateSupplierOpen(false);
  };

  // Submit items to Purchase Order Form
  const handleInsert = () => {
    const validItems: BatchItemForm[] = items
      .filter(item => item.matchedMaterial && item.quantity > 0)
      .map(item => {
        const mat = item.matchedMaterial;
        const availableUnits = filterUnitsForCategory(mat.category, units);
        let selectedUnit = availableUnits.find(
          u => u.name.toUpperCase() === item.unitName.toUpperCase()
        );
        if (!selectedUnit) {
          selectedUnit = availableUnits[0] || { id: mat.unit_id || '', name: mat.unit || 'Und', abbreviation: 'Und' };
        }

        return {
          material_id: mat.id,
          material_name: mat.name,
          materialId: mat.id,
          materialName: mat.name,
          supplier_code: '',
          materialCode: '',
          materialCategory: mat.category || '',
          category: mat.category || '',
          quantity: item.quantity,
          unit_id: selectedUnit.id,
          unitId: selectedUnit.id,
          unit: selectedUnit.name,
          unitName: selectedUnit.name,
          unit_price: item.unitPrice > 0 ? item.unitPrice : (mat.last_price || mat.estimated_price || 0),
          unitPrice: item.unitPrice > 0 ? item.unitPrice : (mat.last_price || mat.estimated_price || 0),
          is_exempt: mat.is_exempt || false,
          isExempt: mat.is_exempt || false
        };
      });

    if (validItems.length === 0) {
      showError('Debes seleccionar o confirmar el material en el catálogo para al menos una fila antes de insertar.');
      return;
    }

    if (activeSupplierId && onSupplierSelected) {
      onSupplierSelected({
        id: activeSupplierId,
        name: activeSupplierName,
        rif: headerInfo.rif
      });
    }

    if (onInvoiceHeaderDetected && (activeSupplierName || headerInfo.supplierName || headerInfo.rif || headerInfo.invoiceNumber || headerInfo.issueDate)) {
      onInvoiceHeaderDetected({
        supplierName: activeSupplierName || headerInfo.supplierName,
        rif: headerInfo.rif,
        invoiceNumber: headerInfo.invoiceNumber,
        issueDate: headerInfo.issueDate
      });
    }

    onInsertItems(validItems);
    onClose();
  };

  const matchedSupplierObject = useMemo(() => {
    if (activeSupplierId) {
      return allSuppliers.find((s: Supplier) => s.id === activeSupplierId);
    }
    return null;
  }, [allSuppliers, activeSupplierId]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
        <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] flex flex-col p-0 overflow-hidden bg-white/95 backdrop-blur-xl border border-slate-100 shadow-2xl rounded-3xl">
          {/* Header */}
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-procarni-primary/10 text-procarni-primary">
                  <Camera className="h-6 w-6" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-extrabold text-procarni-dark">
                    Escáner de Factura / Recibo (OCR)
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 font-medium">
                    Escanea o sube la foto de una factura física para extraer automáticamente ítems, precios y cantidades.
                  </DialogDescription>
                </div>
              </div>
              {activeSupplierName && (
                <Badge variant="outline" className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-white border-slate-200 text-slate-700 text-xs font-semibold rounded-xl">
                  <Building2 className="h-3.5 w-3.5 text-procarni-primary" />
                  {activeSupplierName}
                </Badge>
              )}
            </div>
          </DialogHeader>

          {/* Modal Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
            {/* Step 1: Upload / Camera Capture */}
            {!imagePreview ? (
              <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-slate-200 hover:border-procarni-primary/50 bg-slate-50/50 hover:bg-procarni-primary/5 rounded-3xl transition-all duration-300 text-center space-y-4">
                <div className="p-4 rounded-full bg-white shadow-md text-procarni-primary">
                  <UploadCloud className="h-10 w-10 animate-pulse" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h3 className="font-bold text-base text-procarni-dark">Carga o toma una foto del recibo</h3>
                  <p className="text-xs text-slate-500">
                    Admite imágenes JPG, PNG o capturas directas desde la cámara del celular.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3 justify-center pt-2">
                  {/* Camera Capture Input */}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={cameraInputRef}
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => cameraInputRef.current?.click()}
                    className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-2xl shadow-lg shadow-procarni-primary/20 flex items-center gap-2 h-11 px-5"
                  >
                    <Camera className="h-5 w-5" />
                    Tomar Foto con Cámara
                  </Button>

                  {/* Upload File Input */}
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={e => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-slate-200 hover:bg-white text-slate-700 rounded-2xl flex items-center gap-2 h-11 px-5"
                  >
                    <UploadCloud className="h-5 w-5 text-slate-500" />
                    Seleccionar Archivo
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Image Preview & Controls Bar */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-4">
                    <img
                      src={imagePreview}
                      alt="Previsualización de Factura"
                      className="h-16 w-16 object-cover rounded-xl border border-slate-200 shadow-sm"
                    />
                    <div>
                      <h4 className="font-bold text-sm text-procarni-dark truncate max-w-[250px]">
                        {imageFile?.name || 'Fotografía de Factura'}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        {imageFile ? (imageFile.size / 1024).toFixed(1) + ' KB' : 'Imagen lista'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview(null);
                        setItems([]);
                        setHasScanned(false);
                      }}
                      className="h-9 text-xs rounded-xl border-slate-200 text-slate-600 hover:text-red-600"
                      disabled={isProcessing}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      Cambiar Foto
                    </Button>

                    {!items.length && !isProcessing && (
                      <Button
                        type="button"
                        onClick={processImageOCR}
                        className="h-9 text-xs rounded-xl bg-procarni-primary hover:bg-procarni-primary/90 text-white shadow-md flex items-center gap-1.5"
                      >
                        <Zap className="h-4 w-4" />
                        Procesar OCR
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress Bar during OCR */}
                {isProcessing && (
                  <div className="p-6 bg-procarni-primary/5 rounded-2xl border border-procarni-primary/20 space-y-3 animate-in fade-in-50">
                    <div className="flex justify-between items-center text-xs font-semibold text-procarni-primary">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-procarni-primary" />
                        {ocrStatusText}
                      </span>
                      <span className="font-mono">{ocrProgress}%</span>
                    </div>
                    <Progress value={ocrProgress} className="h-2 bg-procarni-primary/20" />
                  </div>
                )}

                {/* Extracted Header Meta & Inputs */}
                {(hasScanned || Object.keys(headerInfo).length > 0) && (
                  <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-4">
                    {/* Top Status Bar: Supplier Matching & Creation Action */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-procarni-dark uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-procarni-primary" />
                          Datos Fiscales Detectados:
                        </span>
                        {matchedSupplierObject ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Proveedor Registrado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Proveedor No Registrado
                          </Badge>
                        )}
                      </div>

                      {/* Supplier Actions: Create or Assign */}
                      <div className="flex items-center gap-2">
                        <SearchableSupplierSelectScanner
                          selectedSupplierId={activeSupplierId}
                          availableSuppliers={allSuppliers}
                          onSelect={supp => {
                            setActiveSupplierId(supp.id);
                            setActiveSupplierName(supp.name);
                            setHeaderInfo(prev => ({ ...prev, supplierName: supp.name, rif: supp.rif || prev.rif }));
                            onSupplierSelected?.({ id: supp.id, name: supp.name, rif: supp.rif });
                          }}
                        />

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsCreateSupplierOpen(true)}
                          className="h-8 text-xs font-semibold rounded-xl bg-white border-procarni-primary/30 text-procarni-primary hover:bg-procarni-primary hover:text-white transition-colors gap-1.5 shadow-sm"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          + Crear Proveedor
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 text-xs">
                      {/* Proveedor / Razón Social: Fila única en mobile (col-span-3) y 1 columna en desktop (sm:col-span-1) */}
                      <div className="col-span-3 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Proveedor / Razón Social
                        </label>
                        <Input
                          value={headerInfo.supplierName || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = { ...headerInfo, supplierName: val };
                            setHeaderInfo(updated);
                            onInvoiceHeaderDetected?.(updated);
                          }}
                          placeholder="Nombre del proveedor"
                          className="h-9 sm:h-8 text-xs font-semibold bg-white rounded-xl"
                        />
                      </div>

                      {/* RIF Emisor: Siguiente fila en mobile (col-span-1) */}
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 truncate">
                          RIF Emisor
                        </label>
                        <Input
                          value={headerInfo.rif || ''}
                          onChange={e => {
                            const val = e.target.value.toUpperCase();
                            const updated = { ...headerInfo, rif: val };
                            setHeaderInfo(updated);
                            onInvoiceHeaderDetected?.(updated);
                          }}
                          placeholder="Ej: J-501415420"
                          className="h-9 sm:h-8 text-xs font-mono font-semibold bg-white rounded-xl"
                        />
                      </div>

                      {/* N° Factura: Siguiente fila en mobile (col-span-1) */}
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 truncate">
                          N° Factura
                        </label>
                        <Input
                          value={headerInfo.invoiceNumber || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = { ...headerInfo, invoiceNumber: val };
                            setHeaderInfo(updated);
                            onInvoiceHeaderDetected?.(updated);
                          }}
                          placeholder="Ej: 00005399"
                          className="h-9 sm:h-8 text-xs font-mono font-bold text-procarni-dark bg-white rounded-xl"
                        />
                      </div>

                      {/* Fecha Emisión: Siguiente fila en mobile (col-span-1) */}
                      <div className="col-span-1 sm:col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 truncate">
                          Fecha Emisión
                        </label>
                        <Input
                          type="date"
                          value={headerInfo.issueDate || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const updated = { ...headerInfo, issueDate: val };
                            setHeaderInfo(updated);
                            onInvoiceHeaderDetected?.(updated);
                          }}
                          className="h-9 sm:h-8 text-xs font-mono bg-white rounded-xl px-1.5 sm:px-3"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Extracted Items Table (Grid de Pre-Validación) */}
                {(hasScanned || items.length > 0) && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-sm text-procarni-dark flex items-center gap-2 flex-wrap">
                          <span>Ítems Detectados ({items.filter(i => i.matchedMaterial).length}/{items.length})</span>
                          {extractionMethod === 'gemini' && (
                            <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px] font-bold gap-1 px-2 py-0.5 rounded-lg shadow-sm">
                              <Sparkles className="h-3 w-3 text-purple-600" />
                              IA Gemini 1.5 Flash
                            </Badge>
                          )}
                          {extractionMethod === 'regex' && (
                            <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-[10px] font-medium gap-1 px-2 py-0.5 rounded-lg">
                              <FileText className="h-3 w-3 text-slate-500" />
                              OCR Local (Regex)
                            </Badge>
                          )}
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Verifica, empareja o crea nuevos materiales antes de importarlos a la orden de compra.
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={addManualLine}
                        className="text-xs text-procarni-primary hover:bg-procarni-primary/10 h-8 rounded-xl flex items-center gap-1 font-semibold"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Agregar Fila Manual
                      </Button>
                    </div>

                    {/* Empty state if 0 items matched automatically */}
                    {items.length === 0 ? (
                      <div className="p-8 border border-dashed border-slate-200 bg-white rounded-2xl text-center space-y-3">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-full w-fit mx-auto">
                          <AlertCircle className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <h5 className="font-bold text-sm text-procarni-dark">
                            No se identificaron líneas de productos automáticamente
                          </h5>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            Puedes agregar filas manualmente con el botón de abajo o revisar el texto OCR extraído.
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={addManualLine}
                          variant="outline"
                          className="text-xs border-procarni-primary text-procarni-primary hover:bg-procarni-primary/10 rounded-xl"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Agregar Fila Manual
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Desktop View: Table */}
                        <div className="hidden md:block rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm max-h-[440px] overflow-y-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider sticky top-0 z-10">
                              <tr>
                                <th className="py-3 px-3 w-[90px]">Estado</th>
                                <th className="py-3 px-3 min-w-[360px]">Material Detectado / Asignado</th>
                                <th className="py-3 px-3 w-[110px]">Cant.</th>
                                <th className="py-3 px-3 w-[120px]">Unidad</th>
                                <th className="py-3 px-3 w-[140px] text-right">Precio ({currency})</th>
                                <th className="py-3 px-3 w-[50px]"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {items.map(item => (
                                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                                  {/* Status Badge */}
                                  <td className="py-2.5 px-3">
                                    {item.status === 'matched' ? (
                                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                        <Check className="h-3 w-3 mr-0.5" /> OK
                                      </Badge>
                                    ) : item.status === 'partial' ? (
                                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                        Sugerido
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold">
                                        Revisar
                                      </Badge>
                                    )}
                                  </td>

                                  {/* Material Selector & Create Action */}
                                  <td className="py-2.5 px-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 min-w-0">
                                          <SearchableMaterialSelect
                                            selectedMaterial={item.matchedMaterial}
                                            availableMaterials={combinedAvailableMaterials}
                                            isMatched={item.status === 'matched'}
                                            onSelect={m =>
                                              updateItem(item.id, {
                                                matchedMaterial: m,
                                                status: m ? 'matched' : 'unmatched'
                                              })
                                            }
                                            onCreateClick={() => openMaterialCreationForItem(item)}
                                          />
                                        </div>

                                        {/* Quick Create Material Button */}
                                        {!item.matchedMaterial && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => openMaterialCreationForItem(item)}
                                            title="Crear este material en el catálogo"
                                            className="h-8 px-2.5 text-[11px] font-bold text-procarni-primary border-procarni-primary/30 hover:bg-procarni-primary hover:text-white rounded-xl shrink-0 flex items-center gap-1 shadow-sm"
                                          >
                                            <PlusCircle className="h-3.5 w-3.5" />
                                            Crear
                                          </Button>
                                        )}
                                      </div>

                                      {item.originalText && (
                                        <p className="text-[10px] text-slate-400 italic truncate max-w-xl" title={item.originalText}>
                                          Texto OCR: "{item.originalText.replace(/\n/g, ' ')}"
                                        </p>
                                      )}
                                    </div>
                                  </td>

                                  {/* Quantity Input */}
                                  <td className="py-2.5 px-3">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      value={item.quantity}
                                      onChange={e =>
                                        updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })
                                      }
                                      className="h-8 text-xs font-mono font-bold bg-slate-50/50"
                                    />
                                  </td>

                                  {/* Unit Select */}
                                  <td className="py-2.5 px-3">
                                    <Select
                                      value={item.unitName}
                                      onValueChange={val => updateItem(item.id, { unitName: val })}
                                    >
                                      <SelectTrigger className="h-8 text-xs bg-slate-50/50">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Object.keys(UNIT_REGEX).map(u => (
                                          <SelectItem key={u} value={u}>
                                            {u}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>

                                  {/* Unit Price Input */}
                                  <td className="py-2.5 px-3 text-right">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.unitPrice}
                                      onChange={e =>
                                        updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })
                                      }
                                      className="h-8 text-xs font-mono font-bold text-right bg-slate-50/50"
                                    />
                                  </td>

                                  {/* Actions */}
                                  <td className="py-2.5 px-3 text-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeItem(item.id)}
                                      className="h-7 w-7 text-slate-400 hover:text-red-600 rounded-lg"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile View: Stacked Cards */}
                        <div className="block md:hidden space-y-3 max-h-[460px] overflow-y-auto pr-0.5">
                          {items.map((item, idx) => {
                            const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);
                            return (
                              <div
                                key={item.id}
                                className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
                                  item.status === 'matched'
                                    ? 'bg-white border-slate-200/90 shadow-sm'
                                    : 'bg-amber-50/20 border-amber-300 shadow-sm ring-1 ring-amber-100'
                                }`}
                              >
                                {/* Card Header: Row Number, Status Badge & Delete */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg">
                                      #{idx + 1}
                                    </span>
                                    {item.status === 'matched' ? (
                                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold">
                                        <Check className="h-3 w-3 mr-0.5" /> OK
                                      </Badge>
                                    ) : item.status === 'partial' ? (
                                      <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-bold">
                                        Sugerido
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-red-50 text-red-700 border-red-200 text-[10px] font-bold">
                                        Revisar
                                      </Badge>
                                    )}
                                  </div>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeItem(item.id)}
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Material Selector & Create Button */}
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                    Material Asignado
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                      <SearchableMaterialSelect
                                        selectedMaterial={item.matchedMaterial}
                                        availableMaterials={combinedAvailableMaterials}
                                        isMatched={item.status === 'matched'}
                                        onSelect={m =>
                                          updateItem(item.id, {
                                            matchedMaterial: m,
                                            status: m ? 'matched' : 'unmatched'
                                          })
                                        }
                                        onCreateClick={() => openMaterialCreationForItem(item)}
                                      />
                                    </div>

                                    {!item.matchedMaterial && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openMaterialCreationForItem(item)}
                                        title="Crear este material en el catálogo"
                                        className="h-9 px-3 text-xs font-bold text-procarni-primary border-procarni-primary/30 hover:bg-procarni-primary hover:text-white rounded-xl shrink-0 flex items-center gap-1 shadow-sm"
                                      >
                                        <PlusCircle className="h-3.5 w-3.5" />
                                        Crear
                                      </Button>
                                    )}
                                  </div>

                                  {item.originalText && (
                                    <p className="text-[10px] text-slate-400 italic break-words line-clamp-2">
                                      Texto OCR: "{item.originalText.replace(/\n/g, ' ')}"
                                    </p>
                                  )}
                                </div>

                                {/* Quantity, Unit & Price Grid */}
                                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                                  <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Cant.
                                    </label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0.01"
                                      value={item.quantity}
                                      onChange={e =>
                                        updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })
                                      }
                                      className="h-10 text-xs font-mono font-bold bg-slate-50/50 rounded-xl"
                                    />
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                      Unidad
                                    </label>
                                    <Select
                                      value={item.unitName}
                                      onValueChange={val => updateItem(item.id, { unitName: val })}
                                    >
                                      <SelectTrigger className="h-10 text-xs bg-slate-50/50 rounded-xl">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {Object.keys(UNIT_REGEX).map(u => (
                                          <SelectItem key={u} value={u}>
                                            {u}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1 text-right">
                                      Precio ({currency})
                                    </label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={item.unitPrice}
                                      onChange={e =>
                                        updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })
                                      }
                                      className="h-10 text-xs font-mono font-bold text-right bg-slate-50/50 rounded-xl"
                                    />
                                  </div>
                                </div>

                                {/* Line Total Subtotal Footer */}
                                {lineTotal > 0 && (
                                  <div className="flex justify-between items-center text-[11px] pt-1 text-slate-500 font-medium">
                                    <span>Subtotal línea:</span>
                                    <span className="font-mono font-bold text-slate-800">
                                      {currency} {lineTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Raw OCR Text Collapsible Box */}
                {extractedRawText && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                    <button
                      type="button"
                      onClick={() => setShowRawText(!showRawText)}
                      className="w-full flex items-center justify-between p-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-slate-400" />
                        Texto Reconocido por OCR (Ver / Depurar)
                      </span>
                      {showRawText ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {showRawText && (
                      <div className="p-4 pt-0 space-y-2 border-t border-slate-200 bg-white">
                        <div className="flex justify-end pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(extractedRawText);
                              showSuccess('Texto OCR copiado al portapapeles');
                            }}
                            className="h-7 text-[11px] rounded-lg gap-1"
                          >
                            <Copy className="h-3 w-3" />
                            Copiar Texto Completo
                          </Button>
                        </div>
                        <pre className="p-3 bg-slate-50 text-[11px] font-mono text-slate-700 rounded-xl overflow-x-auto max-h-[160px] whitespace-pre-wrap border border-slate-100">
                          {extractedRawText}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sticky Footer */}
          <DialogFooter className="p-4 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 font-medium flex flex-col gap-0.5">
              {items.length > 0 && (
                <span>
                  <strong className="text-procarni-dark">{items.filter(i => i.matchedMaterial).length}</strong> de {items.length} ítems listos para insertar.
                </span>
              )}
              {extractionMethod === 'gemini' && (
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-purple-500 shrink-0" />
                  Gemini es una IA y puede cometer errores. Verifica siempre los datos antes de importar.
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="rounded-2xl border-slate-200 text-slate-600 text-xs h-10 px-4 w-full sm:w-auto"
              >
                Cancelar
              </Button>

              {items.length > 0 && (
                <Button
                  type="button"
                  onClick={handleInsert}
                  disabled={items.filter(i => i.matchedMaterial).length === 0}
                  className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-2xl shadow-lg shadow-procarni-primary/20 text-xs font-bold h-10 px-5 w-full sm:w-auto flex items-center gap-1.5"
                >
                  Insertar {items.filter(i => i.matchedMaterial).length} Ítems en la Orden
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sub-Dialog: Create Material */}
      <MaterialCreationDialog
        isOpen={isCreateMaterialOpen}
        onClose={() => {
          setIsCreateMaterialOpen(false);
          setTargetItemForCreation(null);
        }}
        onMaterialCreated={handleMaterialCreated}
        supplierId={activeSupplierId}
        supplierName={activeSupplierName}
        initialName={materialInitialName}
      />

      {/* Sub-Dialog: Create Supplier */}
      <SupplierCreationDialog
        isOpen={isCreateSupplierOpen}
        onClose={() => setIsCreateSupplierOpen(false)}
        onSupplierCreated={handleSupplierCreated}
        initialData={{
          name: headerInfo.supplierName || '',
          rif: headerInfo.rif || '',
          payment_terms: 'Contado',
          status: 'Activo'
        }}
      />
    </>
  );
};

// Searchable Combobox for selecting material in each row with accent-insensitive multi-word search & category filters
const SearchableMaterialSelect: React.FC<{
  selectedMaterial: any | null;
  onSelect: (material: any) => void;
  availableMaterials: any[];
  placeholder?: string;
  isMatched: boolean;
  onCreateClick?: () => void;
}> = ({ selectedMaterial, onSelect, availableMaterials, placeholder = "Buscar material...", isMatched, onCreateClick }) => {
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

          {onCreateClick && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setOpen(false);
                onCreateClick();
              }}
              className="w-full justify-center text-xs font-bold text-procarni-primary bg-procarni-primary/5 hover:bg-procarni-primary/10 border-procarni-primary/20 h-7 rounded-xl gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              + Crear Nuevo Material en Catálogo
            </Button>
          )}
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

// Searchable Supplier Select for Header
const SearchableSupplierSelectScanner: React.FC<{
  selectedSupplierId?: string;
  availableSuppliers: Supplier[];
  onSelect: (supplier: Supplier) => void;
}> = ({ selectedSupplierId, availableSuppliers, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSupplier = useMemo(() => {
    return availableSuppliers.find(s => s.id === selectedSupplierId);
  }, [availableSuppliers, selectedSupplierId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableSuppliers.slice(0, 100);
    const q = normalizeText(search);
    const words = q.split(/\s+/).filter(Boolean);

    return availableSuppliers
      .filter((s: Supplier) => {
        const normName = normalizeText(s.name || '');
        const normRif = normalizeText(s.rif || '');
        return words.every(w => normName.includes(w) || normRif.includes(w));
      })
      .slice(0, 100);
  }, [availableSuppliers, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs rounded-xl bg-white border-slate-200 text-slate-700 gap-1.5 font-medium"
        >
          <Building2 className="h-3.5 w-3.5 text-slate-400" />
          <span className="truncate max-w-[150px]">
            {selectedSupplier ? selectedSupplier.name : 'Asignar Existente'}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-2 space-y-2 rounded-2xl shadow-xl border border-slate-100" align="end">
        <Input
          type="text"
          placeholder="Buscar proveedor o RIF..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 text-xs bg-slate-50"
        />
        <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
          {filtered.map((s: Supplier) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                onSelect(s);
                setOpen(false);
              }}
              className={cn(
                'w-full text-left p-2 rounded-xl text-xs flex flex-col hover:bg-slate-50 transition-colors',
                selectedSupplierId === s.id && 'bg-procarni-primary/10 font-bold text-procarni-primary'
              )}
            >
              <span className="truncate">{s.name}</span>
              <span className="text-[10px] text-slate-400 font-mono">RIF: {s.rif || 'S/N'}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-[11px] text-slate-400 italic text-center py-3">No hay proveedores coincidentes.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
