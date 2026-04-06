"use client";

import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingCart, Users, Box, Upload, Building2, Cog, FileUp, ScrollText, Scale, LayoutDashboard, FileQuestion, Briefcase, BarChart3 } from 'lucide-react';
import { useSession } from '@/components/SessionContextProvider';

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
      { to: '/service-order-management', icon: <Briefcase className="h-5 w-5" />, label: 'Órdenes de Servicio' },
    ]
  },
  {
    category: 'Reportes',
    items: [
      { to: '/reports', icon: <BarChart3 className="h-5 w-5" />, label: 'Centro de Reportes' },
      { to: '/quote-comparison-management', icon: <Scale className="h-5 w-5" />, label: 'Gest. Comparaciones' },
    ]
  },
  {
    category: 'Maestros',
    items: [
      { to: '/supplier-management', icon: <Users className="h-5 w-5" />, label: 'Proveedores' },
      { to: '/material-management', icon: <Box className="h-5 w-5" />, label: 'Materiales' },
      { to: '/company-management', icon: <Building2 className="h-5 w-5" />, label: 'Empresas' },
    ]
  },
  {
    category: 'Admin',
    items: [
      { to: '/bulk-upload', icon: <Upload className="h-5 w-5" />, label: 'Carga Masiva' },
      { to: '/settings', icon: <Cog className="h-5 w-5" />, label: 'Configuración' },
      { to: '/audit-log', icon: <ScrollText className="h-5 w-5" />, label: 'Auditoría' },
    ]
  }
];

interface SidebarNavProps {
  forceExpanded?: boolean;
}

const SidebarNav = ({ forceExpanded = false }: SidebarNavProps) => {
  const { role } = useSession();

  // Filter categories based on role
  const filteredNavItems = navItems.filter(category => {
    if (category.category === 'Admin' && role !== 'admin') {
      return false;
    }
    return true;
  });

  return (
    <nav className="mt-2 flex flex-col gap-5 px-2">
      {filteredNavItems.map((category) => (
        <div key={category.category} className="flex flex-col gap-1">
          <p className={`transition-all duration-300 text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 px-5 mb-1 whitespace-nowrap overflow-hidden ${forceExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 delay-200 translate-x-1'}`}>
            {category.category}
          </p>
          {category.items.map((item) => {
            const isOrdersCategory = category.category === 'Operaciones';

            const activeClasses = isOrdersCategory
              ? 'bg-procarni-secondary/10 text-procarni-secondary shadow-sm ring-1 ring-procarni-secondary/20'
              : 'bg-procarni-primary/10 text-procarni-primary shadow-sm ring-1 ring-procarni-primary/20';

            const hoverClasses = 'text-gray-500 hover:bg-gray-50 hover:text-procarni-blue hover:translate-x-1';

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-nowrap items-center h-11 px-2.5 rounded-xl transition-all duration-300 overflow-hidden ${isActive ? activeClasses : hoverClasses
                  } justify-start group/item`
                }
                title={!forceExpanded ? item.label : undefined}
              >
                <div className="flex-shrink-0 w-9 flex items-center justify-center transition-transform duration-300 group-hover/item:scale-110">
                  {React.cloneElement(item.icon as React.ReactElement, { className: 'h-4 w-4' })}
                </div>
                <span className={`transition-all duration-300 whitespace-nowrap ml-4 text-[13px] font-bold tracking-tight ${forceExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 group-hover:delay-200'}`}>
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
};

export default SidebarNav;