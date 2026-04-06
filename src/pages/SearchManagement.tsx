
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // Import Button
import { Clock, Users, Zap, FilePlus, ClipboardPlus, BarChart2 } from 'lucide-react'; // Import new icons
import { useQuery } from '@tanstack/react-query';
import { getAllSuppliers } from '@/integrations/supabase/data';
import { PurchaseOrder, Supplier } from '@/integrations/supabase/types';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import SearchSuppliersWidget from '@/components/SearchSuppliersWidget';

const SearchManagement = () => {
  const navigate = useNavigate(); // Initialize useNavigate hook

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
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-1000 ease-out">
      {/* Header del Dashboard */}
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[34px] font-black text-procarni-blue tracking-tighter">Bienvenido al Sistema</h1>
        <p className="text-[13px] text-gray-500 font-medium italic">Gestión integral de compras y servicios para Procarni</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {kpis.map((kpi, index) => (
          <Card
            key={index}
            className="group relative overflow-hidden border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem] transition-all duration-500 hover:scale-[1.02] hover:shadow-procarni-primary/10 cursor-pointer"
            onClick={() => navigate(kpi.path)}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-2xl bg-procarni-primary/5 text-procarni-primary group-hover:bg-procarni-primary group-hover:text-white transition-all duration-500">
                  <kpi.icon className="h-6 w-6" />
                </div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">
                  Resumen
                </div>
              </div>
              <div>
                <div className="text-[34px] font-black text-gray-900 tracking-tighter mb-1.5">
                  {kpi.value}
                </div>
                <div className="text-[17.5px] font-bold text-procarni-blue mb-1">
                  {kpi.title}
                </div>
                <p className="text-[13px] text-gray-500 font-medium">
                  {kpi.description}
                </p>
              </div>
            </div>
            {/* Decoración de fondo */}
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <kpi.icon className="h-24 w-24 -mr-8 -mt-8 rotate-12" />
            </div>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Search Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Quick Actions */}
        <Card className="lg:col-span-12 xl:col-span-5 border-none bg-procarni-blue shadow-2xl rounded-[2rem] overflow-hidden relative group">
          <div className="p-7 relative z-10 space-y-7">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <Zap className="h-[18px] w-[18px] text-white" />
                </div>
                <h3 className="text-[22px] font-black text-white tracking-tight">Acciones Rápidas</h3>
              </div>
              <p className="text-white/60 text-[13px] font-medium italic">Optimiza tu flujo de trabajo diario</p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/generate-po')}
                className="w-full justify-start h-[4.5rem] px-6 rounded-2xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300"
              >
                <div className="flex items-center w-full">
                  <div className="bg-procarni-primary p-3 rounded-xl shadow-lg shadow-procarni-primary/20 group-hover/btn:scale-110 transition-transform">
                    <FilePlus className="h-[18px] w-[18px] text-white" />
                  </div>
                  <div className="ml-5 text-left">
                    <span className="font-extrabold text-white block text-[15px]">Nueva Orden de Compra</span>
                    <span className="text-[11px] text-white/40 font-medium">Crear documento para proveedores</span>
                  </div>
                </div>
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate('/generate-quote')}
                className="w-full justify-start h-[4.5rem] px-6 rounded-2xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300"
              >
                <div className="flex items-center w-full">
                  <div className="bg-procarni-secondary p-3 rounded-xl shadow-lg shadow-procarni-secondary/20 group-hover/btn:scale-110 transition-transform">
                    <ClipboardPlus className="h-[18px] w-[18px] text-white" />
                  </div>
                  <div className="ml-5 text-left">
                    <span className="font-extrabold text-white block text-[15px]">Nueva Solicitud (SC)</span>
                    <span className="text-[11px] text-white/40 font-medium">Generar requisición de materiales</span>
                  </div>
                </div>
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate('/quote-comparison')}
                className="w-full justify-start h-[4.5rem] px-6 rounded-2xl bg-white/5 hover:bg-white/10 border-none group/btn transition-all duration-300"
              >
                <div className="flex items-center w-full">
                  <div className="bg-blue-500 p-3 rounded-xl shadow-lg shadow-blue-500/20 group-hover/btn:scale-110 transition-transform">
                    <BarChart2 className="h-[18px] w-[18px] text-white" />
                  </div>
                  <div className="ml-5 text-left">
                    <span className="font-extrabold text-white block text-[15px]">Analizar Cotizaciones</span>
                    <span className="text-[11px] text-white/40 font-medium">Comparativa inteligente de ofertas</span>
                  </div>
                </div>
              </Button>
            </div>
          </div>
          {/* Decoración de fondo */}
          <div className="absolute bottom-0 right-0 p-4 opacity-10">
            <Zap className="h-64 w-64 -mr-16 -mb-16 rotate-12 text-white" />
          </div>
        </Card>

        {/* Search Widget Container */}
        <div className="lg:col-span-12 xl:col-span-7">
          <SearchSuppliersWidget />
        </div>
      </div>




    </div>
  );
};

export default SearchManagement;