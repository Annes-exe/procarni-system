import React, { useState, useMemo } from 'react';
import { m } from 'framer-motion';
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
    ArrowDownRight,
    Search
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
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

import PriceHistoryDownloadButton from '@/components/PriceHistoryDownloadButton';
import SupplierPriceHistoryDownloadButton from '@/components/SupplierPriceHistoryDownloadButton';
import { normalizeString } from '@/utils/normalization';
import SmartSearch from '@/components/SmartSearch';
import {
    getPurchaseHistoryReport,
    getAllSuppliers,
    getAllMaterials,
    searchMaterials,
    getPriceHistoryByMaterialId,
    searchMaterialsBySupplier,
    searchSuppliersByMaterial
} from '@/integrations/supabase/data';

import { useNavigate, useSearchParams } from 'react-router-dom';

// --- Sub-components (Defined before main component) ---

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const KpiCard = ({ title, value, subtitle, icon, iconColorClass, delay = 0 }: any) => (
  <m.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
    className="w-full"
  >
    <Card className="group relative overflow-hidden border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem] transition-all duration-500">
      <m.div whileHover={{ y: -6 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn('p-3 rounded-2xl transition-all duration-500', iconColorClass)}>
            {React.cloneElement(icon as React.ReactElement, { className: 'h-5 w-5' })}
          </div>
        </div>
        <div>
          <div className="text-[28px] font-black text-gray-900 tracking-tighter mb-1 leading-tight truncate" title={typeof value === 'string' ? value : undefined}>{value}</div>
          <div className="text-sm font-bold text-procarni-blue mb-0.5">{title}</div>
          {subtitle && <p className="text-[12px] text-gray-500 font-medium">{subtitle}</p>}
        </div>
      </m.div>
      {/* Background icon decoration */}
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        {React.cloneElement(icon as React.ReactElement, { className: 'h-24 w-24 -mr-8 -mt-8 rotate-12' })}
      </div>
    </Card>
  </m.div>
);

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
const PriceVariationTab = ({ materials, currency, dateRange, selectedSupplierId, selectedMaterialIds, setSelectedMaterialIds }: { materials: any[], currency: string, dateRange: any, selectedSupplierId: string, selectedMaterialIds: string[], setSelectedMaterialIds: React.Dispatch<React.SetStateAction<string[]>> }) => {
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [localNames, setLocalNames] = useState<Record<string, string>>({});

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

    const chartSeries = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return [];
        const series = new Set<string>();
        priceHistory.forEach((historyList: any[], index) => {
            const requestedMatName = materials.find((m: any) => m.id === selectedMaterialIds[index])?.name || 'Material';
            
            historyList.forEach((item: any) => {
                if (item.currency !== currency) return;
                const unit = item.units_of_measure?.name || item.unit || item.materials?.unit || 'Und';
                series.add(`${requestedMatName} (${unit})`);
            });
        });
        return Array.from(series);
    }, [priceHistory, currency, materials, selectedMaterialIds]);

    const chartData = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return [];
        const dateMap: Record<string, any> = {};

        priceHistory.forEach((historyList: any[], index) => {
            const requestedMatName = materials.find((m: any) => m.id === selectedMaterialIds[index])?.name || 'Material';
            
            historyList.forEach((item: any) => {
                if (item.currency !== currency) return;
                const unit = item.units_of_measure?.name || item.unit || item.materials?.unit || 'Und';
                const seriesKey = `${requestedMatName} (${unit})`;
                
                const ts = item.recorded_at;
                if (!dateMap[ts]) dateMap[ts] = { date: ts };
                dateMap[ts][seriesKey] = item.unit_price;
            });
        });
        // Sort by ISO timestamp string
        return Object.values(dateMap).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [priceHistory, currency, materials, selectedMaterialIds]);

    // Calculate Variation Data for Table
    const variationTableData = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return [];
        
        // Group all history by seriesKey
        const seriesHistory: Record<string, any[]> = {};
        
        priceHistory.forEach((historyList: any[], index) => {
            const matId = selectedMaterialIds[index];
            const m = materials.find((mat: any) => mat.id === matId);
            // Fallback: Use localNames or name from history records if not found in materials prop
            const requestedMatName = m?.name || localNames[matId] || historyList[0]?.materials?.name || 'Material';
            
            historyList.forEach((item: any) => {
                if (item.currency !== currency) return;
                const unit = item.units_of_measure?.name || item.unit || item.materials?.unit || 'Und';
                const seriesKey = `${requestedMatName} (${unit})`;
                
                if (!seriesHistory[seriesKey]) seriesHistory[seriesKey] = [];
                seriesHistory[seriesKey].push(item);
            });
        });

        const variations: any[] = [];
        Object.entries(seriesHistory).forEach(([seriesKey, history]) => {
            const sorted = history.sort((a: any, b: any) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
            
            if (sorted.length >= 2) {
                const latest = sorted[0];
                const previous = sorted[1];
                const change = latest.unit_price - previous.unit_price;
                const percent = (change / previous.unit_price) * 100;

                variations.push({
                    material: seriesKey,
                    currentPrice: latest.unit_price,
                    previousPrice: previous.unit_price,
                    change: change,
                    percent: percent,
                    date: latest.recorded_at,
                    supplier: latest.suppliers?.name,
                    orderId: latest.purchase_order_id
                });
            } else if (sorted.length === 1) {
                const latest = sorted[0];
                variations.push({
                    material: seriesKey,
                    currentPrice: latest.unit_price,
                    previousPrice: 0,
                    change: 0,
                    percent: 0,
                    date: latest.recorded_at,
                    supplier: latest.suppliers?.name,
                    isNew: true,
                    orderId: latest.purchase_order_id
                });
            }
        });
        
        return variations.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [priceHistory, currency, materials, selectedMaterialIds]);

    const searchMaterialsLocal = async (query: string) => {
        // Use the database RPC search to find all materials (including those without history)
        const dbResults = await searchMaterials(query);
        
        let base = dbResults.map((m: any) => ({ 
            id: m.id, 
            name: m.name,
            code: m.code,
            search_aliases: m.search_aliases || []
        }));

        if (selectedSupplierId !== 'all') {
            const supplierMaterials = await searchMaterialsBySupplier(selectedSupplierId, '');
            const supplierMatIds = new Set(supplierMaterials.map(m => m.id));
            base = base.filter(m => supplierMatIds.has(m.id));
        }

        return base;
    };

    const COLORS = ['#D32F2F', '#1976D2', '#388E3C', '#FBC02D', '#7B1FA2'];

    return (
        <div className="space-y-6">
            <Card className="border-gray-200 shadow-sm bg-white">
                <CardHeader>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <CardTitle className="text-lg font-semibold text-gray-800">Tendencia de Precios</CardTitle>
                            <CardDescription>Comparativa de costos unitarios en el tiempo.</CardDescription>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
                            {selectedMaterialIds.length === 1 && (
                                <PriceHistoryDownloadButton
                                    materialId={selectedMaterialIds[0]}
                                    materialName={materials.find((m: any) => m.id === selectedMaterialIds[0])?.name || 'Material'}
                                    variant="outline"
                                    className="w-full sm:w-auto shadow-sm"
                                />
                            )}
                            <div className="w-full sm:w-[250px]">
                                <SmartSearch
                                    placeholder="Agregar material..."
                                    fetchFunction={searchMaterialsLocal}
                                    onSelect={(item) => {
                                        if (!selectedMaterialIds.includes(item.id)) {
                                            setLocalNames(prev => ({ ...prev, [item.id]: item.name }));
                                            if (selectedMaterialIds.length >= 5) {
                                                setSelectedMaterialIds([...selectedMaterialIds.slice(1), item.id]);
                                            } else {
                                                setSelectedMaterialIds([...selectedMaterialIds, item.id]);
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {selectedMaterialIds.map((id, idx) => {
                            const m = materials.find((mat: any) => mat.id === id);
                            return (
                                <Badge key={id} variant="secondary" className="gap-1 pl-2 pr-1 py-1" style={{ backgroundColor: COLORS[idx % COLORS.length] + '20', color: COLORS[idx % COLORS.length] }}>
                                    {m?.name || localNames[id] || 'Material'}
                                    <button onClick={() => setSelectedMaterialIds(prev => prev.filter(x => x !== id))} className="ml-1 hover:bg-black/10 rounded-full p-0.5">
                                        <ArrowDownRight className="h-3 w-3 rotate-45" />
                                    </button>
                                </Badge>
                            )
                        })}
                    </div>
                </CardHeader>
                <CardContent className="p-2 sm:p-6">
                    <div className={cn("w-full mt-4", isMobile ? "h-[300px]" : "h-[400px]")}>
                        {selectedMaterialIds.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed rounded-lg">
                                <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
                                <p>Selecciona materiales para comparar sus precios</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#9ca3af"
                                        fontSize={12}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(str) => {
                                            try {
                                                return format(parseISO(str), 'dd/MM/yy', { locale: es });
                                            } catch (e) {
                                                return str;
                                            }
                                        }}
                                    />
                                    <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        labelFormatter={(label) => {
                                            try {
                                                return format(parseISO(label), 'PPP p', { locale: es });
                                            } catch (e) {
                                                return label;
                                            }
                                        }}
                                    />
                                    <Legend />
                                    {chartSeries.map((seriesKey, idx) => (
                                        <Line
                                            key={seriesKey}
                                            type="monotone"
                                            dataKey={seriesKey}
                                            stroke={COLORS[idx % COLORS.length]}
                                            strokeWidth={2}
                                            dot={{ r: 3 }}
                                            activeDot={{ r: 6 }}
                                            connectNulls
                                        />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Variation Table */}
            <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
                <CardHeader className="py-4 border-b bg-gray-50/30">
                    <CardTitle className="text-sm font-semibold text-gray-700">Variación de Precios Reciente</CardTitle>
                </CardHeader>
                <div className="rounded-md border-0 sm:border border-gray-100 overflow-hidden bg-white">
                    {isMobile ? (
                        <div className="divide-y divide-gray-100">
                            {variationTableData.map((item: any, idx) => (
                                <div 
                                    key={idx} 
                                    className="p-4 space-y-3 active:bg-gray-50 transition-colors"
                                    onClick={() => item.orderId && navigate(`/purchase-orders/${item.orderId}`)}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1 max-w-[70%]">
                                            <h4 className="font-bold text-procarni-dark text-sm leading-tight">{item.material}</h4>
                                            <p className="text-xs text-gray-500 truncate">{item.supplier}</p>
                                        </div>
                                        {item.isNew ? (
                                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Nuevo</Badge>
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
                                    </div>
                                    <div className="flex justify-between items-end text-sm">
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Precio</p>
                                            <div className="flex items-baseline gap-2">
                                                <span className="font-mono font-bold text-procarni-dark">
                                                    {currency === 'USD' ? '$' : 'Bs'}{item.currentPrice.toFixed(2)}
                                                </span>
                                                {!item.isNew && (
                                                    <span className="font-mono text-xs text-gray-400 line-through">
                                                        {currency === 'USD' ? '$' : 'Bs'}{item.previousPrice.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center justify-end gap-1 text-gray-500 text-xs">
                                                <CalendarIcon className="h-3 w-3" />
                                                {format(new Date(item.date), 'dd/MM/yy')}
                                            </div>
                                            {item.orderId && <p className="text-[10px] text-procarni-primary font-medium mt-1">Ver Orden <ArrowUpRight className="inline h-2 w-2" /></p>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {variationTableData.length === 0 && (
                                <div className="p-8 text-center text-gray-500 text-sm italic">
                                    Selecciona materiales para ver sus variaciones.
                                </div>
                            )}
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-gray-50/50">
                                <TableRow>
                                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3">Material</TableHead>
                                    <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Proveedor</TableHead>
                                    <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Precio Actual</TableHead>
                                    <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Precio Anterior</TableHead>
                                    <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Variación</TableHead>
                                    <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Fecha</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {variationTableData.map((item: any, idx) => (
                                    <TableRow
                                        key={idx}
                                        className={cn("hover:bg-gray-50/50 transition-colors", item.orderId && "cursor-pointer")}
                                        onClick={() => item.orderId && navigate(`/purchase-orders/${item.orderId}`)}
                                    >
                                        <TableCell className="pl-4 py-3 font-medium text-procarni-dark">{item.material}</TableCell>
                                        <TableCell className="py-3 text-gray-600">{item.supplier}</TableCell>
                                        <TableCell className="py-3 text-right font-mono">
                                            {currency === 'USD' ? '$' : 'Bs'}{item.currentPrice.toFixed(2)}
                                        </TableCell>
                                        <TableCell className="py-3 text-right font-mono text-gray-500">
                                            {item.isNew ? '-' : `${currency === 'USD' ? '$' : 'Bs'}${item.previousPrice.toFixed(2)}`}
                                        </TableCell>
                                        <TableCell className="py-3 text-right">
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
                                        <TableCell className="pr-4 py-3 text-right text-sm text-gray-600">
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
                    )}
                </div>
            </Card>
        </div>
    );
};

// --- Main Component ---
const ReportsAnalytics = () => {
    const navigate = useNavigate();
    const isMobile = useIsMobile();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get('tab') || 'search';
    const materialIdFromUrl = searchParams.get('materialId');

    // --- Global State ---
    const [date, setDate] = useState<{ from: Date | undefined; to: Date | undefined }>({
        from: undefined,
        to: undefined,
    });
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('all');
    const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
    const [selectedMaterialsForTrend, setSelectedMaterialsForTrend] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<string>(initialTab);

    // Effect to handle URL parameters for deep linking
    React.useEffect(() => {
        if (materialIdFromUrl && !selectedMaterialsForTrend.includes(materialIdFromUrl)) {
            setSelectedMaterialsForTrend(prev => {
                if (prev.includes(materialIdFromUrl)) return prev;
                // Add to trend if not already there, applying the same limit of 5
                if (prev.length >= 5) {
                    return [...prev.slice(1), materialIdFromUrl];
                }
                return [...prev, materialIdFromUrl];
            });
        }
    }, [materialIdFromUrl]);

    // Handle tab change and update URL
    const handleTabChange = (value: string) => {
        setActiveTab(value);
        setSearchParams(params => {
            params.set('tab', value);
            return params;
        });
    };

    // --- Data Fetching ---

    // 1. Suppliers for Dropdown
    const { data: suppliers = [] } = useQuery({
        queryKey: ['allSuppliers'],
        queryFn: getAllSuppliers,
    });

    const selectedSupplierName = useMemo(() => {
        if (selectedSupplierId === 'all') return 'Todos los proveedores';
        return suppliers.find((s: any) => s.id === selectedSupplierId)?.name || '';
    }, [selectedSupplierId, suppliers]);

    const searchSuppliersLocal = async (query: string) => {
        const q = query.toLowerCase();
        let base = suppliers.map((s: any) => ({ id: s.id, name: s.name }));

        if (selectedMaterialsForTrend.length > 0) {
            let allowedSupplierIds = new Set<string>();
            for (const matId of selectedMaterialsForTrend) {
                const sups = await searchSuppliersByMaterial(matId, '');
                sups.forEach(s => allowedSupplierIds.add(s.id));
            }
            base = base.filter(s => allowedSupplierIds.has(s.id));
        }

        const results = [{ id: 'all', name: 'Todos los proveedores' }, ...base];
        if (!q) return results;
        return results.filter((s: any) => s.name.toLowerCase().includes(q));
    };

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

    // Helper function to safely get the date of a purchase order item for display/sorting/grouping
    const getPurchaseOrderDate = (item: any): Date => {
        if (item.purchase_orders?.issue_date) {
            return new Date(item.purchase_orders.issue_date + 'T12:00:00');
        }
        return new Date(item.purchase_orders?.created_at || item.created_at);
    };

    // --- Traceability & Transformations ---

    // Filter by currency directly on the data for calculations
    const filteredData = useMemo(() => {
        return purchaseData
            .filter((item: any) =>
                item.purchase_orders.currency === currency &&
                ['Approved', 'Archived'].includes(item.purchase_orders.status)
            )
            .sort((a: any, b: any) => getPurchaseOrderDate(b).getTime() - getPurchaseOrderDate(a).getTime());
    }, [purchaseData, currency]);

    const kpis = useMemo(() => {
        const totalSpend = filteredData.reduce((acc: number, item: any) => acc + (item.unit_price * item.quantity), 0);

        // Count unique orders using order_id from purchase_order_items
        const uniqueOrders = new Set(filteredData.map((item: any) => item.order_id)).size;

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
            const m = format(getPurchaseOrderDate(item), 'MMM', { locale: es });
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
            const itemDate = getPurchaseOrderDate(item);
            if (!grouped[supName].lastDate || itemDate > new Date(grouped[supName].lastDate!)) {
                grouped[supName].lastDate = itemDate.toISOString();
                grouped[supName].lastOrderId = item.purchase_orders?.id;
            }
        });
        return Object.entries(grouped)
            .sort((a, b) => b[1].value - a[1].value) // Sort by Value
            .slice(0, 10) // Top 10
            .map(([name, stats]) => ({ name, ...stats }));
    }, [filteredData]);

    // Tab Search: Filtering and Frequency
    const searchResults = useMemo(() => {
        let results = filteredData;
        if (searchQuery.trim()) {
            const query = normalizeString(searchQuery);
            results = results.filter((item: any) => {
                const nameMatch = normalizeString(item.materials?.name || '').includes(query);
                const supplierMatch = normalizeString(item.purchase_orders?.suppliers?.name || '').includes(query);
                const aliasMatch = item.materials?.search_aliases?.some((alias: string) => normalizeString(alias).includes(query));
                return nameMatch || supplierMatch || aliasMatch;
            });
        }
        return results;
    }, [filteredData, searchQuery]);

    const materialFrequencies = useMemo(() => {
        const freqs: Record<string, number> = {};
        filteredData.forEach((item: any) => {
            const name = item.materials?.name || 'Desconocido';
            freqs[name] = (freqs[name] || 0) + 1;
        });
        return freqs;
    }, [filteredData]);

    return (
        <div className="container mx-auto p-4 pb-20">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-extrabold text-procarni-dark tracking-tight">Reportes & Análisis</h1>
                    <p className="text-muted-foreground text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-procarni-primary" />
                        Monitoreo inteligente de costos y proveedores.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
                    {/* Currency Toggle */}
                    <div className="flex items-center bg-gray-100/80 backdrop-blur-sm rounded-lg p-1 border border-gray-200 self-start sm:self-auto">
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
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 sm:flex-initial">
                        <div className="w-full sm:w-[220px]">
                            <SmartSearch
                                placeholder="Buscar proveedor..."
                                displayValue={selectedSupplierName}
                                selectedId={selectedSupplierId}
                                fetchFunction={searchSuppliersLocal}
                                onSelect={(item) => setSelectedSupplierId(item.id)}
                            />
                        </div>
                        {selectedSupplierId !== 'all' && (
                            <SupplierPriceHistoryDownloadButton
                                supplierId={selectedSupplierId}
                                supplierName={selectedSupplierName}
                                variant="outline"
                                asChild={false}
                                className="shadow-sm"
                            />
                        )}
                    </div>

                    {/* Date Range Picker */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "h-9 justify-start text-left font-normal text-xs bg-white shadow-sm w-full sm:w-auto",
                                    !date.from && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-gray-500" />
                                {date.from ? (
                                    date.to ? (
                                        <>{format(date.from, "dd/MM/yy")} - {format(date.to, "dd/MM/yy")}</>
                                    ) : (
                                        format(date.from, "dd/MM/yy")
                                    )
                                ) : (
                                    <span>Seleccionar periodo</span>
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
                                numberOfMonths={isMobile ? 1 : 2}
                                locale={es}
                            />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-8">

                {/* --- KPI Cards --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <KpiCard
                        title="Gasto Total"
                        value={`${currency === 'USD' ? '$' : 'Bs'}${fmt(kpis.totalSpend)}`}
                        icon={<DollarSign />}
                        iconColorClass="bg-emerald-50 text-emerald-600"
                        delay={0}
                    />
                    <KpiCard
                        title="Orden Promedio"
                        value={`${currency === 'USD' ? '$' : 'Bs'}${fmt(kpis.avgOrderValue)}`}
                        icon={<TrendingUp />}
                        iconColorClass="bg-blue-50 text-blue-600"
                        delay={0.1}
                    />
                    <KpiCard
                        title="Total Órdenes"
                        value={kpis.totalOrders}
                        icon={<ShoppingCart />}
                        iconColorClass="bg-violet-50 text-violet-600"
                        delay={0.2}
                    />
                    <KpiCard
                        title="Material Top"
                        value={kpis.topMaterial}
                        subtitle={kpis.topMaterial !== '-' ? `${currency === 'USD' ? '$' : 'Bs'}${fmt(kpis.topMaterialSpend)}` : 'Sin compras'}
                        icon={<Package />}
                        iconColorClass="bg-orange-50 text-orange-600"
                        delay={0.3}
                    />
                </div>

                {/* --- Tabs System --- */}
                <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                    <TabsList className="bg-gray-100/50 border border-gray-200 p-1 h-auto flex flex-nowrap overflow-x-auto scrollbar-hide justify-start sm:justify-center">
                        <TabsTrigger value="search" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
                            Buscador
                        </TabsTrigger>
                        <TabsTrigger value="cashflow" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
                            Flujo de Caja
                        </TabsTrigger>
                        <TabsTrigger value="price-variation" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
                            Tendencias
                        </TabsTrigger>
                        <TabsTrigger value="top-suppliers" className="px-4 py-2 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-white data-[state=active]:text-procarni-primary data-[state=active]:shadow-sm">
                            Proveedores
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab: Buscador de Compras */}
                    <TabsContent value="search" className="space-y-6 animate-in fade-in-50">
                        <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
                            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 bg-gray-50/50">
                                <div>
                                    <CardTitle className="text-lg font-semibold text-gray-800">Historial Detallado</CardTitle>
                                    <CardDescription>
                                        Encuentra rápidamente qué se compró, cuándo, a quién y por cuánto.
                                    </CardDescription>
                                </div>
                                <div className="relative w-full sm:w-[300px]">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                                    <Input
                                        type="text"
                                        placeholder="Buscar material o proveedor..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 bg-white w-full h-9"
                                    />
                                </div>
                            </CardHeader>
                            <div className="rounded-md overflow-hidden bg-white max-h-[600px] overflow-y-auto">
                                {isMobile ? (
                                    <div className="divide-y divide-gray-100">
                                        {searchResults.map((item: any) => (
                                            <div 
                                                key={item.id} 
                                                className="p-4 space-y-3 active:bg-gray-50 transition-colors"
                                                onClick={() => navigate(`/purchase-orders/${item.purchase_orders.id}`)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1 max-w-[70%]">
                                                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                                            {format(getPurchaseOrderDate(item), 'dd/MM/yyyy')}
                                                        </span>
                                                        <h4 className="font-bold text-procarni-dark text-sm leading-tight">{item.materials?.name}</h4>
                                                    </div>
                                                    <Badge variant="outline" className="text-procarni-primary bg-procarni-primary/10 border-transparent">
                                                        #{item.purchase_orders.sequence_number || 'OC'}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Proveedor</p>
                                                        <p className="text-gray-700 truncate text-xs">{item.purchase_orders.suppliers.name}</p>
                                                    </div>
                                                    <div className="text-right space-y-1">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Total</p>
                                                        <p className="font-mono font-bold text-procarni-dark text-xs">
                                                            {currency === 'USD' ? '$' : 'Bs'}{(item.unit_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-1 border-t border-gray-50">
                                                    <span className="text-[10px] text-gray-400">
                                                        {item.quantity} {item.units_of_measure?.name || item.unit || 'Und'}
                                                    </span>
                                                    <span className="text-[10px] text-procarni-primary font-medium flex items-center gap-1">
                                                        Ver detalles <ArrowUpRight className="h-2.5 w-2.5" />
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {searchResults.length === 0 && (
                                            <div className="p-12 text-center text-gray-500 italic text-sm">
                                                No se encontraron resultados.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-gray-50/50 sticky top-0 z-10 shadow-sm">
                                            <TableRow>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3 w-[120px]">Fecha</TableHead>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Material</TableHead>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Proveedor</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Cant.</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Precio Unit.</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Total</TableHead>
                                                <TableHead className="text-center font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3 w-[80px]">O.C.</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {searchResults.map((item: any) => (
                                                <TableRow
                                                    key={item.id}
                                                    className="hover:bg-gray-50/80 transition-colors"
                                                >
                                                    <TableCell className="pl-4 py-3 text-sm text-gray-600">
                                                        {format(getPurchaseOrderDate(item), 'dd/MM/yyyy')}
                                                    </TableCell>
                                                    <TableCell className="py-3">
                                                        <div className="flex flex-col">
                                                            <span className="text-procarni-dark font-medium text-sm">{item.materials?.name}</span>
                                                            <span className="text-[10px] text-muted-foreground mt-0.5" title="Frecuencia de compra en el periodo">
                                                                Comprado {materialFrequencies[item.materials?.name || 'Desconocido']} veces
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-3 text-gray-600 text-sm">{item.purchase_orders.suppliers.name}</TableCell>
                                                    <TableCell className="py-3 text-right text-sm">
                                                        {item.quantity} <span className="text-xs text-gray-400">{item.units_of_measure?.name || item.unit || item.materials?.unit || 'Und'}</span>
                                                    </TableCell>
                                                    <TableCell className="py-3 text-right font-mono text-sm">
                                                        {currency === 'USD' ? '$' : 'Bs'}{item.unit_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="py-3 text-right font-mono font-medium text-sm text-procarni-dark">
                                                        {currency === 'USD' ? '$' : 'Bs'}{(item.unit_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="pr-4 py-3 text-center">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-procarni-primary hover:bg-procarni-primary/10" onClick={() => navigate(`/purchase-orders/${item.purchase_orders.id}`)} title={`Ver ${item.purchase_orders.sequence_number || 'Orden'}`}>
                                                            <ArrowUpRight className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            {searchResults.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="h-32 text-center text-gray-500">
                                                        {filteredData.length === 0
                                                            ? "No hay compras registradas en este periodo con los filtros actuales."
                                                            : "No se encontraron coincidencias para la búsqueda."}
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        </Card>
                    </TabsContent>

                    {/* Tab 1: Cash Flow */}
                    <TabsContent value="cashflow" className="space-y-6 animate-in fade-in-50">
                        <Card className="border-gray-200 shadow-sm bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-gray-800">Evolución del Gasto</CardTitle>
                                <CardDescription>Análisis temporal de compras en {currency}.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-2 sm:p-6">
                                <div className={cn("w-full mt-4", isMobile ? "h-[280px]" : "h-[350px]")}>
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
                                <CardTitle className="text-sm font-medium">Últimas 10 Transacciones (Desglose)</CardTitle>
                            </CardHeader>
                            <div className="rounded-md border-0 sm:border border-gray-100 overflow-hidden bg-white">
                                {isMobile ? (
                                    <div className="divide-y divide-gray-100">
                                        {filteredData.slice(0, 10).map((item: any) => (
                                            <div 
                                                key={item.id} 
                                                className="p-4 space-y-3 active:bg-gray-50 transition-colors"
                                                onClick={() => navigate(`/purchase-orders/${item.purchase_orders.id}`)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
                                                            {format(getPurchaseOrderDate(item), 'dd MMM yyyy')}
                                                        </span>
                                                        <h4 className="font-bold text-procarni-dark text-sm leading-tight">{item.purchase_orders.suppliers.name}</h4>
                                                    </div>
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] h-5 py-0 px-2 capitalize">
                                                        {item.purchase_orders.status}
                                                    </Badge>
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div className="space-y-1 max-w-[60%]">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Material</p>
                                                        <p className="text-gray-600 truncate text-xs">{item.materials?.name}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Monto</p>
                                                        <p className="font-mono font-bold text-procarni-dark text-sm">
                                                            {currency === 'USD' ? '$' : 'Bs'}{(item.unit_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {filteredData.length === 0 && (
                                            <div className="p-8 text-center text-gray-500 text-sm">
                                                No hay datos para este periodo.
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-gray-50/50">
                                            <TableRow>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3 w-[120px]">Fecha</TableHead>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Proveedor</TableHead>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Material</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Monto</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3 w-[100px]">Estado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredData.slice(0, 10).map((item: any) => (
                                                <TableRow
                                                    key={item.id}
                                                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                                                    onClick={() => navigate(`/purchase-orders/${item.purchase_orders.id}`)}
                                                >
                                                    <TableCell className="pl-4 py-3 font-medium text-gray-600">
                                                        {format(getPurchaseOrderDate(item), 'dd MMM yyyy')}
                                                    </TableCell>
                                                    <TableCell className="py-3 text-procarni-dark">{item.purchase_orders.suppliers.name}</TableCell>
                                                    <TableCell className="py-3 text-gray-500 text-sm">{item.materials?.name}</TableCell>
                                                    <TableCell className="py-3 text-right font-mono font-medium">
                                                        {currency === 'USD' ? '$' : 'Bs'}{(item.unit_price * item.quantity).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                    </TableCell>
                                                    <TableCell className="pr-4 py-3 text-right">
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
                                )}
                            </div>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Price Variation */}
                    <TabsContent value="price-variation" className="space-y-6 animate-in fade-in-50">
                        <PriceVariationTab
                            materials={materials}
                            currency={currency}
                            dateRange={date}
                            selectedSupplierId={selectedSupplierId}
                            selectedMaterialIds={selectedMaterialsForTrend}
                            setSelectedMaterialIds={setSelectedMaterialsForTrend}
                        />
                    </TabsContent>

                    {/* Tab 3: Top Suppliers */}
                    <TabsContent value="top-suppliers" className="space-y-6 animate-in fade-in-50">
                        <Card className="border-gray-200 shadow-sm bg-white">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-gray-800">Top Proveedores</CardTitle>
                                <CardDescription>Proveedores con mayor volumen de facturación.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-2 sm:p-6">
                                <div className={cn("w-full mt-4", isMobile ? "h-[350px]" : "h-[400px]")}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            layout={isMobile ? "horizontal" : "vertical"} 
                                            data={topSuppliersData.slice(0, isMobile ? 3 : 10)} 
                                            margin={{ top: 20, right: 30, left: isMobile ? 20 : 100, bottom: isMobile ? 40 : 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={isMobile} horizontal={!isMobile} stroke="#e5e7eb" />
                                            {isMobile ? (
                                                <>
                                                    <XAxis
                                                        dataKey="name"
                                                        type="category"
                                                        stroke="#4b5563"
                                                        fontSize={10}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        interval={0}
                                                        angle={-45}
                                                        textAnchor="end"
                                                        height={60}
                                                    />
                                                    <YAxis
                                                        type="number"
                                                        stroke="#9ca3af"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickFormatter={(value) => `${currency === 'USD' ? '$' : ''}${value.toLocaleString('en-US', { notation: 'compact' })}`}
                                                    />
                                                </>
                                            ) : (
                                                <>
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
                                                </>
                                            )}
                                            <Tooltip
                                                content={<CustomTooltip currency={currency} />}
                                                cursor={{ fill: '#f3f4f6' }}
                                            />
                                            <Bar
                                                dataKey="value"
                                                fill="#D32F2F"
                                                radius={isMobile ? [4, 4, 0, 0] : [0, 4, 4, 0]}
                                                barSize={isMobile ? 40 : 20}
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
                            <div className="rounded-md border-0 sm:border border-gray-100 overflow-hidden bg-white">
                                {isMobile ? (
                                    <div className="divide-y divide-gray-100">
                                        {topSuppliersData.slice(0, 5).map((item: any, index: number) => (
                                            <div key={index} className="p-4 space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                                                            {index + 1}
                                                        </span>
                                                        <h4 className="font-bold text-procarni-dark text-sm">{item.name}</h4>
                                                    </div>
                                                    <Badge variant="secondary" className="bg-gray-100 text-gray-700 text-[10px]">
                                                        {((item.value / kpis.totalSpend) * 100).toFixed(1)}% del total
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4 text-sm">
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Total Facturado</p>
                                                        <p className="font-mono font-bold text-procarni-dark text-xs">
                                                            {currency === 'USD' ? '$' : 'Bs'}{item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                    <div className="text-right space-y-1">
                                                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Órdenes</p>
                                                        <p className="text-gray-600 text-xs font-medium">{item.orderCount} transacciones</p>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                                    <span className="text-[10px] text-gray-400">
                                                        Última: {item.lastDate ? format(new Date(item.lastDate), 'dd/MM/yy') : '-'}
                                                    </span>
                                                    {item.lastOrderId && (
                                                        <Button
                                                            variant="link"
                                                            className="h-auto p-0 text-[10px] text-procarni-primary hover:text-procarni-primary/80 font-medium"
                                                            onClick={() => navigate(`/purchase-orders/${item.lastOrderId}`)}
                                                        >
                                                            Ver última OC <ArrowUpRight className="h-2.5 w-2.5 ml-0.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-gray-50/50">
                                            <TableRow>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3 w-[50px]">#</TableHead>
                                                <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Proveedor</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Total Comprado</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Cant. Órdenes</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Última Compra</TableHead>
                                                <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">% del Total</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {topSuppliersData.map((item: any, index: number) => {
                                                return (
                                                    <TableRow key={index} className="hover:bg-gray-50/50">
                                                        <TableCell className="pl-4 py-3 text-gray-500 font-mono">{index + 1}</TableCell>
                                                        <TableCell className="py-3 font-medium text-procarni-dark">{item.name}</TableCell>
                                                        <TableCell className="py-3 text-right font-mono font-medium">
                                                            {currency === 'USD' ? '$' : 'Bs'}{item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                        </TableCell>
                                                        <TableCell className="py-3 text-right text-gray-600">{item.orderCount}</TableCell>
                                                        <TableCell className="py-3 text-right text-gray-500 text-sm">
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
                                                        <TableCell className="pr-4 py-3 text-right">
                                                            <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                                                                {((item.value / kpis.totalSpend) * 100).toFixed(1)}%
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};

export default ReportsAnalytics;
