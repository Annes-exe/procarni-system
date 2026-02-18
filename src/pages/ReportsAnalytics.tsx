import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, startOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
    Legend
} from 'recharts';
import {
    Calendar as CalendarIcon,
    Filter,
    Download,
    TrendingUp,
    DollarSign,
    ShoppingCart,
    Package,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Import services
import PriceHistoryDownloadButton from '@/components/PriceHistoryDownloadButton';
import SupplierPriceHistoryDownloadButton from '@/components/SupplierPriceHistoryDownloadButton';
import {
    getPurchaseHistoryReport,
    getAllSuppliers,
    getAllMaterials,
    getPriceHistoryByMaterialId
} from '@/integrations/supabase/data';

import { useNavigate } from 'react-router-dom';

// --- Sub-components (Defined before main component) ---

const KpiCard = ({ title, value, prefix = '', isCurrency = true, icon, colorClass }: any) => {
    return (
        <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {title}
                </CardTitle>
                {icon}
            </CardHeader>
            <CardContent>
                <div className={cn("text-2xl font-bold text-gray-900", colorClass)}>
                    {prefix}{typeof value === 'number' ? value.toLocaleString('en-US', { minimumFractionDigits: isCurrency ? 2 : 0, maximumFractionDigits: isCurrency ? 2 : 0 }) : value}
                </div>
            </CardContent>
        </Card>
    );
};

const CustomTooltip = ({ active, payload, label, currency }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white/90 backdrop-blur-md p-3 border border-gray-200 rounded-lg shadow-lg">
                <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                <p className="text-sm font-bold text-gray-900">
                    {currency === 'USD' ? '$' : 'Bs'}{payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
            </div>
        );
    }
    return null;
};

