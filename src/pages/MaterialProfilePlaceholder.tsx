import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { m } from 'framer-motion';
import { ArrowLeft, Package, DollarSign, BarChart3, AlertCircle, Calendar } from 'lucide-react';
import { getMaterialsInventory } from '@/integrations/supabase/services/inventoryService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const CATEGORY_COLORS = {
  MPF: { bg: 'bg-red-50', text: 'text-procarni-primary', border: 'border-procarni-primary/20' },
  MPS: { bg: 'bg-amber-50', text: 'text-procarni-alert', border: 'border-procarni-alert/20' },
  EMP: { bg: 'bg-blue-50', text: 'text-procarni-blue', border: 'border-procarni-blue/20' },
  ETQ: { bg: 'bg-slate-100', text: 'text-procarni-dark', border: 'border-procarni-dark/20' },
};

const CATEGORY_LABELS = {
  MPF: 'Materia Prima Fresca',
  MPS: 'Materia Prima Seca',
  EMP: 'Empaques',
  ETQ: 'Etiquetas',
};

const fmt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const MaterialProfilePlaceholder = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch inventory including inactive (archived) to ensure we can view profile of archived ones too
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ['materialsInventory', 'all'],
    queryFn: () => getMaterialsInventory(true),
  });

  const material = useMemo(() => {
    return inventory.find(m => m.material_id === id);
  }, [inventory, id]);

  const isLow = useMemo(() => {
    if (!material) return false;
    return material.min_stock_alert > 0 && material.current_stock <= material.min_stock_alert;
  }, [material]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 lg:p-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Skeleton className="h-48 rounded-[2rem]" />
          <Skeleton className="h-48 rounded-[2rem]" />
          <Skeleton className="h-48 rounded-[2rem]" />
        </div>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="container mx-auto p-6 lg:p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <AlertCircle className="h-12 w-12 text-procarni-primary" />
        <h2 className="text-xl font-bold text-procarni-dark">Material no encontrado</h2>
        <p className="text-sm text-gray-500">El ID especificado no corresponde a ningún material habilitado en inventario.</p>
        <Button onClick={() => navigate('/inventory')} className="bg-procarni-blue hover:bg-procarni-blue/90 text-white rounded-xl">
          Volver a Inventario
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full -m-6 p-6 lg:-m-8 lg:p-8 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]">
      <div className="container mx-auto space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* Back navigation */}
        <button
          onClick={() => navigate('/inventory')}
          className="group flex items-center gap-2 text-sm font-bold text-procarni-blue hover:text-procarni-primary transition-all duration-300"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
          <span>Volver a Stock Global</span>
        </button>

        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200/50 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-bold text-sm text-procarni-dark bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                {material.sku}
              </span>
              <Badge variant="outline" className={cn('font-bold text-xs border px-2.5 py-0.5', 
                CATEGORY_COLORS[material.inventory_category]?.bg, 
                CATEGORY_COLORS[material.inventory_category]?.text, 
                CATEGORY_COLORS[material.inventory_category]?.border
              )}>
                {CATEGORY_LABELS[material.inventory_category] || material.inventory_category}
              </Badge>
              {!material.is_active && (
                <Badge variant="outline" className="bg-red-50 text-procarni-primary border-procarni-primary/20 font-bold">
                  Archivado
                </Badge>
              )}
            </div>
            <h1 className="text-[34px] font-black text-procarni-blue tracking-tight leading-tight mt-2">
              {material.materials?.name ?? 'Detalles del Material'}
            </h1>
            <p className="text-[13px] text-gray-500 font-medium italic">
              {material.materials?.code ? `Código de sistema: ${material.materials.code}` : 'Sin código de sistema registrado'}
            </p>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Stock actual */}
          <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem]">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className={cn('p-3 rounded-2xl', isLow ? 'bg-procarni-primary/10 text-procarni-primary' : 'bg-procarni-secondary/10 text-procarni-secondary')}>
                  <Package className="h-5 w-5" />
                </div>
                {isLow && (
                  <Badge variant="outline" className="bg-amber-50 text-procarni-alert border-procarni-alert/30 font-bold text-[10px]">
                    STOCK BAJO
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Stock Disponible</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={cn('text-[36px] font-black tracking-tighter', isLow ? 'text-procarni-alert' : 'text-procarni-secondary')}>
                    {fmt(material.current_stock, 2)}
                  </span>
                  <span className="text-gray-500 font-bold text-sm">{material.unit}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Alerta de Stock Crítico: <span className="font-semibold text-gray-600">{fmt(material.min_stock_alert, 2)} {material.unit}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Valorización */}
          <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem]">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-procarni-blue/10 text-procarni-blue">
                  <DollarSign className="h-5 w-5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Valor Total de Inventario</p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-[36px] font-black tracking-tighter text-procarni-dark">
                    ${fmt(material.total_value, 2)}
                  </span>
                  <span className="text-gray-500 font-bold text-sm">USD</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Costo Promedio Ponderado (CPP) por {material.unit}: <span className="font-semibold text-gray-600">${fmt(material.average_unit_cost, 4)}</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Detalles de Costos */}
          <Card className="border-none bg-white/70 backdrop-blur-xl shadow-2xl shadow-gray-200/50 ring-1 ring-white p-1.5 rounded-[2rem]">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="p-3 rounded-2xl bg-slate-100 text-slate-600">
                  <BarChart3 className="h-5 w-5" />
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Costos y Precios</p>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-semibold">Último Costo de Compra:</span>
                    <span className="font-mono font-bold text-slate-800">${fmt(material.last_purchase_price, 4)} / {material.unit}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-semibold">CPP Actual:</span>
                    <span className="font-mono font-bold text-slate-800">${fmt(material.average_unit_cost, 4)} / {material.unit}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Habilitado el {new Date(material.enabled_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Additional information placeholder (Mock Section) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card className="border-none bg-white/70 backdrop-blur-xl shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl">
            <CardHeader className="border-b border-gray-100/50 pb-4">
              <CardTitle className="text-base font-extrabold text-procarni-dark flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-procarni-blue" />
                Notas de Almacenamiento e Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="text-sm text-slate-600 leading-relaxed">
                {material.notes ? (
                  <p>{material.notes}</p>
                ) : (
                  <p className="italic text-gray-400">No hay observaciones o notas registradas para este material.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Estado de Inventario</span>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {material.is_active ? 'Activo y Disponible' : 'Archivado'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Unidad Base</span>
                  <p className="text-sm font-semibold text-slate-700 mt-0.5">
                    {material.unit} (Catálogo: {material.materials?.unit ?? material.unit})
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-white/70 backdrop-blur-xl shadow-xl shadow-gray-200/50 ring-1 ring-white rounded-3xl">
            <CardHeader className="border-b border-gray-100/50 pb-4">
              <CardTitle className="text-base font-extrabold text-procarni-dark flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-procarni-blue" />
                Estadísticas de Uso (Simulado)
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Entradas este Mes</span>
                  <p className="text-xl font-bold text-procarni-blue mt-1">12 transacciones</p>
                  <p className="text-xs text-gray-400 mt-0.5">Volumen: +2,400.00 {material.unit}</p>
                </div>
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Salidas este Mes</span>
                  <p className="text-xl font-bold text-procarni-primary mt-1">45 despachos</p>
                  <p className="text-xs text-gray-400 mt-0.5">Volumen: -1,850.00 {material.unit}</p>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 italic text-center mt-2">
                Estas estadísticas corresponden al histórico resumido mensual.
              </p>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
};

export default MaterialProfilePlaceholder;
