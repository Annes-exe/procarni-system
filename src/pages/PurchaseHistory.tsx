import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Filter, Calendar as CalendarIcon, DollarSign, Package, X } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useQuery } from '@tanstack/react-query';
import { getPurchaseHistoryReport, searchSuppliers, searchMaterials, searchMaterialsBySupplier, searchSuppliersByMaterial } from '@/integrations/supabase/data';
import SmartSearch from '@/components/SmartSearch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsMobile } from '@/hooks/use-mobile';
import { Separator } from '@/components/ui/separator';

const PurchaseHistory = () => {
    const isMobile = useIsMobile();
    const [selectedSupplier, setSelectedSupplier] = useState<any | null>(null);
    const [selectedMaterial, setSelectedMaterial] = useState<any | null>(null);
    const [date, setDate] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined,
    });

    const { data: historyData, isLoading, refetch } = useQuery({
        queryKey: ['purchaseHistory', selectedSupplier?.id, selectedMaterial?.id, date.from, date.to],
        queryFn: () => getPurchaseHistoryReport({
            supplierId: selectedSupplier?.id,
            materialId: selectedMaterial?.id,
            startDate: date.from,
            endDate: date.to
        }),
        enabled: false, // Only fetch on manual search
    });

    const handleSearch = () => {
        refetch();
    };

    const handleClearFilters = () => {
        setSelectedSupplier(null);
        setSelectedMaterial(null);
        setDate({ from: undefined, to: undefined });
    };

    // Calculate summaries
    const summary = React.useMemo(() => {
        if (!historyData) return { totalUSD: 0, totalVES: 0, count: 0 };

        return historyData.reduce((acc: any, item: any) => {
            const price = item.unit_price * item.quantity;
            const currency = item.purchase_orders.currency;

            if (currency === 'USD') acc.totalUSD += price;
            else if (currency === 'VES') acc.totalVES += price;

            acc.count += item.quantity;
            return acc;
        }, { totalUSD: 0, totalVES: 0, count: 0 });
    }, [historyData]);

    return (
        <div className="container mx-auto p-4 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Historial de Compras</h1>
                    <p className="text-gray-500 text-sm">Consulta detallada de adquisiciones por proveedor y material.</p>
                </div>
            </div>

            {/* Filters Card */}
            <Card className="border-gray-200 shadow-sm bg-white overflow-visible">
                <CardContent className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                        {/* Supplier Filter */}
                        <div className="md:col-span-6 xl:col-span-3 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Proveedor</label>
                            <SmartSearch
                                placeholder="Buscar proveedor..."
                                onSelect={setSelectedSupplier}
                                fetchFunction={(query) => {
                                    if (selectedMaterial) {
                                        // If material is selected, search only associated suppliers
                                        return searchSuppliersByMaterial(selectedMaterial.id, query);
                                    }
                                    return searchSuppliers(query);
                                }}
                                displayValue={selectedSupplier?.name || ''}
                                className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                                icon={<Search className="h-3 w-3 text-gray-400" />}
                            />
                        </div>

                        {/* Material Filter */}
                        <div className="md:col-span-6 xl:col-span-3 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Material</label>
                            <SmartSearch
                                placeholder="Buscar material..."
                                onSelect={setSelectedMaterial}
                                fetchFunction={(query) => {
                                    if (selectedSupplier) {
                                        // If supplier is selected, search only associated materials
                                        return searchMaterialsBySupplier(selectedSupplier.id, query);
                                    }
                                    return searchMaterials(query);
                                }}
                                displayValue={selectedMaterial?.name || ''}
                                className="bg-gray-50/50 border-gray-200 focus:bg-white transition-colors"
                                icon={<Package className="h-3 w-3 text-gray-400" />}
                            />
                        </div>

                        {/* Date Range Picker */}
                        <div className="md:col-span-8 xl:col-span-4 space-y-1.5">
                            <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Rango de Fecha</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal bg-gray-50/50 border-gray-200 shadow-none hover:bg-gray-100",
                                            !date.from && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-gray-400" />
                                        {date.from ? (
                                            date.to ? (
                                                <span className="text-gray-900 font-medium">
                                                    {format(date.from, "dd/MM/yy")} - {format(date.to, "dd/MM/yy")}
                                                </span>
                                            ) : (
                                                <span className="text-gray-900 font-medium">{format(date.from, "dd/MM/yy")}</span>
                                            )
                                        ) : (
                                            <span className="text-gray-500">Seleccionar fechas</span>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        initialFocus
                                        mode="range"
                                        defaultMonth={date.from}
                                        selected={date}
                                        onSelect={(range: any) => setDate(range || { from: undefined, to: undefined })}
                                        numberOfMonths={2}
                                        locale={es}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Actions */}
                        <div className="md:col-span-4 xl:col-span-2 flex gap-2">
                            <Button
                                className="flex-1 bg-procarni-primary hover:bg-procarni-primary/90 text-white shadow-sm"
                                onClick={handleSearch}
                            >
                                <Search className="mr-2 h-4 w-4" />
                                Buscar
                            </Button>
                            {(selectedSupplier || selectedMaterial || date.from) && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleClearFilters}
                                    className="text-gray-400 hover:text-gray-600"
                                    title="Limpiar filtros"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Summary Cards */}
            {historyData && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white border-gray-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Total (USD)</p>
                                <div className="text-2xl font-bold text-gray-900 flex items-baseline">
                                    <span className="text-sm font-medium text-gray-400 mr-1">$</span>
                                    {summary.totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center">
                                <DollarSign className="h-4 w-4 text-green-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Total (VES)</p>
                                <div className="text-2xl font-bold text-gray-900 flex items-baseline">
                                    <span className="text-sm font-medium text-gray-400 mr-1">Bs</span>
                                    {summary.totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center">
                                <DollarSign className="h-4 w-4 text-blue-600" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-gray-200 shadow-sm">
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1">Items Comprados</p>
                                <div className="text-2xl font-bold text-gray-900">
                                    {summary.count}
                                </div>
                            </div>
                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center">
                                <Package className="h-4 w-4 text-gray-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Results Table */}
            {isLoading ? (
                <div className="text-center py-10">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status"></div>
                    <p className="mt-2 text-sm text-gray-500">Cargando resultados...</p>
                </div>
            ) : historyData && historyData.length > 0 ? (
                isMobile ? (
                    <div className="space-y-4">
                        {historyData.map((item: any) => (
                            <Card key={item.id} className="border-l-4 border-l-procarni-primary/50">
                                <CardContent className="p-4 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0 mr-4">
                                            <h3 className="font-semibold text-gray-900 text-sm truncate">{item.materials?.name}</h3>
                                            <p className="text-xs text-gray-500 truncate">{item.purchase_orders.suppliers.name}</p>
                                        </div>
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                            OC #{item.purchase_orders.sequence_number}
                                        </span>
                                    </div>
                                    <Separator />
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <span className="text-gray-500 block">Fecha</span>
                                            <span className="font-medium">{format(new Date(item.created_at), 'dd/MM/yy')}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-gray-500 block">Cantidad</span>
                                            <span className="font-medium">{item.quantity} {item.unit}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 block">P. Unit</span>
                                            <span className="font-medium">
                                                {item.unit_price.toFixed(2)} {item.purchase_orders.currency}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-gray-500 block">Total</span>
                                            <span className="font-bold text-procarni-primary">
                                                {(item.unit_price * item.quantity).toFixed(2)} {item.purchase_orders.currency}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <Card className="border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead className="w-[100px] text-[11px] uppercase tracking-wider font-semibold text-gray-500">Fecha</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">OC #</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Proveedor</TableHead>
                                        <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Material</TableHead>
                                        <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-gray-500">Cantidad</TableHead>
                                        <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-gray-500">P. Unit</TableHead>
                                        <TableHead className="text-right text-[11px] uppercase tracking-wider font-semibold text-gray-500">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyData.map((item: any) => (
                                        <TableRow key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <TableCell className="text-[13px] text-gray-600 font-medium">
                                                {format(new Date(item.created_at), 'dd/MM/yy')}
                                            </TableCell>
                                            <TableCell className="text-[13px] text-gray-900 font-medium">#{item.purchase_orders.sequence_number}</TableCell>
                                            <TableCell className="text-[13px] text-gray-600 max-w-[200px] truncate" title={item.purchase_orders.suppliers.name}>
                                                {item.purchase_orders.suppliers.name}
                                            </TableCell>
                                            <TableCell className="text-[13px] text-gray-900 font-medium max-w-[250px] truncate" title={item.materials?.name}>
                                                {item.materials?.name || 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-right text-[13px] text-gray-600">
                                                {item.quantity} <span className="text-gray-400 text-xs">{item.unit}</span>
                                            </TableCell>
                                            <TableCell className="text-right text-[13px] text-gray-600">
                                                {item.unit_price.toFixed(2)} <span className="text-xs text-gray-400">{item.purchase_orders.currency}</span>
                                            </TableCell>
                                            <TableCell className="text-right text-[13px] font-bold text-gray-900">
                                                {(item.unit_price * item.quantity).toFixed(2)} <span className="text-xs font-normal text-gray-400">{item.purchase_orders.currency}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                )
            ) : (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-lg">
                    <div className="bg-gray-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="h-8 w-8 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900">Sin resultados</h3>
                    <p className="text-gray-500 max-w-sm mx-auto mt-1">
                        Utiliza los filtros arriba para buscar el historial de compras.
                    </p>
                </div>
            )}

            <MadeWithDyad />
        </div>
    );
};

export default PurchaseHistory;
