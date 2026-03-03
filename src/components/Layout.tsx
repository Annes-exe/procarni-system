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
import { Menu, Search } from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import { useState, useEffect } from 'react';

const Layout = () => {
  const isMobile = useIsMobile();
  const mainContentRef = useRef<HTMLElement>(null); // Ref para el contenido principal
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  const SidebarHeader = () => (
    <NavLink to="/" className="h-16 flex items-center px-4 justify-start border-b border-border transition-all overflow-hidden hover:bg-muted/50">
      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-transparent">
        <img src="/Sis-Prov.png" alt="Sis-Prov Logo" className="w-full h-full object-contain" />
      </div>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 delay-100 whitespace-nowrap ml-3 font-bold text-lg text-procarni-primary tracking-tight">
        Procarni
      </span>
    </NavLink>
  );

  const DesktopSidebar = () => (
    <aside className="fixed left-0 top-0 h-full bg-background dark:bg-slate-900 border-r border-border z-50 flex flex-col justify-between group transition-all duration-300 w-16 hover:w-64 hover:shadow-xl overflow-hidden">
      <div>
        <SidebarHeader />
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600">
          <SidebarNav />
        </div>
      </div>

    </aside>
  );

  const MobileHeader = () => (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6 shadow-sm">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="shrink-0 md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="flex flex-col w-72 bg-background p-0">
          <SheetClose asChild>
            <NavLink to="/" className="h-16 flex items-center px-4 border-b border-border hover:bg-muted/50 transition-colors">
              <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-transparent">
                <img src="/Sis-Prov.png" alt="Sis-Prov Logo" className="w-full h-full object-contain" />
              </div>
              <span className="ml-3 font-bold text-lg text-procarni-primary tracking-tight">Procarni</span>
            </NavLink>
          </SheetClose>
          <div className="flex-1 overflow-y-auto">
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
        <span className="font-bold text-lg text-procarni-primary tracking-tight md:hidden">Procarni</span>
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
      <div className="flex h-screen w-full flex-col font-body bg-gray-50 dark:bg-slate-950 text-foreground">
        <MobileHeader />
        <main ref={mainContentRef} className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 overflow-y-auto">
          <DynamicBreadcrumbs />
          <Outlet />
        </main>
        <ScrollToTopButton scrollContainerRef={mainContentRef} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full font-body bg-gray-50 dark:bg-slate-950 text-foreground overflow-hidden">
      <DesktopSidebar />
      <div className="flex-1 ml-16 flex flex-col h-screen overflow-hidden transition-all duration-300">
        <header className="h-16 bg-background dark:bg-slate-900 border-b border-border flex items-center justify-between px-6 z-40 sticky top-0 shadow-sm">
          <div className="flex items-center gap-3">
            <DynamicBreadcrumbs />
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex relative">
              <button
                type="button"
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center gap-2 pl-3 pr-4 py-2 h-9 text-sm rounded-full bg-gray-100 dark:bg-slate-800 border border-transparent hover:border-procarni-primary/30 hover:bg-gray-200 dark:hover:bg-slate-700 w-64 transition-all duration-200 text-muted-foreground group"
              >
                <Search className="h-4 w-4 group-hover:text-procarni-primary transition-colors" />
                <span>Buscar...</span>
                <kbd className="pointer-events-none ml-auto inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>
            </div>
            <NotificationBell />
            <div className="h-8 w-px bg-border/60 mx-1"></div>
            <UserDropdown />
          </div>
        </header>
        <GlobalSearch open={isSearchOpen} onOpenChange={setIsSearchOpen} />
        <main ref={mainContentRef} className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <Outlet />
        </main>
        <ScrollToTopButton scrollContainerRef={mainContentRef} />
      </div>
    </div>
  );
};

export default Layout;