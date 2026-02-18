import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const routeMap: Record<string, { label: string; parent?: string }> = {
    '/': { label: 'Inicio' },
    '/quote-request-management': { label: 'Cotizaciones' },
    '/generate-quote': { label: 'Nueva Solicitud', parent: '/quote-request-management' },
    '/purchase-order-management': { label: 'Órdenes de Compra' },
    '/generate-po': { label: 'Nueva Orden', parent: '/purchase-order-management' },
    '/service-order-management': { label: 'Órdenes de Servicio' },
    '/generate-so': { label: 'Nueva Orden', parent: '/service-order-management' },
    '/supplier-management': { label: 'Proveedores' },
    '/suppliers': { label: 'Detalles de Proveedor', parent: '/supplier-management' },
    '/material-management': { label: 'Materiales' },
    '/company-management': { label: 'Empresas' },
    '/bulk-upload': { label: 'Carga Masiva' },
    '/ficha-tecnica-upload': { label: 'Subir Ficha Técnica' },
    '/settings': { label: 'Configuración' },
    '/audit-log': { label: 'Auditoría' },
    '/price-history': { label: 'Historial de Precios' },
    '/purchase-history': { label: 'Historial de Compras' },
    '/quote-comparison': { label: 'Comparación de Precios' },
    '/quote-comparison-management': { label: 'Gestión de Comparaciones' },
    '/search-suppliers-by-material': { label: 'Búsqueda de Proveedores' },
};

export const DynamicBreadcrumbs = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter((x) => x);

    // Handle dynamic routes (e.g., /suppliers/:id)
    // For simplicity in this iteration, we'll map specific known dynamic patterns or just use the current path mapping
    // If a specific ID is present, we might want to show "Detalles" or similar.
    // The current map seems to cover the requested specific cases.

    // Custom logic to build the breadcrumb trail based on the requested logic map
    const getBreadcrumbs = () => {
        const currentPath = location.pathname;
        const config = routeMap[currentPath];

        const crumbs = [];

        // Always start with Home
        crumbs.push({ label: 'Inicio', path: '/' });

        if (currentPath === '/') return crumbs;

        if (config) {
            if (config.parent) {
                const parentConfig = routeMap[config.parent];
                if (parentConfig) {
                    crumbs.push({ label: parentConfig.label, path: config.parent });
                }
            }
            crumbs.push({ label: config.label, path: currentPath, isCurrent: true });
        } else {
            // Fallback for unknown routes or dynamic routes not explicitly mapped yet
            // Try to match partials or just show generic
            // For detail pages like /purchase-orders/:id, we can add some logic
            if (location.pathname.startsWith('/purchase-orders/')) {
                crumbs.push({ label: 'Órdenes de Compra', path: '/purchase-order-management' });
                if (location.pathname.includes('/edit/')) {
                    crumbs.push({ label: 'Editar Orden', path: location.pathname, isCurrent: true });
                } else {
                    crumbs.push({ label: 'Detalles de Orden', path: location.pathname, isCurrent: true });
                }
            } else if (location.pathname.startsWith('/quote-requests/')) {
                crumbs.push({ label: 'Cotizaciones', path: '/quote-request-management' });
                if (location.pathname.includes('/edit/')) {
                    crumbs.push({ label: 'Editar Solicitud', path: location.pathname, isCurrent: true });
                } else {
                    crumbs.push({ label: 'Detalles de Solicitud', path: location.pathname, isCurrent: true });
                }
            } else if (location.pathname.startsWith('/service-orders/')) {
                crumbs.push({ label: 'Órdenes de Servicio', path: '/service-order-management' });
                if (location.pathname.includes('/edit/')) {
                    crumbs.push({ label: 'Editar Orden', path: location.pathname, isCurrent: true });
                } else {
                    crumbs.push({ label: 'Detalles de Orden', path: location.pathname, isCurrent: true });
                }
            } else if (location.pathname.startsWith('/suppliers/')) {
                crumbs.push({ label: 'Proveedores', path: '/supplier-management' });
                crumbs.push({ label: 'Detalles', path: location.pathname, isCurrent: true });
            }
        }

        return crumbs;
    };

    const breadcrumbs = getBreadcrumbs();

    if (breadcrumbs.length <= 1) return null; // Don't show if only Home

    return (
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center text-sm text-gray-500">
            <ol className="flex items-center space-x-2">
                {breadcrumbs.map((crumb, index) => (
                    <li key={crumb.path} className="flex items-center">
                        {index > 0 && <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />}
                        {crumb.isCurrent ? (
                            <span className="font-medium text-gray-900 dark:text-gray-100" aria-current="page">
                                {crumb.label}
                            </span>
                        ) : (
                            <Link
                                to={crumb.path}
                                className="hover:text-procarni-primary transition-colors hover:underline underline-offset-4"
                            >
                                {index === 0 ? <Home className="h-4 w-4" /> : crumb.label}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
};