// Price Variation Component (Complex logic separated)
const PriceVariationTab = ({ materials, currency, dateRange }: { materials: any[], currency: string, dateRange: any }) => {
    const navigate = useNavigate();
    const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>([]);

    const { data: priceHistory = [] } = useQuery({
        queryKey: ['priceTrends', selectedMaterialIds, currency],
        queryFn: async () => {
            if (selectedMaterialIds.length === 0) return [];
            const promises = selectedMaterialIds.map(id => getPriceHistoryByMaterialId(id));
            const results = await Promise.all(promises);
            return results;
        },
        enabled: selectedMaterialIds.length > 0
    });

    const chartData = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return [];
        const dateMap: Record<string, any> = {};

        priceHistory.forEach((historyList: any[], index) => {
            const matId = selectedMaterialIds[index];
            const matName = materials.find((m: any) => m.id === matId)?.name || matId;

            historyList.forEach((item: any) => {
                if (item.currency !== currency) return;
                const d = format(new Date(item.recorded_at), 'yyyy-MM-dd');
                if (!dateMap[d]) dateMap[d] = { date: d };
                dateMap[d][matName] = item.unit_price;
            });
        });
        return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
    }, [priceHistory, currency, materials, selectedMaterialIds]);

    // Calculate Variation Data for Table
    const variationTableData = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return [];
        const variations: any[] = [];

        priceHistory.forEach((historyList: any[], index) => {
            const matId = selectedMaterialIds[index];
            const matName = materials.find((m: any) => m.id === matId)?.name || 'Desconocido';

            // Filter by currency and sort descending
            const relevantHistory = historyList
                .filter((item: any) => item.currency === currency)
                .sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

            if (relevantHistory.length >= 2) {
                const latest = relevantHistory[0];
                const previous = relevantHistory[1];
                const change = latest.unit_price - previous.unit_price;
                const percent = (change / previous.unit_price) * 100;

                variations.push({
                    material: matName,
                    currentPrice: latest.unit_price,
                    previousPrice: previous.unit_price,
                    change: change,
                    percent: percent,
                    date: latest.recorded_at,
                    supplier: latest.suppliers?.name,
                    orderId: latest.purchase_order_id // Add orderId
                });
            } else if (relevantHistory.length === 1) {
                const latest = relevantHistory[0];
                variations.push({
                    material: matName,
                    currentPrice: latest.unit_price,
                    previousPrice: 0,
                    change: 0,
                    percent: 0,
                    date: latest.recorded_at,
                    supplier: latest.suppliers?.name,
                    isNew: true,
                    orderId: latest.purchase_order_id // Add orderId
                });
            }
        });
        return variations;
    }, [priceHistory, currency, materials, selectedMaterialIds]);

    const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#7B1FA2'];

    return (
        <div className="space-y-6">
            <Card className="border-gray-200 shadow-sm bg-white">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-lg font-semibold text-gray-800">Tendencia de Precios</CardTitle>
                            <CardDescription>Comparativa de costos unitarios en el tiempo.</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedMaterialIds.length === 1 && (
                                <PriceHistoryDownloadButton
                                    materialId={selectedMaterialIds[0]}
                                    materialName={materials.find((m: any) => m.id === selectedMaterialIds[0])?.name || 'Material'}
                                    variant="outline"
                                />
                            )}
                            <Select
                                value={selectedMaterialIds.length > 0 ? selectedMaterialIds[0] : ""}
                                onValueChange={(val) => {
                                    if (!selectedMaterialIds.includes(val)) {
                                        if (selectedMaterialIds.length >= 5) {
                                            setSelectedMaterialIds([...selectedMaterialIds.slice(1), val]);
                                        } else {
                                            setSelectedMaterialIds([...selectedMaterialIds, val]);
                                        }
                                    }
                                }}
                            >
                                <SelectTrigger className="w-[250px] h-9 text-xs">
                                    <SelectValue placeholder="Agregar material al gráfico" />
                                </SelectTrigger>
                                <SelectContent>
                                    {materials.map((m: any) => (
                                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {selectedMaterialIds.map((id, idx) => {
                            const m = materials.find((mat: any) => mat.id === id);
                            return (
                                <Badge key={id} variant="secondary" className="gap-1 pl-2 pr-1 py-1" style={{ backgroundColor: COLORS[idx % COLORS.length] + '20', color: COLORS[idx % COLORS.length] }}>
                                    {m?.name}
                                    <button onClick={() => setSelectedMaterialIds(prev => prev.filter(x => x !== id))} className="ml-1 hover:bg-black/10 rounded-full p-0.5">
                                        <ArrowDownRight className="h-3 w-3 rotate-45" />
                                    </button>
                                </Badge>
                            )
                        })}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="h-[400px] w-full mt-4">
                        {selectedMaterialIds.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
                                <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                                <p>Selecciona materiales para comparar sus precios</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Legend />
                                    {selectedMaterialIds.map((id, idx) => {
                                        const m = materials.find((mat: any) => mat.id === id);
                                        return (
                                            <Line
                                                key={id}
                                                type="monotone"
                                                dataKey={m?.name}
                                                stroke={COLORS[idx % COLORS.length]}
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                                activeDot={{ r: 6 }}
                                            />
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Variation Table */}
            <Card className="border-gray-200 shadow-sm bg-white">
                <CardHeader className="py-4 border-b">
                    <CardTitle className="text-sm font-medium">Última Variación de Precio</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Material</TableHead>
                                <TableHead>Proveedor</TableHead>
                                <TableHead className="text-right">Precio Actual</TableHead>
                                <TableHead className="text-right">Precio Anterior</TableHead>
                                <TableHead className="text-right">Variación</TableHead>
                                <TableHead className="text-right">Fecha</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {variationTableData.map((item: any, idx) => (
                                <TableRow
                                    key={idx}
                                    className={cn("hover:bg-gray-50/50 transition-colors", item.orderId && "cursor-pointer")}
                                    onClick={() => item.orderId && navigate(`/purchase-orders/${item.orderId}`)}
                                >
                                    <TableCell className="font-medium text-gray-900">{item.material}</TableCell>
                                    <TableCell className="text-gray-500">{item.supplier}</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {currency === 'USD' ? '$' : 'Bs'}{item.currentPrice.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-gray-500">
                                        {item.isNew ? '-' : `${currency === 'USD' ? '$' : 'Bs'}${item.previousPrice.toFixed(2)}`}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {item.isNew ? (
                                            <Badge variant="outline">Nuevo</Badge>
                                        ) : (
                                            <Badge
                                                variant="outline"
                                                className={cn(
                                                    item.change > 0 ? "bg-red-50 text-red-700 border-red-200" :
                                                        item.change < 0 ? "bg-green-50 text-green-700 border-green-200" :
                                                            "bg-gray-50 text-gray-700 border-gray-200"
                                                )}
                                            >
                                                {item.change > 0 && '+'}{item.percent.toFixed(1)}%
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right text-sm text-gray-500">
                                        <div className="flex items-center justify-end gap-1">
                                            {format(new Date(item.date), 'dd/MM/yy')}
                                            {item.orderId && <ArrowUpRight className="h-3 w-3 text-gray-400" />}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {variationTableData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                                        Selecciona materiales para ver sus variaciones.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
};

// --- Main Component ---
const ReportsAnalytics = () => {
    const navigate = useNavigate();
    // --- Global State ---
    const [date, setDate] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined,
    });
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
    const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
    const [selectedMaterialsForTrend, setSelectedMaterialsForTrend] = useState<string[]>([]);

    // --- Data Fetching ---

    // 1. Suppliers for Dropdown
    const { data: suppliers = [] } = useQuery({
        queryKey: ['allSuppliers'],
        queryFn: getAllSuppliers,
    });

    // Find selected supplier name for the button
    const selectedSupplierName = useMemo(() => {
        if (selectedSupplierId === 'all') return '';
        return suppliers.find((s: any) => s.id === selectedSupplierId)?.name || '';
    }, [selectedSupplierId, suppliers]);

    // 2. Materials for Trends
    const { data: materials = [] } = useQuery({
        queryKey: ['allMaterials'],
        queryFn: getAllMaterials,
    });

    // 3. Main Purchase Data (Reports)
    const { data: purchaseData = [], isLoading: isLoadingPurchases } = useQuery({
        queryKey: ['reportsPurchases', date.from, date.to, selectedSupplierId],
        queryFn: () => getPurchaseHistoryReport({
            startDate: date.from,
            endDate: date.to,
            supplierId: selectedSupplierId === 'all' ? undefined : selectedSupplierId,
        }),
    });

    // --- Traceability & Transformations ---

    // Filter by currency directly on the data for calculations
    const filteredData = useMemo(() => {
        return purchaseData.filter((item: any) => item.purchase_orders.currency === currency);
    }, [purchaseData, currency]);

    const kpis = useMemo(() => {
        const totalSpend = filteredData.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);

        // Count unique orders
        const uniqueOrders = new Set(filteredData.map((item: any) => item.purchase_order_id)).size;

        const avgOrderValue = uniqueOrders > 0 ? totalSpend / uniqueOrders : 0;

        // Top Material
        const matGroups: Record<string, number> = {};
        filteredData.forEach((item: any) => {
            const name = item.materials?.name || 'Desconocido';
            matGroups[name] = (matGroups[name] || 0) + (item.unit_price * item.quantity);
        });
        const topMat = Object.entries(matGroups).sort((a, b) => b[1] - a[1])[0];

        return {
            totalSpend,
            totalOrders: uniqueOrders,
            avgOrderValue,
            topMaterial: topMat ? topMat[0] : '-',
            topMaterialSpend: topMat ? topMat[1] : 0
        };
    }, [filteredData]);

    // Tab 1: Cash Flow Data (Monthly)
    const cashFlowData = useMemo(() => {
        const months: Record<string, number> = {};
        filteredData.forEach((item: any) => {
            const m = format(new Date(item.created_at), 'MMM', { locale: es });
            months[m] = (months[m] || 0) + (item.unit_price * item.quantity);
        });
        return Object.entries(months).map(([name, value]) => ({ name, value }));
    }, [filteredData]);

    // Tab 3: Top Suppliers Data
    const topSuppliersData = useMemo(() => {
        const grouped: Record<string, { value: number, orderCount: number, lastDate: string | null, lastOrderId: string | null }> = {};
        filteredData.forEach((item: any) => {
            const supName = item.purchase_orders.suppliers?.name || 'Desconocido';
            if (!grouped[supName]) {
                grouped[supName] = { value: 0, orderCount: 0, lastDate: null, lastOrderId: null };
            }
            grouped[supName].value += (item.unit_price * item.quantity);
            grouped[supName].orderCount += 1;

            // Update last date
            if (!grouped[supName].lastDate || new Date(item.created_at) > new Date(grouped[supName].lastDate!)) {
                grouped[supName].lastDate = item.created_at;
                grouped[supName].lastOrderId = item.purchase_orders?.id;
            }
        });
        return Object.entries(grouped)
            .sort((a, b) => b[1].value - a[1].value) // Sort by Value
            .slice(0, 10) // Top 10
            .map(([name, stats]) => ({ name, ...stats }));
    }, [filteredData]);


    return (
        <div className="min-h-screen bg-gray-50/50 pb-10">
            {/* --- Sticky Header --- */}
            <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-200 px-6 py-4 shadow-sm">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Reportes & Análisis</h1>
                        <p className="text-sm text-gray-500">Inteligencia de negocios y control financiero.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Currency Toggle */}
                        <div className="flex items-center bg-gray-100 rounded-lg p-1 border border-gray-200">
                            <button
                                onClick={() => setCurrency('USD')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    currency === 'USD' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                USD
                            </button>
                            <button
                                onClick={() => setCurrency('VES')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    currency === 'VES' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                                )}
                            >
                                VES
                            </button>
                        </div>

                        {/* Supplier Select */}
                        <div className="flex items-center gap-2">
                            <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                <SelectTrigger className="w-[180px] h-9 bg-white text-xs">
                                    <SelectValue placeholder="Proveedor" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los proveedores</SelectItem>
                                    {suppliers.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedSupplierId !== 'all' && (
                                <SupplierPriceHistoryDownloadButton
                                    supplierId={selectedSupplierId}
                                    supplierName={selectedSupplierName}
                                    variant="outline"
                                    asChild={false}
                                />
                            )}
                        </div>

                        {/* Date Range Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "h-9 justify-start text-left font-normal text-xs bg-white",
                                        !date.from && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-3 w-3" />
                                    {date.from ? (
                                        date.to ? (
                                            <>{format(date.from, "dd/MM/yy")} - {format(date.to, "dd/MM/yy")}</>
                                        ) : (
                                            format(date.from, "dd/MM/yy")
                                        )
                                    ) : (
                                        <span>Seleccionar fechas</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
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
                </div>
            </div>

            <div className="container mx-auto max-w-7xl px-6 pt-8 space-y-8">

                {/* --- KPI Cards --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        title="Gasto Total"
                        value={kpis.totalSpend}
                        prefix={currency === 'USD' ? '$' : 'Bs'}
                        icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
                        colorClass="text-emerald-700"
                    />
                    <KpiCard
                        title="Orden Promedio"
                        value={kpis.avgOrderValue}
                        prefix={currency === 'USD' ? '$' : 'Bs'}
                        icon={<TrendingUp className="h-4 w-4 text-blue-600" />}
                        colorClass="text-blue-700"
                    />
                    <KpiCard
                        title="Total Órdenes"
                        value={kpis.totalOrders}
                        isCurrency={false}
                        icon={<ShoppingCart className="h-4 w-4 text-violet-600" />}
                        colorClass="text-violet-700"
                    />
                    <Card className="bg-white border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Material Top
                            </CardTitle>
                            <Package className="h-4 w-4 text-orange-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-lg font-bold truncate text-gray-900" title={kpis.topMaterial}>
                                {kpis.topMaterial}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {currency === 'USD' ? '$' : 'Bs'}{kpis.topMaterialSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* --- Tabs System --- */}
                <Tabs defaultValue="cashflow" className="space-y-6">
                    <TabsList className="bg-white border border-gray-200 p-1 h-auto">
                        <TabsTrigger value="cashflow" className="px-4 data-[state=active]:bg-gray-100 data-[state=active]:text-procarni-primary">
                            Flujo de Caja
                        </TabsTrigger>
                        <TabsTrigger value="price-variation" className="px-4 data-[state=active]:bg-gray-100 data-[state=active]:text-procarni-primary">
                            Variación de Precios
                        </TabsTrigger>
                        <TabsTrigger value="top-suppliers" className="px-4 data-[state=active]:bg-gray-100 data-[state=active]:text-procarni-primary">
                            Top Proveedores
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Cash Flow */}
                    <TabsContent value="cashflow" className="space-y-6 animate-in fade-in-50">
                        <Card className="border-gray-200 shadow-sm bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-gray-800">Evolución del Gasto</CardTitle>
                                <CardDescription>Análisis temporal de compras en {currency}.</CardDescription>
                            </CardHeader>
                            <CardContent className="pl-0">
                                <div className="h-[350px] w-full mt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={cashFlowData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis
                                                dataKey="name"
                                                stroke="#9ca3af"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <YAxis
                                                stroke="#9ca3af"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(value) => `${currency === 'USD' ? '$' : ''}${value.toLocaleString('en-US', { notation: 'compact' })}`}
                                            />
                                            <Tooltip
                                                content={<CustomTooltip currency={currency} />}
                                                cursor={{ fill: '#f3f4f6' }}
                                            />
                                            <Bar
                                                dataKey="value"
                                                fill="#D32F2F"
                                                radius={[4, 4, 0, 0]}
                                                barSize={40}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
                            <CardHeader className="border-b border-gray-100 bg-gray-50/50 py-4">
                                <CardTitle className="text-sm font-medium">Detalle de Transacciones</CardTitle>
                            </CardHeader>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[120px]">Fecha</TableHead>
                                            <TableHead>Proveedor</TableHead>
                                            <TableHead>Material</TableHead>
                                            <TableHead className="text-right">Monto</TableHead>
                                            <TableHead className="w-[100px] text-right">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredData.slice(0, 10).map((item: any) => (
                                            <TableRow
                                                key={item.id}
                                                className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                                                onClick={() => navigate(`/purchase-orders/${item.purchase_orders.id}`)}
                                            >
                                                <TableCell className="font-medium text-gray-600">
                                                    {format(new Date(item.created_at), 'dd MMM yyyy')}
                                                </TableCell>
                                                <TableCell className="text-gray-900">{item.purchase_orders.suppliers.name}</TableCell>
                                                <TableCell className="text-gray-500 text-sm">{item.materials?.name}</TableCell>
                                                <TableCell className="text-right font-mono font-medium">
                                                    {currency === 'USD' ? '$' : 'Bs'}{(item.unit_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 capitalize">
                                                        {item.purchase_orders.status}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {filteredData.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} className="h-24 text-center text-gray-500">
                                                    No hay datos para este periodo.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Price Variation */}
                    <TabsContent value="price-variation" className="space-y-6 animate-in fade-in-50">
                        <PriceVariationTab materials={materials} currency={currency} dateRange={date} />
                    </TabsContent>

                    {/* Tab 3: Top Suppliers */}
                    <TabsContent value="top-suppliers" className="space-y-6 animate-in fade-in-50">
                        <Card className="border-gray-200 shadow-sm bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-gray-800">Top Proveedores</CardTitle>
                                <CardDescription>Proveedores con mayor volumen de facturación.</CardDescription>
                            </CardHeader>
                            <CardContent className="pl-0">
                                <div className="h-[400px] w-full mt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart layout="vertical" data={topSuppliersData} margin={{ top: 20, right: 30, left: 100, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                            <XAxis
                                                type="number"
                                                stroke="#9ca3af"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                tickFormatter={(value) => `${currency === 'USD' ? '$' : ''}${value.toLocaleString('en-US', { notation: 'compact' })}`}
                                            />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                stroke="#4b5563"
                                                fontSize={12}
                                                tickLine={false}
                                                axisLine={false}
                                                width={150}
                                            />
                                            <Tooltip
                                                content={<CustomTooltip currency={currency} />}
                                                cursor={{ fill: '#f3f4f6' }}
                                            />
                                            <Bar
                                                dataKey="value"
                                                fill="#D32F2F"
                                                radius={[0, 4, 4, 0]}
                                                barSize={20}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
                            <CardHeader className="border-b border-gray-100 bg-gray-50/50 py-4">
                                <CardTitle className="text-sm font-medium">Ranking de Proveedores</CardTitle>
                            </CardHeader>
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[50px]">#</TableHead>
                                            <TableHead>Proveedor</TableHead>
                                            <TableHead className="text-right">Total Comprado</TableHead>
                                            <TableHead className="text-right">Cant. Órdenes</TableHead>
                                            <TableHead className="text-right">Última Compra</TableHead>
                                            <TableHead className="text-right">% del Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {topSuppliersData.map((item: any, index: number) => {
                                            return (
                                                <TableRow key={index} className="hover:bg-gray-50/50">
                                                    <TableCell className="text-gray-500 font-mono">{index + 1}</TableCell>
                                                    <TableCell className="font-medium text-gray-900">{item.name}</TableCell>
                                                    <TableCell className="text-right font-mono font-medium">
                                                        {currency === 'USD' ? '$' : 'Bs'}{item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="text-right text-gray-600">{item.orderCount}</TableCell>
                                                    <TableCell className="text-right text-gray-500 text-sm">
                                                        {item.lastDate ? (
                                                            item.lastOrderId ? (
                                                                <Button
                                                                    variant="link"
                                                                    className="h-auto p-0 text-gray-500 hover:text-blue-600 font-normal"
                                                                    onClick={() => navigate(`/purchase-orders/${item.lastOrderId}`)}
                                                                >
                                                                    {format(new Date(item.lastDate), 'dd/MM/yy')}
                                                                    <ArrowUpRight className="h-3 w-3 ml-1" />
                                                                </Button>
                                                            ) : (
                                                                format(new Date(item.lastDate), 'dd/MM/yy')
                                                            )
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                                                            {((item.value / kpis.totalSpend) * 100).toFixed(1)}%
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default ReportsAnalytics;
