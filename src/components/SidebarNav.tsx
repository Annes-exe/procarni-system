"use client";

import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  ShoppingCart, Users, Box, Upload, Building2, Cog, FileUp, 
  ScrollText, Scale, LayoutDashboard, FileQuestion, Briefcase, 
  BarChart3, ChevronDown, Home, Warehouse, Download, Wrench,
  Package, Layers
} from 'lucide-react';
import { useSession } from '@/components/SessionContextProvider';
import { m, AnimatePresence } from 'framer-motion';

const navItems = [
  {
    category: 'Inicio',
    items: [
      { to: '/', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard' },
    ]
  },
  {
    category: 'Operaciones',
    items: [
      { to: '/quote-request-management', icon: <FileQuestion className="h-5 w-5" />, label: 'Cotizaciones' },
      { to: '/purchase-order-management', icon: <ShoppingCart className="h-5 w-5" />, label: 'Órdenes de Compra' },
      { to: '/service-order-management', icon: <Wrench className="h-5 w-5" />, label: 'Órdenes de Servicio' },
      { to: '/quote-comparison-management', icon: <Scale className="h-5 w-5" />, label: 'Gest. Comparaciones' },
    ]
  },
  {
    category: 'Inventario',
    items: [
      { to: '/inventory', icon: <Package className="h-5 w-5" />, label: 'Stock Global' },
      { to: '/inventory/receptions', icon: <Download className="h-5 w-5" />, label: 'Recepciones' },
      { to: '/inventory/dispatches', icon: <Upload className="h-5 w-5" />, label: 'Despachos' },
      { to: '/inventory/kardex', icon: <ScrollText className="h-5 w-5" />, label: 'Historial Kardex' },
      { to: '/inventory/closings', icon: <Cog className="h-5 w-5" />, label: 'Cierres y Ajustes' },
    ]
  },
  {
    category: 'Reportes',
    items: [
      { to: '/reports', icon: <BarChart3 className="h-5 w-5" />, label: 'Centro de Reportes' },
    ]
  },
  {
    category: 'Maestros',
    items: [
      { to: '/supplier-management', icon: <Users className="h-5 w-5" />, label: 'Proveedores' },
      { to: '/material-management', icon: <Layers className="h-5 w-5" />, label: 'Materiales' },
      { to: '/company-management', icon: <Building2 className="h-5 w-5" />, label: 'Empresas' },
    ]
  },
  {
    category: 'Admin',
    items: [
      { to: '/bulk-upload', icon: <Upload className="h-5 w-5" />, label: 'Carga Masiva' },
      { to: '/material-cleanup', icon: <Wrench className="h-5 w-5" />, label: 'Limpiar Catálogo' },
      { to: '/settings', icon: <Cog className="h-5 w-5" />, label: 'Configuración' },
      { to: '/audit-log', icon: <ScrollText className="h-5 w-5" />, label: 'Auditoría' },
    ]
  }
];

const categoryIcons: Record<string, React.ReactNode> = {
  'Inicio': <Home className="h-[18px] w-[18px]" />,
  'Operaciones': <Briefcase className="h-[18px] w-[18px]" />,
  'Inventario': <Warehouse className="h-[18px] w-[18px]" />,
  'Reportes': <BarChart3 className="h-[18px] w-[18px]" />,
  'Maestros': <Box className="h-[18px] w-[18px]" />,
  'Admin': <Cog className="h-[18px] w-[18px]" />,
};

interface SidebarNavProps {
  forceExpanded?: boolean;
}

const SidebarNav = ({ forceExpanded = false }: SidebarNavProps) => {
  const { role } = useSession();
  const location = useLocation();
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  // Filter categories based on role
  const filteredNavItems = navItems.filter(category => {
    if (category.category === 'Admin' && role !== 'admin') {
      return false;
    }
    return true;
  });

  // Auto-open category matching current path
  useEffect(() => {
    const currentPath = location.pathname;
    const activeCategory = filteredNavItems.find(category => 
      category.items.some(item => item.to === currentPath)
    );
    if (activeCategory) {
      setOpenCategories(prev => ({
        ...prev,
        [activeCategory.category]: true
      }));
    }
  }, [location.pathname, role]);

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const springTransition = { type: "spring", damping: 25, stiffness: 200 };

  return (
    <nav className="mt-2 flex flex-col gap-2 px-2">
      {filteredNavItems.map((category) => {
        const hasSubItems = category.items.length > 1;
        const isOpen = !!openCategories[category.category];
        const isCurrentCategoryActive = category.items.some(item => item.to === location.pathname);

        // If it does not have sub-items (e.g. Inicio / Dashboard), render direct NavLink
        if (!hasSubItems) {
          const item = category.items[0];
          const activeClasses = 'bg-procarni-primary/10 text-procarni-primary shadow-sm ring-1 ring-procarni-primary/20';
          const hoverClasses = 'text-gray-500 hover:bg-gray-50 hover:text-procarni-blue hover:translate-x-1';

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex flex-nowrap items-center w-full min-w-0 h-[2.875rem] px-[11px] rounded-[0.9rem] transition-all duration-300 overflow-hidden ${
                  isActive ? activeClasses : hoverClasses
                } justify-start group/item`
              }
              title={!forceExpanded ? item.label : undefined}
            >
              <div className="flex-shrink-0 w-[38px] flex items-center justify-center transition-transform duration-300 group-hover/item:scale-110">
                {React.cloneElement(item.icon as React.ReactElement, { className: 'h-[18px] w-[18px]' })}
              </div>
              <m.span 
                initial={false}
                animate={{ 
                  opacity: forceExpanded ? 1 : 0,
                  x: forceExpanded ? 0 : -20 
                }}
                transition={springTransition}
                className="whitespace-nowrap ml-4 text-[13.5px] font-bold tracking-tight inline-block overflow-hidden text-ellipsis"
              >
                {item.label}
              </m.span>
            </NavLink>
          );
        }

        // Accordion Category
        return (
          <div key={category.category} className="flex flex-col gap-1">
            {/* Accordion Trigger */}
            <button
              onClick={() => toggleCategory(category.category)}
              className={`flex flex-nowrap items-center w-full h-[2.875rem] px-[11px] rounded-[0.9rem] transition-all duration-300 overflow-hidden justify-between group/cat text-left ${
                isCurrentCategoryActive 
                  ? 'text-procarni-primary bg-procarni-primary/5 font-extrabold' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-procarni-blue'
              }`}
              title={!forceExpanded ? category.category : undefined}
            >
              <div className="flex items-center justify-start flex-1 min-w-0">
                <div className="flex-shrink-0 w-[38px] flex items-center justify-center transition-transform duration-300 group-hover/cat:scale-110">
                  {categoryIcons[category.category] || <Box className="h-[18px] w-[18px]" />}
                </div>
                <m.span
                  initial={false}
                  animate={{ 
                    opacity: forceExpanded ? 1 : 0,
                    x: forceExpanded ? 0 : -20 
                  }}
                  transition={springTransition}
                  className="whitespace-nowrap ml-4 text-[13.5px] font-bold tracking-tight inline-block overflow-hidden text-ellipsis"
                >
                  {category.category}
                </m.span>
              </div>

              {/* Chevron indicator */}
              <m.div
                initial={false}
                animate={{ 
                  opacity: forceExpanded ? 1 : 0,
                  rotate: isOpen ? 180 : 0 
                }}
                transition={springTransition}
                className="flex-shrink-0 ml-2"
              >
                <ChevronDown className="h-4 w-4 text-gray-400 group-hover/cat:text-procarni-blue transition-colors" />
              </m.div>
            </button>

            {/* Accordion Content */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  initial="collapsed"
                  animate="open"
                  exit="collapsed"
                  variants={{
                    open: { opacity: 1, height: "auto", transition: { duration: 0.2, ease: "easeOut" } },
                    collapsed: { opacity: 0, height: 0, transition: { duration: 0.15, ease: "easeIn" } }
                  }}
                  className={
                    forceExpanded
                      ? "overflow-hidden flex flex-col gap-1 p-1 bg-gray-50/50 dark:bg-slate-900/30 rounded-2xl border border-gray-100/80 dark:border-slate-800/50 mx-1 my-1"
                      : "overflow-hidden flex flex-col gap-1 mx-0 my-0 border-none bg-transparent p-0"
                  }
                >
                  {category.items.map((item) => {
                    const isOrdersCategory = category.category === 'Operaciones';

                    const activeClasses = isOrdersCategory
                      ? 'bg-procarni-secondary/10 text-procarni-secondary shadow-sm ring-1 ring-procarni-secondary/20'
                      : 'bg-procarni-primary/10 text-procarni-primary shadow-sm ring-1 ring-procarni-primary/20';

                    const hoverClasses = 'text-gray-500 hover:bg-gray-50 hover:text-procarni-blue';

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end
                        className={({ isActive }) => {
                          const heightClass = forceExpanded ? 'h-[2.625rem]' : 'h-[2.875rem]';
                          const paddingClass = forceExpanded ? 'px-2' : 'px-[11px]';
                          const roundedClass = forceExpanded ? 'rounded-xl' : 'rounded-[0.9rem]';
                          
                          return `flex flex-nowrap items-center w-full min-w-0 ${heightClass} ${paddingClass} ${roundedClass} transition-all duration-300 overflow-hidden ${
                            isActive ? activeClasses : hoverClasses
                          } justify-start group/item`;
                        }}
                        title={!forceExpanded ? item.label : undefined}
                      >
                        <div className={`flex-shrink-0 w-[38px] flex items-center justify-center transition-transform duration-300 group-hover/item:scale-110 ${forceExpanded ? 'ml-1' : ''}`}>
                          {React.cloneElement(item.icon as React.ReactElement, { className: 'h-[18px] w-[18px]' })}
                        </div>
                        <m.span 
                          initial={false}
                          animate={{ 
                            opacity: forceExpanded ? 1 : 0,
                            x: forceExpanded ? 0 : -20 
                          }}
                          transition={springTransition}
                          className="whitespace-nowrap ml-3 text-[12.5px] font-semibold tracking-tight inline-block overflow-hidden text-ellipsis"
                        >
                          {item.label}
                        </m.span>
                      </NavLink>
                    );
                  })}
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
};

export default SidebarNav;