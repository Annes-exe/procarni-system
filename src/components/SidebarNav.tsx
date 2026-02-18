"use client";

import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Search, ShoppingCart, FileText, Factory, Users, Box, Upload, ClipboardList, Building2, ListOrdered, Settings, Cog, FileUp, DollarSign, ScrollText, Scale, Wrench, LayoutDashboard, FileQuestion, Briefcase } from 'lucide-react';

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
      { to: '/price-history', icon: <DollarSign className="h-5 w-5" />, label: 'Historial de Precios' },
      { to: '/purchase-history', icon: <DollarSign className="h-5 w-5" />, label: 'Historial de Compras' },
      { to: '/quote-comparison-management', icon: <Scale className="h-5 w-5" />, label: 'Gestión de Comparaciones' },
    ]
  },
  {
    category: 'Maestros de Datos',
    items: [
      { to: '/supplier-management', icon: <Users className="h-5 w-5" />, label: 'Gestión de Proveedores' },
      { to: '/material-management', icon: <Box className="h-5 w-5" />, label: 'Gestión de Materiales' },
      { to: '/company-management', icon: <Building2 className="h-5 w-5" />, label: 'Gestión de Empresas' },
    ]
  },
  {
    category: 'Administración',
    items: [
      { to: '/bulk-upload', icon: <Upload className="h-5 w-5" />, label: 'Carga Masiva' },
      { to: '/ficha-tecnica-upload', icon: <FileUp className="h-5 w-5" />, label: 'Subir Ficha Técnica' },
      { to: '/settings', icon: <Cog className="h-5 w-5" />, label: 'Secuencias' },
      { to: '/audit-log', icon: <ScrollText className="h-5 w-5" />, label: 'Historial de Auditoría' },
    ]
  }
];

const SidebarNav = () => {
  const [openItems, setOpenItems] = useState<string[]>(['Inicio', 'Operaciones', 'Reportes', 'Maestros de Datos', 'Administración']);

  const handleValueChange = (value: string[]) => {
    setOpenItems(value);
  };

  return (
    <Accordion
      type="multiple"
      value={openItems}
      onValueChange={handleValueChange}
      className="w-full"
    >
      {navItems.map((category) => (
        <AccordionItem key={category.category} value={category.category} className="border-b border-sidebar-border">
          <AccordionTrigger className="px-4 py-2 text-sm font-semibold text-sidebar-foreground hover:bg-muted/50 rounded-md">
            {category.category}
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <nav className="grid items-start px-2 text-sm font-medium">
              {category.items.map((item) => {
                const isOrdersCategory = category.category === 'Operaciones';

                // Determine classes based on category
                const activeClasses = isOrdersCategory
                  ? 'bg-procarni-secondary text-white'
                  : 'bg-procarni-primary text-white';

                const hoverClasses = isOrdersCategory
                  ? 'text-sidebar-foreground hover:bg-procarni-secondary/10 hover:text-procarni-secondary'
                  : 'text-sidebar-foreground hover:bg-procarni-primary/10 hover:text-procarni-primary';

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 transition-all 
                      ${isActive ? activeClasses : hoverClasses}`
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default SidebarNav;