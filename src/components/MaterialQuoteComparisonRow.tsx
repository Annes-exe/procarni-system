import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PlusCircle, Trash2, Scale, X, CheckCircle2, ChevronRight, Tags, AlertTriangle, Link, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSuppliersByMaterial, getAllSuppliers, createSupplierMaterialRelation } from '@/integrations/supabase/data';
import ExchangeRateInput from './ExchangeRateInput';
import SupplierCreationDialog from './SupplierCreationDialog';
import { isGenericRif } from '@/utils/validators';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { useSession } from '@/components/SessionContextProvider';
import { showSuccess, showError } from '@/utils/toast';
import { QuoteEntry } from '@/integrations/supabase/types';

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  unit_id?: string;
}

interface MaterialQuoteComparisonRowProps {
  material: MaterialSearchResult;
  quotes: QuoteEntry[];
  allUnits: any[];
  onAddQuote: (supplierId?: string, supplierName?: string) => void;
  onRemoveQuote: (quoteIndex: number) => void;
  onQuoteChange: (quoteIndex: number, field: keyof QuoteEntry, value: any) => void;
  onRemoveMaterial: () => void;
}

const MaterialQuoteComparisonRow: React.FC<MaterialQuoteComparisonRowProps> = ({
  material,
  quotes,
  allUnits,
  onAddQuote,
  onRemoveQuote,
  onQuoteChange,
  onRemoveMaterial,
}) => {
  const { session } = useSession();
  const userId = session?.user?.id;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [isAssociating, setIsAssociating] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const formatPrice = (price: number | null, currency: string = 'USD') => {
    if (price === null) return '---';
    return price.toLocaleString('es-VE', { style: 'currency', currency: currency || 'USD' });
  };

  // Memoized supplier options for search
  const { data: allSuppliers } = useQuery({
    queryKey: ['allSuppliers'],
    queryFn: getAllSuppliers,
  });

  const { data: associatedSuppliers } = useQuery({
    queryKey: ['suppliersByMaterial', material.id],
    queryFn: () => getSuppliersByMaterial(material.id),
    enabled: !!material.id,
  });

  const supplierOptions = useMemo(() => {
    const associated = associatedSuppliers || [];
    const associatedIds = new Set(associated.map((s: any) => s.id));
    const others = allSuppliers?.filter((s: any) => !associatedIds.has(s.id)) || [];
    return { associated, others };
  }, [allSuppliers, associatedSuppliers]);

  const handleSupplierChange = (quoteIndex: number, supplierId: string, directName?: string) => {
    const selectedSupplier = allSuppliers?.find(s => s.id === supplierId);
    const supplierName = directName || selectedSupplier?.name || '';
    onQuoteChange(quoteIndex, 'supplierId', supplierId);
    onQuoteChange(quoteIndex, 'supplierName', supplierName);
  };

  const handleAssociateSupplier = async (supplierId: string, materialId: string, unitId: string, supplierName: string) => {
    if (!userId || !materialId || !supplierId || !unitId) return;

    const assocKey = `${materialId}-${supplierId}`;
    setIsAssociating(assocKey);
    try {
      const result = await createSupplierMaterialRelation({
        supplier_id: supplierId,
        material_id: materialId,
        unit_id: unitId,
        user_id: userId
      });

      if (result.success) {
        showSuccess(`Proveedor "${supplierName}" asociado al material.`);
        await queryClient.invalidateQueries({ queryKey: ['suppliersByMaterial', materialId] });
      }
    } catch (error) {
      console.error("Error associating supplier:", error);
    } finally {
      setIsAssociating(null);
    }
  };

  const isAssociated = (materialId: string, supplierId: string, unitId?: string) => {
    if (!associatedSuppliers) return true;
    return associatedSuppliers.some(s => s.id === supplierId && (!unitId || s.unit_id === unitId));
  };

  // Group quotes by supplier for the requested "subgroups" view
  const supplierGroups = useMemo(() => {
    const groups: Record<string, { name: string; items: (QuoteEntry & { originalIndex: number })[] }> = {};
    
    quotes.forEach((q, idx) => {
      // Use supplierId as key, or a temp one if not selected
      const key = q.supplierId || `new-${idx}`;
      if (!groups[key]) {
        groups[key] = { 
          name: q.supplierName || 'Nuevo Proveedor', 
          items: [] 
        };
      }
      groups[key].items.push({ ...q, originalIndex: idx });
    });
    
    return Object.entries(groups).map(([id, group]) => ({
      id,
      ...group
    }));
  }, [quotes]);

  const isLoadingSuppliers = !allSuppliers;

  // Sub-component for supplier selection to handle local popover state
  const SupplierSelector = ({ 
    quote, 
    index 
  }: { 
    quote: any, 
    index: number 
  }) => {
    const [open, setOpen] = useState(false);
    const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const handleSupplierCreated = async (newSupplier: any) => {
      await queryClient.invalidateQueries({ queryKey: ['allSuppliers'] });
      handleSupplierChange(index, newSupplier.id, newSupplier.name);
      setIsSupplierDialogOpen(false);
      setOpen(false);
    };

    return (
      <>
        <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-9 px-3 text-left font-normal bg-white/50 focus:bg-white transition-colors",
              !quote.supplierId && "text-muted-foreground"
            )}
            disabled={isLoadingSuppliers}
          >
            <span className="truncate">
              {quote.supplierId 
                ? (quote.supplierName || "Proveedor seleccionado") 
                : "Selecciona proveedor..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar proveedor..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No se encontró proveedor.</CommandEmpty>
              
              {supplierOptions.associated.length > 0 && (
                <CommandGroup heading="Proveedores Sugeridos">
                  {supplierOptions.associated.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => {
                        handleSupplierChange(index, supplier.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          quote.supplierId === supplier.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{supplier.name}</span>
                        {isGenericRif(supplier.rif) && (
                          <span className="text-[10px] text-amber-600 font-medium">Rif Faltante</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {supplierOptions.others.length > 0 && (
                <CommandGroup heading="Otros Proveedores">
                  {supplierOptions.others.map((supplier) => (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => {
                        handleSupplierChange(index, supplier.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          quote.supplierId === supplier.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{supplier.name}</span>
                        {isGenericRif(supplier.rif) && (
                          <span className="text-[10px] text-amber-600 font-medium">Rif Faltante</span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-procarni-primary hover:text-procarni-primary/80 hover:bg-procarni-primary/10"
                onClick={() => {
                  setIsSupplierDialogOpen(true);
                  setOpen(false); // Cierra el popover al abrir el modal
                }}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Nuevo Proveedor
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <SupplierCreationDialog
        isOpen={isSupplierDialogOpen}
        onClose={() => setIsSupplierDialogOpen(false)}
        onSupplierCreated={handleSupplierCreated}
      />
      </>
    );
  };

  return (
    <div className="p-2 sm:p-4">
      <div className="pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-procarni-primary/10 flex items-center justify-center shrink-0">
            <Tags className="h-5 w-5 text-procarni-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-procarni-dark leading-tight flex items-center gap-2">
              {material.name} 
            </h3>
            <p className="text-xs font-mono text-muted-foreground mt-0.5">
              Ref: {material.code} | ID: {material.id.substring(0,8)}...
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemoveMaterial} className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 self-end sm:self-auto">
          <Trash2 className="h-4 w-4 mr-2" /> Eliminar Material
        </Button>
      </div>

      <div className="pt-4">
        {isTablet ? (
          <div className="flex flex-col gap-6">
            {supplierGroups.map((group) => (
              <Card key={group.id} className="border-gray-100 bg-white shadow-sm overflow-hidden border">
                <div className="bg-gray-50/80 p-3 sm:p-4 border-b border-gray-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Proveedor</label>
                      <SupplierSelector quote={group.items[0]} index={group.items[0].originalIndex} />
                    </div>
                    {group.id !== 'new' && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-8 text-[10px] text-procarni-secondary border-procarni-secondary/30 hover:bg-procarni-secondary/10"
                        onClick={() => onAddQuote(group.id, group.name)}
                      >
                        <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Añadir Presentación
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="divide-y divide-gray-50">
                  {group.items.map((quote, itemIdx) => (
                    <div key={`${group.id}-${itemIdx}`} className={cn(
                      "p-3 sm:p-4 transition-colors",
                      quote.isBest ? "bg-procarni-secondary/5" : "bg-white"
                    )}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Unidad / Presentación</label>
                          <Select
                            value={quote.unit_id || 'default'}
                            onValueChange={(val) => onQuoteChange(quote.originalIndex, 'unit_id', val)}
                          >
                            <SelectTrigger className="h-9 text-xs bg-white border-gray-200">
                              <SelectValue placeholder="Seleccionar unidad..." />
                            </SelectTrigger>
                            <SelectContent>
                              {allUnits.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Precio ({quote.currency})</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-400 text-xs font-medium mt-0.5">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={quote.unitPrice || ''}
                              onChange={(e) => onQuoteChange(quote.originalIndex, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="h-9 pl-7 text-sm font-semibold"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Moneda / Tasa</label>
                          <div className="flex gap-2">
                            <Select
                              value={quote.currency}
                              onValueChange={(value) => onQuoteChange(quote.originalIndex, 'currency', value as any)}
                            >
                              <SelectTrigger className="h-9 w-20 text-xs shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="VES">VES</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                              </SelectContent>
                            </Select>
                            <div className="flex-1 min-w-[100px]">
                              <ExchangeRateInput
                                compact
                                baseCurrency={quote.currency === 'EUR' ? 'EUR' : 'USD'}
                                exchangeRate={quote.exchangeRate}
                                onExchangeRateChange={(val) => onQuoteChange(quote.originalIndex, 'exchangeRate', val)}
                                disableAutoFetch={true}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Total USD</span>
                            <div className="flex items-center gap-1.5">
                              {quote.isBest && <CheckCircle2 className="h-3 w-3 text-procarni-secondary" />}
                              <span className={cn("text-sm font-bold", quote.isBest ? "text-procarni-secondary" : "text-procarni-dark")}>
                                {formatPrice(quote.convertedPrice, 'USD')}
                              </span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => onRemoveQuote(quote.originalIndex)}
                            className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-100 rounded-xl bg-white shadow-sm">
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="w-[200px] pl-4 sm:pl-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Proveedor</TableHead>
                  <TableHead className="w-[150px] py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Presentación / Unidad</TableHead>
                  <TableHead className="w-[180px] py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Precio Original</TableHead>
                  <TableHead className="w-[120px] py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Moneda</TableHead>
                  <TableHead className="w-[160px] py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Tasa de Cambio</TableHead>
                  <TableHead className="w-[180px] py-4 text-right pr-12 text-xs font-bold text-gray-500 uppercase tracking-wider">Total USD</TableHead>
                  <TableHead className="w-[50px] py-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierGroups.map((group) => (
                  <React.Fragment key={group.id}>
                    {group.items.map((quote, itemIdx) => {
                      const isFirstInGroup = itemIdx === 0;
                      return (
                        <TableRow 
                          key={`${group.id}-${quote.unit_id}-${itemIdx}`}
                          className={cn(
                            "transition-colors hover:bg-gray-50/50",
                            quote.isBest ? "bg-procarni-secondary/5" : ""
                          )}
                        >
                          <TableCell className="pl-4 sm:pl-6 py-3 align-top">
                            {isFirstInGroup ? (
                              <div className="flex flex-col gap-2">
                                <SupplierSelector quote={quote} index={quote.originalIndex} />
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                  <Select
                                    value={quote.unit_id || ''}
                                    onValueChange={(val) => onQuoteChange(quote.originalIndex, 'unit_id', val)}
                                  >
                                    <SelectTrigger className="h-9 text-xs bg-white/50 border-gray-200">
                                      <SelectValue placeholder={quote.unit_name || "Unidad"} />
                                    </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="default" disabled>Selecciona Unidad</SelectItem>
                                    {allUnits?.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              

                              {quote.supplierId && !isAssociated(material.id, quote.supplierId, quote.unit_id) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 ml-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAssociateSupplier(quote.supplierId, material.id, quote.unit_id || '', quote.supplierName || '');
                                  }}
                                  disabled={isAssociating === `${material.id}-${quote.supplierId}`}
                                  title="Vincular material al proveedor"
                                >
                                  {isAssociating === `${material.id}-${quote.supplierId}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Link className="h-4 w-4" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <div className="relative group">
                              <span className="absolute left-3 top-2.5 text-gray-400 text-xs font-medium">{quote.currency === 'USD' ? '$' : 'Bs'}</span>
                              <Input
                                type="number"
                                step="0.01"
                                value={quote.unitPrice || ''}
                                onChange={(e) => onQuoteChange(quote.originalIndex, 'unitPrice', parseFloat(e.target.value) || 0)}
                                onWheel={(e) => (e.target as HTMLElement).blur()}
                                className="h-9 pl-7 text-sm font-semibold bg-white border-gray-200 focus:border-procarni-secondary focus:ring-procarni-secondary/10 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0.00"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <Select
                              value={quote.currency}
                              onValueChange={(value) => onQuoteChange(quote.originalIndex, 'currency', value as 'USD' | 'VES' | 'EUR')}
                            >
                              <SelectTrigger className="h-9 text-xs bg-white border-gray-200 font-medium">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="VES">VES</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-3">
                            <ExchangeRateInput
                              compact
                              baseCurrency={quote.currency === 'EUR' ? 'EUR' : 'USD'}
                              exchangeRate={quote.exchangeRate}
                              onExchangeRateChange={(val) => onQuoteChange(quote.originalIndex, 'exchangeRate', val)}
                              disableAutoFetch={true}
                            />
                          </TableCell>
                          <TableCell className={cn("text-right py-3 pr-12", quote.isBest ? "font-bold text-procarni-secondary" : "font-semibold text-gray-700")}>
                            <div className="flex items-center justify-end gap-2">
                              {quote.isBest && <CheckCircle2 className="h-4 w-4 text-procarni-secondary fill-procarni-secondary/20" />}
                              <span className="text-sm font-bold">{formatPrice(quote.convertedPrice, 'USD')}</span>
                            </div>
                            {!quote.isValid && quote.error && (
                              <p className="text-[10px] text-red-500 mt-1 font-medium">{quote.error}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-right py-3 pr-4">
                            <Button variant="ghost" size="icon" onClick={() => onRemoveQuote(quote.originalIndex)} className="h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50">
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {group.id !== 'new' && (
                      <TableRow className="bg-gray-50/20 hover:bg-gray-50/20 border-b border-gray-100">
                        <TableCell colSpan={7} className="py-2 pl-6">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 text-[10px] text-procarni-secondary hover:bg-procarni-secondary/10 gap-1"
                            onClick={() => onAddQuote(group.id, group.name)}
                          >
                            <PlusCircle className="h-3 w-3" /> Añadir otra presentación para este proveedor
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-center sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAddQuote('', '')}
          className="text-procarni-secondary border-procarni-secondary/40 hover:bg-procarni-secondary/10 bg-white px-6 h-10 font-bold shadow-sm hover:shadow transition-all"
        >
          <PlusCircle className="mr-2 h-5 w-5" /> Añadir Nuevo Proveedor
        </Button>
      </div>
    </div>
  );
};

export default MaterialQuoteComparisonRow;