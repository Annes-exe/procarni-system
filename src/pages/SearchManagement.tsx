import React, { useState, useEffect } from 'react';
import { m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Users, Zap, FilePlus, ClipboardPlus, BarChart2, Search, Package, Truck, Boxes, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllSuppliers } from '@/integrations/supabase/data';
import { PurchaseOrder, Supplier } from '@/integrations/supabase/types';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { useNavigate } from 'react-router-dom';
import { getMaterialsInventory, getPurchaseOrdersAprobadas } from '@/integrations/supabase/services/inventoryService';

const SearchManagement = () => {
  const navigate = useNavigate();

  const [lastMaterial, setLastMaterial] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('last_searched_material');
    if (saved) {
      try {
        setLastMaterial(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing last searched material', e);
      }
    }
  }, []);

  // Variantes para animaciones de Framer Motion
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.4, 0, 0.2, 1],
      },
    },
  };

  // 1. Fetch Purchase Orders for Pending Count
  const { data: purchaseOrders, isLoading: isLoadingOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchaseOrders', 'Active'],
    queryFn: async () => await purchaseOrderService.getAll('Active'),
  });

  // Calculate Pending Orders (Draft)
  const pendingOrdersCount = purchaseOrders?.filter(
    (order) => order.status === 'Draft'
  ).length || 0;

  // 2. Fetch Total Suppliers
  const { data: suppliers, isLoading: isLoadingSuppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: getAllSuppliers,
  });

  const totalSuppliersCount = suppliers?.length || 0;

  // 3. Fetch Inventory active items
  const { data: inventoryItems, isLoading: isLoadingInventory } = useQuery({
    queryKey: ['materialsInventory'],
    queryFn: async () => await getMaterialsInventory(false),
  });
  const inventoryItemsCount = inventoryItems?.length || 0;

  // 4. Fetch pending receptions
  const { data: pendingReceptions, isLoading: isLoadingReceptions } = useQuery({
    queryKey: ['purchaseOrdersAprobadas'],
    queryFn: getPurchaseOrdersAprobadas,
  });
  const pendingReceptionsCount = pendingReceptions?.length || 0;

  const itemsToBuyCount = inventoryItems?.filter(item => item.current_stock <= item.min_stock_alert).length || 0;

  const kpis = [
    {
      title: "Órdenes Pendientes",
      value: isLoadingOrders ? "Cargando..." : pendingOrdersCount,
      icon: Clock,
      description: "Órdenes en estado Borrador.",
      path: "/purchase-order-management"
    },
    {
      title: "Proveedores Totales",
      value: isLoadingSuppliers ? "Cargando..." : totalSuppliersCount,
      icon: Users,
      description: "Total de proveedores registrados.",
      path: "/supplier-management"
    },
    {
      title: "Por Comprar",
      value: isLoadingInventory ? "Cargando..." : itemsToBuyCount,
      icon: AlertTriangle,
      description: "Ítems con stock crítico o mínimo.",
      path: "/inventory?filter=LOW_STOCK"
    },
  ];

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-10"
    >
      {/* Header del Dashboard */}
      <m.div variants={itemVariants} className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 md:gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[34px] font-black text-procarni-blue tracking-tighter">Bienvenido al Sistema</h1>
          <p className="text-[13px] text-gray-500 font-medium italic">Gestión integral de compras y servicios para Procarni</p>
        </div>

        {/* Alert & Badge (Desktop Only) */}
        <div className="hidden md:flex flex-col items-end max-w-[320px]">
          <Card className="border-none bg-blue-50/50 ring-1 ring-blue-100/80 p-3 rounded-2xl shadow-sm text-left">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <Search className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-blue-900">Búsqueda de Materiales</p>
                  <p className="text-[11px] text-blue-700 mt-0.5 leading-tight">
                    Para buscar Materiales por Proveedor, utiliza la búsqueda global en la parte superior.
                  </p>
                </div>
              </div>
              {lastMaterial && (
                <button
                  onClick={() => navigate(`/search-suppliers-by-material?query=${encodeURIComponent(lastMaterial.name)}`)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/60 hover:bg-white border border-blue-200/60 transition-colors shadow-sm w-full justify-center"
                >
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[11px] font-bold text-blue-800">
                    Última búsqueda: <span className="font-medium truncate max-w-[150px] inline-block align-bottom">{lastMaterial.name}</span>
                  </span>
                </button>
              )}
            </div>
          </Card>
        </div>
      </m.div>

      <div className="grid gap-6 md:grid-cols-3">
        {kpis.map((kpi, index) => (
          <m.div key={index} variants={itemVariants}>
            <Card
              className="group relative overflow-hidden border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem] transition-all duration-500 cursor-pointer"
              onClick={() => navigate(kpi.path)}
            >
              <m.div
                whileHover={{ y: -8 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="p-3 md:p-6"
              >
                <div className="flex items-center justify-between mb-2 md:mb-4">
                  <div className="p-2 md:p-3 rounded-2xl bg-procarni-primary/5 text-procarni-primary group-hover:bg-procarni-primary group-hover:text-white transition-all duration-500">
                    <kpi.icon className="h-4 w-4 md:h-6 md:w-6" />
                  </div>
                  <div className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-gray-400">
                    Resumen
                  </div>
                </div>
                <div>
                  <div className="text-[32px] md:text-[34px] font-black text-gray-900 tracking-tighter mb-0.5 md:mb-1.5">
                    {kpi.value}
                  </div>
                  <div className="text-[16px] md:text-[17.5px] font-bold text-procarni-blue mb-0.5 md:mb-1">
                    {kpi.title}
                  </div>
                  <p className="text-[12px] md:text-[13px] text-gray-500 font-medium leading-tight">
                    {kpi.description}
                  </p>
                </div>
              </m.div>
              {/* Decoración de fondo */}
              <div className="absolute top-0 right-0 p-2 md:p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <kpi.icon className="h-12 w-12 md:h-24 md:w-24 -mr-3 -mt-3 md:-mr-8 md:-mt-8 rotate-12" />
              </div>
            </Card>
          </m.div>
        ))}
      </div>

      {/* Quick Actions & Search Section */}
      <m.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Quick Actions */}
        <Card className="lg:col-span-12 xl:col-span-5 border-none bg-procarni-blue shadow-2xl rounded-[2rem] overflow-hidden relative group">
          <div className="p-5 md:p-6 relative z-10 space-y-4 md:space-y-5">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Zap className="h-[16px] w-[16px] md:h-[18px] md:w-[18px] text-white" />
                </div>
                <h3 className="text-[18px] md:text-[22px] font-black text-white tracking-tight">Acciones Rápidas</h3>
              </div>
              <p className="text-white/60 text-[11px] md:text-[13px] font-medium italic">Optimiza tu flujo de trabajo diario</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/generate-po')}
                className="w-full h-full min-h-[96px] md:min-h-[110px] p-4 rounded-3xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300 flex-col items-center justify-center text-center"
              >
                <div className="bg-procarni-primary p-3 rounded-xl shadow-lg shadow-procarni-primary/20 group-hover/btn:scale-110 transition-transform mb-2 md:mb-3">
                  <FilePlus className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="font-extrabold text-white text-[11px] md:text-[13px] leading-tight whitespace-normal">Nueva Orden<br className="md:hidden" /> de Compra</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate('/generate-quote')}
                className="w-full h-full min-h-[96px] md:min-h-[110px] p-4 rounded-3xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300 flex-col items-center justify-center text-center"
              >
                <div className="bg-procarni-secondary p-3 rounded-xl shadow-lg shadow-procarni-secondary/20 group-hover/btn:scale-110 transition-transform mb-2 md:mb-3">
                  <ClipboardPlus className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="font-extrabold text-white text-[11px] md:text-[13px] leading-tight whitespace-normal">Nueva Solicitud de<br className="md:hidden" /> Cotización</span>
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate('/quote-comparison')}
                className="col-span-2 md:col-span-1 w-full h-full min-h-[96px] md:min-h-[110px] p-4 rounded-3xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300 flex-row md:flex-col items-center justify-center gap-3 md:gap-0 text-center"
              >
                <div className="bg-blue-500 p-3 rounded-xl shadow-lg shadow-blue-500/20 group-hover/btn:scale-110 transition-transform mb-0 md:mb-3">
                  <BarChart2 className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <span className="font-extrabold text-white text-[11px] md:text-[13px] leading-tight whitespace-normal">Analizar<br className="hidden md:block" /> Cotizaciones</span>
              </Button>
            </div>
          </div>
          {/* Decoración de fondo */}
          <div className="absolute bottom-0 right-0 p-4 opacity-10">
            <Zap className="h-64 w-64 -mr-16 -mb-16 rotate-12 text-white" />
          </div>
        </Card>

        {/* Search Widget Container */}
        <div className="lg:col-span-12 xl:col-span-7 space-y-6">
          <div className="space-y-6">
            {/* Alert & Badge (Mobile Only) */}
            <div className="md:hidden">
              <Card className="border-none bg-blue-50/50 ring-1 ring-blue-100 p-4 rounded-2xl shadow-sm">
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <Search className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-blue-900">Búsqueda de Materiales</p>
                      <p className="text-xs text-blue-700 mt-1">
                        Para buscar Materiales por Proveedor, utiliza la búsqueda global en la parte superior de la pantalla.
                      </p>
                    </div>
                  </div>

                  {lastMaterial && (
                    <button
                      onClick={() => navigate(`/search-suppliers-by-material?query=${encodeURIComponent(lastMaterial.name)}`)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/60 hover:bg-white border border-blue-200/60 shadow-sm w-full justify-center transition-colors"
                    >
                      <Clock className="h-4 w-4 text-blue-500" />
                      <span className="text-xs font-bold text-blue-800">
                        Última búsqueda: <span className="font-medium truncate max-w-[180px] inline-block align-bottom">{lastMaterial.name}</span>
                      </span>
                    </button>
                  )}
                </div>
              </Card>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-400 ml-1">Inventario</h3>
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <Button
                  variant="outline"
                  onClick={() => navigate('/inventory')}
                  className="h-auto min-h-[44px] md:min-h-[56px] flex-col md:flex-row items-center justify-center md:justify-start p-4 gap-2 md:gap-4 rounded-2xl border-slate-200 bg-white shadow-sm"
                >
                  <div className="p-2.5 rounded-full bg-indigo-50 text-indigo-600">
                    <Package className="h-5 w-5" />
                  </div>
                  <span className="text-xs md:text-sm font-bold text-slate-700">Stock Global</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/inventory/receptions')}
                  className="h-auto min-h-[44px] md:min-h-[56px] flex-col md:flex-row items-center justify-center md:justify-start p-4 gap-2 md:gap-4 rounded-2xl border-slate-200 bg-white shadow-sm"
                >
                  <div className="p-2.5 rounded-full bg-emerald-50 text-emerald-600">
                    <Truck className="h-5 w-5" />
                  </div>
                  <span className="text-xs md:text-sm font-bold text-slate-700">Recepción</span>
                </Button>
              </div>

              <Card className="border-none bg-slate-800 text-white p-4 md:p-6 rounded-2xl shadow-xl shadow-slate-200/50">
                <div className="flex items-center justify-between mb-4 md:mb-5">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Boxes className="h-4 w-4 md:h-5 md:w-5" />
                    <span className="text-xs md:text-sm font-bold uppercase tracking-wider">Estadísticas de Almacén</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 md:gap-6">
                  <div>
                    <p className="text-2xl md:text-3xl font-black">{isLoadingInventory ? '...' : inventoryItemsCount}</p>
                    <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1 uppercase tracking-wide leading-tight">Ítems Habilitados</p>
                  </div>
                  <div>
                    <p className="text-2xl md:text-3xl font-black">{isLoadingReceptions ? '...' : pendingReceptionsCount}</p>
                    <p className="text-[10px] md:text-xs text-slate-400 font-medium mt-1 uppercase tracking-wide leading-tight">OCs Pendientes por Recepción</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </m.div>
    </m.div>
  );
};

export default SearchManagement;