import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, Clock, Package, Sparkles, Wrench, Zap, 
  Layers, ArrowRight, X, Flame, Droplets, Cpu 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAllMaterialCategories } from '@/integrations/supabase/data';

interface QuickCategory {
  name: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

const FEATURED_CATEGORIES: QuickCategory[] = [
  { name: 'EMPAQUE', label: 'Empaque', icon: <Package className="h-3.5 w-3.5" />, color: 'hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200' },
  { name: 'FRESCA', label: 'Cárnicos (Fresca)', icon: <Flame className="h-3.5 w-3.5" />, color: 'hover:bg-red-50 hover:text-red-700 hover:border-red-200' },
  { name: 'SECA', label: 'Seca / Insumos', icon: <Layers className="h-3.5 w-3.5" />, color: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' },
  { name: 'FERRETERIA Y CONSTRUCCION', label: 'Ferretería', icon: <Wrench className="h-3.5 w-3.5" />, color: 'hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300' },
  { name: 'ELECTRICIDAD', label: 'Electricidad', icon: <Zap className="h-3.5 w-3.5" />, color: 'hover:bg-yellow-50 hover:text-yellow-700 hover:border-yellow-200' },
  { name: 'INSUMOS DE LIMPIEZA', label: 'Limpieza', icon: <Droplets className="h-3.5 w-3.5" />, color: 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200' },
  { name: 'MECANICA Y SELLOS', label: 'Mecánica', icon: <Cpu className="h-3.5 w-3.5" />, color: 'hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200' },
];

const SearchSuppliersWidget: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [recentSearches, setRecentSearches] = useState<{ query?: string; category?: string; label: string }[]>([]);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
  });

  useEffect(() => {
    const saved = localStorage.getItem('recent_supplier_searches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved).slice(0, 4));
      } catch (e) {
        console.error('Error parsing recent searches', e);
      }
    }
  }, []);

  const saveRecentSearch = (item: { query?: string; category?: string; label: string }) => {
    try {
      const current = recentSearches.filter(s => s.label.toLowerCase() !== item.label.toLowerCase());
      const updated = [item, ...current].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recent_supplier_searches', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving recent search', e);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = searchTerm.trim();
    if (!clean) return;

    saveRecentSearch({ query: clean, label: clean });
    navigate(`/search-suppliers-by-material?query=${encodeURIComponent(clean)}`);
  };

  const handleCategoryClick = (categoryName: string) => {
    saveRecentSearch({ category: categoryName, label: `Categoría: ${categoryName}` });
    navigate(`/search-suppliers-by-material?category=${encodeURIComponent(categoryName)}`);
  };

  const handleRecentClick = (item: { query?: string; category?: string; label: string }) => {
    if (item.category) {
      navigate(`/search-suppliers-by-material?category=${encodeURIComponent(item.category)}`);
    } else if (item.query) {
      navigate(`/search-suppliers-by-material?query=${encodeURIComponent(item.query)}`);
    }
  };

  return (
    <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden h-full flex flex-col justify-between">
      <CardHeader className="pb-3 p-6 sm:p-7 bg-gradient-to-br from-gray-50/50 to-transparent border-b border-gray-100/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-procarni-primary/10 text-procarni-primary shadow-sm">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-black text-procarni-blue tracking-tight">
                Buscar Proveedores
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 font-medium">
                Por material, categoría, rubro o razón social
              </CardDescription>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-procarni-secondary bg-procarni-secondary/10 px-2.5 py-1 rounded-full">
            <Sparkles className="h-3 w-3" /> Motor Ágil
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-6 sm:p-7 space-y-5 flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          {/* SEARCH INPUT */}
          <form onSubmit={handleSearchSubmit} className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-1 block">
              ¿Qué necesitas cotizar o comprar?
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-gray-400 pointer-events-none">
                <Search className="h-4 w-4" />
              </div>
              <Input
                type="text"
                placeholder="Ej. Bolsa al vacío, Solomo, Sal, Cinta, Plastipack..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 h-11 bg-white/90 border-gray-200 rounded-xl shadow-sm text-sm font-medium text-procarni-dark focus-visible:ring-procarni-primary/20 focus-visible:border-procarni-primary transition-all placeholder:text-gray-400"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Button
              type="submit"
              disabled={!searchTerm.trim()}
              className="w-full h-11 rounded-xl bg-gradient-to-r from-procarni-primary to-procarni-blue hover:from-red-900 hover:to-blue-950 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.99] gap-2 mt-2"
            >
              <Search className="h-4 w-4" />
              <span>Localizar Proveedores</span>
              <ArrowRight className="h-4 w-4 ml-auto opacity-70" />
            </Button>
          </form>

          {/* QUICK CATEGORY PILLS */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                Categorías Frecuentes
              </span>
              <span className="text-[10px] text-gray-400 font-medium">1-clic directo</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FEATURED_CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => handleCategoryClick(cat.name)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white/80 text-xs font-semibold text-gray-700 shadow-xs transition-all active:scale-95 ${cat.color}`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RECENT SEARCHES */}
        {recentSearches.length > 0 && (
          <div className="pt-3 border-t border-gray-100/80 animate-in fade-in duration-500">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mb-2 flex items-center">
              <Clock className="mr-1.5 h-3 w-3 text-procarni-secondary" /> Búsquedas Recientes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recentSearches.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleRecentClick(item)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-200/60 text-[11px] font-medium text-gray-600 hover:text-procarni-dark transition-colors"
                >
                  <Search className="h-2.5 w-2.5 text-gray-400" />
                  <span className="truncate max-w-[150px]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SearchSuppliersWidget;
