import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PlusCircle, Trash2, Scale, X, CheckCircle2, ChevronRight, Tags, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSuppliersByMaterial } from '@/integrations/supabase/data';
import { isGenericRif } from '@/utils/validators';

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
}

interface SupplierResult {
  id: string;
  name: string;
  rif: string;
  code?: string;
}

interface QuoteEntry {
  supplierId: string;
  supplierName: string;
  unitPrice: number;
  currency: 'USD' | 'VES';
  exchangeRate?: number;
}

interface ComparisonResult {
  material: MaterialSearchResult;
  results: (QuoteEntry & { convertedPrice: number | null; isValid: boolean; error: string | null })[];
  bestPrice: number | null;
}

interface MaterialQuoteComparisonRowProps {
  comparisonData: ComparisonResult;
  baseCurrency: 'USD' | 'VES'; // This will now always be 'USD' from the parent
  globalExchangeRate?: number;
  onAddQuoteEntry: (materialId: string) => void;
  onRemoveQuoteEntry: (materialId: string, quoteIndex: number) => void;
  // Updated signature to include optional supplierName for supplierId changes
  onQuoteChange: (materialId: string, quoteIndex: number, field: keyof QuoteEntry, value: any, supplierName?: string) => void;
  onRemoveMaterial: (materialId: string) => void;
}

