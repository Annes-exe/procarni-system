import { MadeWithDyad } from "@/components/made-with-dyad";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button'; // Import Button
import { Clock, Users, Zap, FilePlus, ClipboardPlus, BarChart2 } from 'lucide-react'; // Import new icons
import { useQuery } from '@tanstack/react-query';
import { getAllPurchaseOrders, getAllSuppliers } from '@/integrations/supabase/data';
import { PurchaseOrder, Supplier } from '@/integrations/supabase/types';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import SearchSuppliersWidget from '@/components/SearchSuppliersWidget';

const SearchManagement = () => {
  const navigate = useNavigate(); // Initialize useNavigate hook

  // 1. Fetch Purchase Orders for Pending Count
  const { data: purchaseOrders, isLoading: isLoadingOrders } = useQuery<PurchaseOrder[]>({
    queryKey: ['purchaseOrders', 'Active'],
    queryFn: () => getAllPurchaseOrders('Active'),
  });

  // Calculate Pending Orders (Draft or Sent)
  const pendingOrdersCount = purchaseOrders?.filter(
    (order) => order.status === 'Draft' || order.status === 'Sent'
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
      description: "Órdenes en estado Borrador o Enviado.",
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
    <div className="container mx-auto p-4"> {/* Added p-4 for consistent padding */}
      {/* KPI Section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 mb-6">
        {kpis.map((kpi, index) => (
          <Card
            key={index}
            className="shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer"
            onClick={() => navigate(kpi.path)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-procarni-primary">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-5 w-5 text-procarni-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900 dark:text-white">
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {kpi.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions & Search Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Quick Actions */}
        <Card className="shadow-lg h-full">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-semibold text-procarni-primary flex items-center">
              <Zap className="mr-2 h-5 w-5" /> Acciones Rápidas
            </CardTitle>
            <CardDescription>Accesos directos a las funciones más utilizadas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3">
              <Button
                variant="outline"
                onClick={() => navigate('/generate-po')}
                className="w-full justify-start text-left h-auto py-3 px-4 border-procarni-primary/30 hover:bg-procarni-primary/10 hover:border-procarni-primary transition-all"
              >
                <div className="flex items-center">
                  <div className="bg-procarni-primary/10 p-2 rounded-full mr-3">
                    <FilePlus className="h-4 w-4 text-procarni-primary" />
                  </div>
                  <div>
                    <span className="font-medium block">Nueva Orden de Compra</span>
                    <span className="text-xs text-muted-foreground">Crear OC para proveedores</span>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/generate-quote')}
                className="w-full justify-start text-left h-auto py-3 px-4 border-procarni-primary/30 hover:bg-procarni-primary/10 hover:border-procarni-primary transition-all"
              >
                <div className="flex items-center">
                  <div className="bg-procarni-primary/10 p-2 rounded-full mr-3">
                    <ClipboardPlus className="h-4 w-4 text-procarni-primary" />
                  </div>
                  <div>
                    <span className="font-medium block">Nueva Solicitud (SC)</span>
                    <span className="text-xs text-muted-foreground">Solicitar cotizaciones</span>
                  </div>
                </div>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/quote-comparison')}
                className="w-full justify-start text-left h-auto py-3 px-4 border-procarni-primary/30 hover:bg-procarni-primary/10 hover:border-procarni-primary transition-all"
              >
                <div className="flex items-center">
                  <div className="bg-procarni-primary/10 p-2 rounded-full mr-3">
                    <BarChart2 className="h-4 w-4 text-procarni-primary" />
                  </div>
                  <div>
                    <span className="font-medium block">Comparar Precios</span>
                    <span className="text-xs text-muted-foreground">Analizar cotizaciones</span>
                  </div>
                </div>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Search Widget */}
        <SearchSuppliersWidget />
      </div>



      <MadeWithDyad />
    </div>
  );
};

export default SearchManagement;