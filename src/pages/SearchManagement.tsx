import { m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Users, Zap, FilePlus, ClipboardPlus, BarChart2, AlertCircle, Calendar, ArrowRight, ShieldAlert, CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getAllSuppliers } from '@/integrations/supabase/data';
import { PurchaseOrder, Supplier } from '@/integrations/supabase/types';
import { purchaseOrderService } from '@/services/purchaseOrderService';
import { useNavigate } from 'react-router-dom';
import SearchSuppliersWidget from '@/components/SearchSuppliersWidget';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const SearchManagement = () => {
  const navigate = useNavigate();

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

  // 3. Fetch Orders "Por Pagar"
  const { data: toPayOrders, isLoading: isLoadingToPay } = useQuery({
    queryKey: ['toPayOrders'],
    queryFn: async () => {
      const [posResponse, sosResponse] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, suppliers(name)')
          .in('status', ['Credit', 'ToPay']),
        supabase
          .from('service_orders')
          .select('id, sequence_number, issue_date, credit_days, created_at, status, payment_terms, suppliers(name)')
          .in('status', ['Credit', 'ToPay'])
      ]);

      if (posResponse.error) console.error(posResponse.error);
      if (sosResponse.error) console.error(sosResponse.error);

      const pos = (posResponse.data || []).map(po => {
        const year = po.created_at ? new Date(po.created_at).getFullYear() : new Date().getFullYear();
        const month = po.created_at ? String(new Date(po.created_at).getMonth() + 1).padStart(2, '0') : '01';
        return {
          ...po,
          type: 'purchase_order' as const,
          displayId: `OC-${year}-${month}-${String(po.sequence_number).padStart(3, '0')}`
        };
      });

      const sos = (sosResponse.data || []).map(so => {
        const year = so.created_at ? new Date(so.created_at).getFullYear() : new Date().getFullYear();
        const month = so.created_at ? String(new Date(so.created_at).getMonth() + 1).padStart(2, '0') : '01';
        return {
          ...so,
          type: 'service_order' as const,
          displayId: `OS-${year}-${month}-${String(so.sequence_number).padStart(3, '0')}`
        };
      });

      return [...pos, ...sos].sort((a, b) => {
        const dueA = new Date(a.issue_date || '').getTime() + (a.credit_days || 0) * 24 * 60 * 60 * 1000;
        const dueB = new Date(b.issue_date || '').getTime() + (b.credit_days || 0) * 24 * 60 * 60 * 1000;
        return dueA - dueB;
      });
    }
  });

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
    <m.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-10"
    >
      {/* Header del Dashboard */}
      <m.div variants={itemVariants} className="flex flex-col gap-1.5">
        <h1 className="text-[34px] font-black text-procarni-blue tracking-tighter">Bienvenido al Sistema</h1>
        <p className="text-[13px] text-gray-500 font-medium italic">Gestión integral de compras y servicios para Procarni</p>
      </m.div>

      <div className="grid gap-6 md:grid-cols-2">
        {kpis.map((kpi, index) => (
          <m.div key={index} variants={itemVariants}>
            <Card
              className="group relative overflow-hidden border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem] transition-all duration-500 cursor-pointer"
              onClick={() => navigate(kpi.path)}
            >
              <m.div 
                whileHover={{ y: -8 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="p-7"
              >
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
            </m.div>
            {/* Decoración de fondo */}
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <kpi.icon className="h-24 w-24 -mr-8 -mt-8 rotate-12" />
            </div>
          </Card>
          </m.div>
        ))}
      </div>

      {/* Quick Actions & Search Section */}
      <m.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
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
      </m.div>

      {/* Bento: Cuentas Por Pagar / Ordenes de Compra/Servicios por Pagar */}
      <m.div variants={itemVariants}>
        <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-7 rounded-[2rem]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                  <CreditCard className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-black text-procarni-blue tracking-tight">Órdenes Por Pagar (Crédito)</h2>
              </div>
              <p className="text-[13px] text-gray-500 font-medium italic">Seguimiento de vencimientos de órdenes de compra y servicio a crédito</p>
            </div>
            <div className="text-xs font-black uppercase tracking-[0.2em] text-gray-400">
              Vencimiento
            </div>
          </div>

          {isLoadingToPay ? (
            <div className="text-center py-8 text-gray-500">Cargando cuentas por pagar...</div>
          ) : !toPayOrders || toPayOrders.length === 0 ? (
            <div className="text-center py-10 bg-gray-50/50 border border-dashed border-gray-200 rounded-[1.5rem]">
              <p className="text-gray-500 text-sm font-medium">No hay órdenes pendientes de pago actualmente.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {toPayOrders.map((order: any) => {
                const issueDateObj = new Date(order.issue_date || '');
                const creditDaysVal = order.credit_days || 0;
                const dueDateVal = issueDateObj.getTime() + creditDaysVal * 24 * 60 * 60 * 1000;
                
                // Days calculations
                const daysElapsed = Math.floor((new Date().getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24));
                const daysLeft = Math.ceil((dueDateVal - new Date().getTime()) / (1000 * 60 * 60 * 24));

                let urgencyColor = "border-gray-100 bg-gray-50/20";
                let badgeText = "";
                let badgeColor = "bg-gray-100 text-gray-700";

                if (daysLeft < 0) {
                  urgencyColor = "border-red-100 bg-red-50/20 shadow-sm";
                  badgeText = `Vencido hace ${Math.abs(daysLeft)} días`;
                  badgeColor = "bg-red-100 text-red-700";
                } else if (daysLeft === 0) {
                  urgencyColor = "border-amber-100 bg-amber-50/20 shadow-sm";
                  badgeText = "Vence hoy";
                  badgeColor = "bg-amber-100 text-amber-700";
                } else if (daysLeft <= 2) {
                  urgencyColor = "border-orange-100 bg-orange-50/20 shadow-sm";
                  badgeText = `Quedan ${daysLeft} días`;
                  badgeColor = "bg-orange-100 text-orange-700";
                } else if (daysLeft <= 5) {
                  urgencyColor = "border-yellow-100 bg-yellow-50/20 shadow-sm";
                  badgeText = `Quedan ${daysLeft} días`;
                  badgeColor = "bg-yellow-100 text-yellow-700";
                } else {
                  badgeText = `Quedan ${daysLeft} días`;
                  badgeColor = "bg-green-100 text-green-700";
                }

                return (
                  <div 
                    key={order.id}
                    onClick={() => navigate(order.type === 'purchase_order' ? `/purchase-orders/${order.id}` : `/service-orders/${order.id}`)}
                    className={cn(
                      "group relative p-5 border rounded-[1.5rem] cursor-pointer transition-all duration-300 hover:shadow-md hover:scale-[1.01] flex flex-col justify-between",
                      urgencyColor
                    )}
                  >
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-mono text-xs font-black text-procarni-dark">{order.displayId}</span>
                        <span className={cn("px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider", badgeColor)}>
                          {badgeText}
                        </span>
                      </div>

                      <h4 className="font-bold text-procarni-blue text-sm mb-1 line-clamp-1">
                        {order.suppliers?.name || 'Proveedor Desconocido'}
                      </h4>

                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="h-3 w-3" />
                        <span>Emitido: {new Date(order.issue_date || '').toLocaleDateString('es-VE')}</span>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Antigüedad</span>
                        <span className="text-gray-700 font-semibold">{daysElapsed} días transcurridos</span>
                      </div>
                      <div className="text-indigo-600 group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold">
                        Ver <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </m.div>
    </m.div>
  );
};

export default SearchManagement;