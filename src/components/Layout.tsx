import React, { useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';

import { useIsMobile } from '@/hooks/use-mobile';
import UserDropdown from './UserDropdown';
import SidebarNav from './SidebarNav';
import ScrollToTopButton from './ScrollToTopButton';
import { DynamicBreadcrumbs } from './DynamicBreadcrumbs';
import NotificationBell from './NotificationBell';
import GlobalSearch from './GlobalSearch';
import { 
  Menu, 
  X, 
  Search, 
  Bell, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  User as UserIcon,
  HelpCircle,
  Mail,
  Zap
} from "lucide-react";
import { useState, useEffect } from 'react';
import { useSession } from './SessionContextProvider';
import { notificationService } from '@/integrations/supabase/services/notificationService';
import { format, nextSunday, isSunday, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const Layout = () => {
  const isMobile = useIsMobile();
  const mainContentRef = useRef<HTMLElement>(null); // Ref para el contenido principal
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { role, session, supabase } = useSession();

  useEffect(() => {
    if (role === 'admin' && session?.user && supabase) {
      const today = new Date();
      const nextSun = isSunday(today) ? today : nextSunday(today);
      const formattedDate = format(nextSun, 'dd-MM-yyyy');
      
      // Mensaje en consola
      console.log(`%c Backup programado para el dia Domingo ${formattedDate}`, 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

      // Verificar si ya existe una notificación para este domingo
      const checkAndCreateNotification = async () => {
        try {
          // 1. Manejar "Backup programado"
          const { data: existingProgrammed } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('title', 'Respaldo Programado')
            .like('message', `%${formattedDate}%`)
            .limit(1);

          if (!existingProgrammed || existingProgrammed.length === 0) {
            await notificationService.createNotification({
              title: 'Respaldo Programado',
              message: `Backup programado para el dia Domingo ${formattedDate}`,
              type: 'reminder',
              user_id: session.user.id
            });
          }

          // 2. Manejar "Backup creado" en consola (si existe para hoy)
          if (isSunday(today)) {
            const todayFormatted = format(today, 'dd-MM-yyyy');
            const { data: existingCreated } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', session.user.id)
              .eq('title', 'Respaldo del Sistema')
              .like('message', `%${todayFormatted}%`)
              .limit(1);

            if (existingCreated && existingCreated.length > 0) {
              console.log(`%c Backup creado el dia Domingo ${todayFormatted}, ya puedes descargarlo`, 'background: #222; color: #4db8ff; padding: 2px 5px; border-radius: 3px;');
            }
          }
        } catch (error) {
          console.error('Error al gestionar notificación de backup:', error);
        }
      };

      checkAndCreateNotification();
    }
  }, [role, session, supabase]);

  const MobileHeader = () => (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 bg-white/70 backdrop-blur-lg px-4 shadow-sm border-none ring-1 ring-black/5 mx-4 mt-4 rounded-2xl">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0 md:hidden hover:bg-procarni-primary/10 text-procarni-primary">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex flex-col w-72 bg-background p-0">
          <SheetClose asChild>
            <NavLink to="/" className="h-20 flex items-center px-6 border-b border-gray-100 hover:bg-gray-50 transition-colors">
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl bg-procarni-primary/10">
                <img src="/Sis-Prov.png" alt="Sis-Prov Logo" className="w-6 h-6 object-contain" />
              </div>
              <span className="ml-4 font-black text-xl text-procarni-blue tracking-tighter">Procarni</span>
            </NavLink>
          </SheetClose>
          <div className="flex-1 overflow-y-auto scrollbar-none">
            {/* For mobile, we force the nav to look expanded */}
            <div className="group">
              <SidebarNav forceExpanded={true} />
            </div>
          </div>
          <div className="mt-auto p-4 border-t border-border">
            <UserDropdown />
          </div>
        </SheetContent>
      </Sheet>
      <div className="w-full flex-1 flex items-center justify-between">
        <span className="font-black text-xl text-procarni-blue tracking-tighter md:hidden">Procarni</span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden"
          >
            <Search className="h-5 w-5" />
          </Button>
          <NotificationBell />
          <UserDropdown />
        </div>
      </div>
    </header>
  );

  if (isMobile) {
    return (
      <div className="flex h-screen w-full flex-col font-body bg-[#F8FAFC] dark:bg-slate-950 text-foreground">
        <MobileHeader />
        <main ref={mainContentRef} className="flex flex-1 flex-col gap-6 p-4 overflow-y-auto">
          <DynamicBreadcrumbs />
          <Outlet />
        </main>
        <ScrollToTopButton scrollContainerRef={mainContentRef} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full font-body bg-[#F8FAFC] dark:bg-slate-950 text-foreground overflow-hidden">
      {/* Sidebar Desktop - Isla Flotante */}
      <aside 
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        className={`fixed left-4 top-4 bottom-4 bg-white/80 backdrop-blur-2xl ring-1 ring-white shadow-2xl shadow-gray-300/50 z-50 flex flex-col justify-between rounded-[2.25rem] overflow-hidden border-none text-[13px] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] ${
          isExpanded ? "w-64" : "w-[76px]"
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Logo / Header Sidebar */}
          <NavLink to="/" className="h-16 flex items-center px-5 justify-start transition-all overflow-hidden hover:bg-procarni-primary/5">
            <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <img src="/Sis-Prov.png" alt="Sis-Prov Logo" className="w-6 h-6 object-contain" />
            </div>
            <span 
              className={`ml-4 font-black text-lg text-procarni-blue tracking-tighter whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-10"
              }`}
            >
              Procarni
            </span>
          </NavLink>

          {/* Navegación Principal */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2">
            <SidebarNav forceExpanded={isExpanded} />
          </div>

          {/* Footer Sidebar */}
          <div className="p-4 mt-auto">
            <div className="flex items-center gap-3 px-2 py-2 text-muted-foreground hover:text-procarni-primary transition-colors cursor-pointer">
              <HelpCircle className="w-5 h-5 flex-shrink-0" />
              <span 
                className={`text-sm font-medium whitespace-nowrap transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-5"
                }`}
              >
                Ayuda
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenido Principal con Margen Dinámico */}
      <div 
        className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[margin-left] ${
          isExpanded ? "ml-[18.5rem]" : "ml-[5.75rem]"
        }`}
      >
        <header className="h-[4.75rem] bg-white/60 backdrop-blur-xl border-none flex items-center justify-between px-6 z-40 sticky top-4 mx-4 mt-4 rounded-[1.75rem] shadow-2xl shadow-gray-200/50 ring-1 ring-white">
          <div className="flex items-center gap-3">
            <DynamicBreadcrumbs />
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex relative">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-3 pl-4 pr-4 py-2 h-11 text-sm rounded-2xl bg-gray-100/50 dark:bg-slate-800 border-none ring-1 ring-gray-200/50 hover:ring-procarni-primary/30 hover:bg-white hover:shadow-lg transition-all duration-300 text-muted-foreground group w-72"
              >
                <Search className="h-4 w-4 group-hover:text-procarni-primary transition-colors" />
                <span className="font-medium">Buscar en el sistema...</span>
                <kbd className="pointer-events-none ml-auto inline-flex h-6 select-none items-center gap-1 rounded-lg border bg-white px-2 font-mono text-[10px] font-bold text-gray-400 opacity-100 shadow-sm">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>
            </div>
            <NotificationBell />
            <div className="h-6 w-px bg-border/60 mx-1"></div>
            <UserDropdown />
          </div>
        </header>

        <GlobalSearch open={isSearchOpen} onOpenChange={setIsSearchOpen} />
        
        <main ref={mainContentRef} className="flex-1 overflow-y-auto p-6 scroll-smooth lg:p-8">
          <Outlet />
        </main>

        <ScrollToTopButton scrollContainerRef={mainContentRef} />
      </div>
    </div>
  );
};

export default Layout;