const MaterialQuoteComparisonRow: React.FC<MaterialQuoteComparisonRowProps> = ({
  comparisonData,
  baseCurrency,
  globalExchangeRate,
  onAddQuoteEntry,
  onRemoveQuoteEntry,
  onQuoteChange,
  onRemoveMaterial,
}) => {
  const { material, results, bestPrice } = comparisonData;

  // Fetch suppliers associated with this specific material ID
  const { data: associatedSuppliers, isLoading: isLoadingSuppliers } = useQuery<SupplierResult[]>({
    queryKey: ['suppliersByMaterial', material.id],
    queryFn: async () => {
      const fetchedResults = await getSuppliersByMaterial(material.id);
      return fetchedResults.map((s: any) => ({
        id: s.id,
        name: s.name,
        rif: s.rif,
        code: s.code,
      }));
    },
    enabled: !!material.id,
  });

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null || isNaN(price)) return 'N/A';
    return `${currency} ${price.toFixed(2)}`;
  };

  const supplierOptions = useMemo(() => {
    if (isLoadingSuppliers) {
      return <SelectItem value="__loading__" disabled>Cargando proveedores...</SelectItem>;
    }
    if (!associatedSuppliers || associatedSuppliers.length === 0) {
      return <SelectItem value="__no_suppliers__" disabled>No hay proveedores asociados</SelectItem>;
    }
    return associatedSuppliers.map(supplier => (
      <SelectItem key={supplier.id} value={supplier.id}>
        <div className="flex items-center justify-between w-full gap-2">
          <span>{supplier.name} ({supplier.code || supplier.rif})</span>
          {isGenericRif(supplier.rif) && (
            <span className="flex items-center text-[10px] text-procarni-alert font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 uppercase tracking-tighter ml-auto">
              <AlertTriangle className="h-2.5 w-2.5 mr-1 shrink-0" /> Rif Faltante
            </span>
          )}
        </div>
      </SelectItem>
    ));
  }, [associatedSuppliers, isLoadingSuppliers]);

  const handleSupplierChange = (materialId: string, quoteIndex: number, supplierId: string) => {
    const selectedSupplier = associatedSuppliers?.find(s => s.id === supplierId);
    const supplierName = selectedSupplier?.name || '';

    // Pass both ID and Name back to the parent
    onQuoteChange(materialId, quoteIndex, 'supplierId', supplierId, supplierName);
  };

  return (
    <div className="p-2 sm:p-4">
      <div className="pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-procarni-primary/10 flex items-center justify-center shrink-0">
            <Tags className="h-5 w-5 text-procarni-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-procarni-dark leading-tight">
              {material.name}
            </h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Ref: {material.code}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => onRemoveMaterial(material.id)} className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 self-end sm:self-auto">
          <Trash2 className="h-4 w-4 mr-2" /> Eliminar Material
        </Button>
      </div>

      <div className="pt-4">
        <div className="overflow-x-auto rounded-lg border border-gray-100">
          <Table>
            <TableHeader className="bg-gray-50/80">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[25%] text-xs font-semibold text-gray-500 uppercase tracking-wider">Proveedor</TableHead>
                <TableHead className="w-[15%] text-xs font-semibold text-gray-500 uppercase tracking-wider">Precio Original</TableHead>
                <TableHead className="w-[10%] text-xs font-semibold text-gray-500 uppercase tracking-wider">Moneda</TableHead>
                <TableHead className="w-[15%] text-xs font-semibold text-gray-500 uppercase tracking-wider">Tasa (si VES)</TableHead>
                <TableHead className="w-[20%] text-right font-bold text-xs uppercase tracking-wider text-procarni-dark">Precio Comparado (USD)</TableHead>
                <TableHead className="w-[10%] text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((quote, index) => {
                const isBestPrice = quote.isValid && quote.convertedPrice === bestPrice;

                return (
                  <TableRow
                    key={index}
                    className={cn(
                      "transition-colors",
                      isBestPrice
                        ? "bg-green-50/40 hover:bg-green-50/60 border-l-4 border-procarni-secondary shadow-sm relative z-10"
                        : "hover:bg-gray-50/50 bg-white",
                      !quote.isValid && "bg-red-50/40 text-muted-foreground opacity-75"
                    )}
                  >
                    <TableCell className="pl-3 sm:pl-4 py-3">
                      <Select
                        value={quote.supplierId}
                        onValueChange={(value) => handleSupplierChange(material.id, index, value)}
                        disabled={isLoadingSuppliers}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecciona proveedor" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__placeholder__" disabled>Selecciona proveedor</SelectItem>
                          {supplierOptions}
                          {quote.supplierId && !associatedSuppliers?.some(s => s.id === quote.supplierId) && (
                            <SelectItem value={quote.supplierId}>
                              {quote.supplierName || 'Proveedor Importado'}
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="relative">
                        <span className="absolute left-2.5 top-2 text-gray-400 text-sm">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={quote.unitPrice || ''}
                          onChange={(e) => onQuoteChange(material.id, index, 'unitPrice', parseFloat(e.target.value) || 0)}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          className="h-9 pl-7 bg-white/50 focus:bg-white transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={quote.currency}
                        onValueChange={(value) => onQuoteChange(material.id, index, 'currency', value as 'USD' | 'VES')}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Moneda" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="VES">VES</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {quote.currency === 'VES' && (
                        <Input
                          type="number"
                          step="0.01"
                          value={quote.exchangeRate || globalExchangeRate || ''}
                          onChange={(e) => onQuoteChange(material.id, index, 'exchangeRate', parseFloat(e.target.value) || undefined)}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                          placeholder={globalExchangeRate ? `Global: ${globalExchangeRate}` : 'Tasa'}
                          className="h-9"
                        />
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right py-3", isBestPrice ? "font-bold text-procarni-secondary" : "font-semibold text-gray-700")}>
                      <div className="flex items-center justify-end gap-2">
                        {isBestPrice && <CheckCircle2 className="h-4 w-4 text-procarni-secondary fill-procarni-secondary/20" />}
                        <span className="text-base">{formatPrice(quote.convertedPrice, 'USD')}</span>
                      </div>
                      {!quote.isValid && quote.error && (
                        <p className="text-[10px] text-red-500 mt-1 font-medium">{quote.error}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-3 pr-3 sm:pr-4">
                      <Button variant="ghost" size="icon" onClick={() => onRemoveQuoteEntry(material.id, index)} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50">
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAddQuoteEntry(material.id)}
            className="text-procarni-secondary border-procarni-secondary/30 hover:bg-procarni-secondary/10"
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Nueva Oferta
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MaterialQuoteComparisonRow;