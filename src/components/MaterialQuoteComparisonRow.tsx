import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { PlusCircle, Trash2, Scale, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSuppliersByMaterial } from '@/integrations/supabase/data';

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
        {supplier.name} ({supplier.code || supplier.rif})
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
    <Card className="p-4">
      <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between border-b">
        <CardTitle className="text-lg text-procarni-primary flex items-center">
          <Scale className="mr-2 h-5 w-5" />
          {material.name} ({material.code})
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => onRemoveMaterial(material.id)}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="p-0 pt-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Proveedor</TableHead>
                <TableHead className="w-[15%]">Precio Original</TableHead>
                <TableHead className="w-[10%]">Moneda</TableHead>
                <TableHead className="w-[15%]">Tasa (si VES)</TableHead>
                <TableHead className="w-[20%] text-right font-bold">Precio Comparado (USD)</TableHead>
                <TableHead className="w-[10%] text-right">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((quote, index) => {
                const isBestPrice = quote.isValid && quote.convertedPrice === bestPrice;

                return (
                  <TableRow 
                    key={index} 
                    className={cn(
                      isBestPrice && "bg-green-50/50 dark:bg-green-900/20 border-l-4 border-procarni-secondary",
                      !quote.isValid && "bg-red-50/50 dark:bg-red-900/20 text-muted-foreground"
                    )}
                  >
                    <TableCell>
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
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={quote.unitPrice || ''}
                        onChange={(e) => onQuoteChange(material.id, index, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="h-9"
                      />
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
                          placeholder={globalExchangeRate ? `Global: ${globalExchangeRate}` : 'Tasa'}
                          className="h-9"
                        />
                      )}
                    </TableCell>
                    <TableCell className={cn("text-right font-bold", isBestPrice && "text-procarni-secondary")}>
                      {formatPrice(quote.convertedPrice, 'USD')}
                      {!quote.isValid && quote.error && (
                        <p className="text-xs text-red-600 mt-1">{quote.error}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => onRemoveQuoteEntry(material.id, index)}>
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
          >
            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Cotización
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MaterialQuoteComparisonRow;