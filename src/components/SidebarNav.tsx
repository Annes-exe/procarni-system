"use client";

import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShoppingCart, Users, Box, Upload, Building2, Cog, FileUp, ScrollText, Scale, LayoutDashboard, FileQuestion, Briefcase, BarChart3 } from 'lucide-react';

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
      { to: '/settings', icon: <Cog className="h-5 w-5" />, label: 'Secuencias' },
      { to: '/audit-log', icon: <ScrollText className="h-5 w-5" />, label: 'Auditoría' },
    ]
  }
];

interface SidebarNavProps {
  forceExpanded?: boolean;
}

const SidebarNav = ({ forceExpanded = false }: SidebarNavProps) => {

  return (
    <nav className="mt-4 flex flex-col gap-4 px-2">
      {navItems.map((category) => (
        <div key={category.category} className="flex flex-col gap-1">
          <p className={`transition-opacity duration-200 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-1 whitespace-nowrap overflow-hidden ${forceExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 delay-100'}`}>
            {category.category}
          </p>
          {category.items.map((item) => {
            const isOrdersCategory = category.category === 'Operaciones';

            const activeClasses = isOrdersCategory
              ? 'bg-procarni-secondary/10 dark:bg-rose-900/20 text-procarni-secondary'
              : 'bg-procarni-primary/10 dark:bg-red-900/20 text-procarni-primary';

            const hoverClasses = 'text-muted-foreground hover:bg-muted dark:hover:bg-slate-800 hover:text-foreground';

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-nowrap items-center p-3 rounded-lg transition-colors duration-200 overflow-hidden ${isActive ? activeClasses : hoverClasses
                  } justify-start`
                }
                title={!forceExpanded ? item.label : undefined}
              >
                <div className="flex-shrink-0 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className={`transition-opacity duration-200 whitespace-nowrap ml-4 text-sm font-medium ${forceExpanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-hover:delay-100'}`}>
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