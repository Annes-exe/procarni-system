import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import SearchManagement from "./pages/SearchManagement";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import { SessionContextProvider } from "./components/SessionContextProvider";
import GeneratePurchaseOrder from "./pages/GeneratePurchaseOrder";
import GenerateQuoteRequest from "./pages/GenerateQuoteRequest";
import { ShoppingCartProvider } from "./context/ShoppingCartContext";
import SearchSuppliersByMaterial from "./pages/SearchSuppliersByMaterial";
import SupplierDetails from "./pages/SupplierDetails";
import SupplierManagement from "./pages/SupplierManagement";
import MaterialManagement from "./pages/MaterialManagement";
import BulkUpload from "./pages/BulkUpload";
import QuoteRequestManagement from "./pages/QuoteRequestManagement";
import QuoteRequestDetails from "./pages/QuoteRequestDetails";
import EditQuoteRequest from "./pages/EditQuoteRequest";
import CompanyManagement from "./pages/CompanyManagement";
import PurchaseOrderManagement from "./pages/PurchaseOrderManagement";
import PurchaseOrderDetails from "./pages/PurchaseOrderDetails";
import EditPurchaseOrder from "./pages/EditPurchaseOrder";
import Settings from "./pages/Settings";
import FichaTecnicaUpload from "./pages/FichaTecnicaUpload";
import PriceHistory from "./pages/PriceHistory";
import AuditLog from "./pages/AuditLog";
import QuoteComparison from "./pages/QuoteComparison";
import QuoteComparisonManagement from "./pages/QuoteComparisonManagement";
import GenerateServiceOrder from "./pages/GenerateServiceOrder";
import ServiceOrderManagement from "./pages/ServiceOrderManagement";
import ServiceOrderDetails from "./pages/ServiceOrderDetails"; // NEW IMPORT
import EditServiceOrder from "./pages/EditServiceOrder";
import ReportsAnalytics from "./pages/ReportsAnalytics"; // NEW IMPORT
import PurchaseHistory from "./pages/PurchaseHistory"; // NEW IMPORT

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter
        future={{
          v7_relativeSplatPath: true,
          v7_startTransition: true,
        }}
      >
        <SessionContextProvider>
          <ShoppingCartProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<SearchManagement />} />
                <Route path="/generate-quote" element={<GenerateQuoteRequest />} />
                <Route path="/generate-po" element={<GeneratePurchaseOrder />} />
                <Route path="/generate-so" element={<GenerateServiceOrder />} />
                <Route path="/search-suppliers-by-material" element={<SearchSuppliersByMaterial />} />
                <Route path="/suppliers/:id" element={<SupplierDetails />} />
                <Route path="/supplier-management" element={<SupplierManagement />} />
                <Route path="/material-management" element={<MaterialManagement />} />
                <Route path="/bulk-upload" element={<BulkUpload />} />
                <Route path="/quote-request-management" element={<QuoteRequestManagement />} />
                <Route path="/quote-requests/:id" element={<QuoteRequestDetails />} />
                <Route path="/quote-requests/edit/:id" element={<EditQuoteRequest />} />
                <Route path="/company-management" element={<CompanyManagement />} />
                <Route path="/purchase-order-management" element={<PurchaseOrderManagement />} />
                <Route path="/purchase-orders/:id" element={<PurchaseOrderDetails />} />
                <Route path="/purchase-orders/edit/:id" element={<EditPurchaseOrder />} />
                <Route path="/service-order-management" element={<ServiceOrderManagement />} />
                <Route path="/service-orders/:id" element={<ServiceOrderDetails />} />
                <Route path="/service-orders/edit/:id" element={<EditServiceOrder />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/ficha-tecnica-upload" element={<FichaTecnicaUpload />} />
                <Route path="/reports" element={<ReportsAnalytics />} />
                <Route path="/price-history" element={<PriceHistory />} />
                <Route path="/purchase-history" element={<PurchaseHistory />} />
                <Route path="/audit-log" element={<AuditLog />} />
                <Route path="/quote-comparison" element={<QuoteComparison />} />
                <Route path="/quote-comparison-management" element={<QuoteComparisonManagement />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ShoppingCartProvider>
        </SessionContextProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;