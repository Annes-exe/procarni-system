import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  GitMerge,
  ArrowRight,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  MapPinned,
  Loader2,
  ShieldAlert,
  Search,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { mergeSuppliers, getAllSuppliers } from '@/integrations/supabase/data';
import { showError, showSuccess } from '@/utils/toast';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SupplierMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSourceSupplierId?: string | null;
  initialTargetSupplierId?: string | null;
}

interface SupplierItem {
  id: string;
  name: string;
  rif: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  status: string;
  rubros: string | null;
}

export const SupplierMergeModal: React.FC<SupplierMergeModalProps> = ({
  isOpen,
  onClose,
  initialSourceSupplierId,
  initialTargetSupplierId,
}) => {
  const queryClient = useQueryClient();

  const [targetSupplierId, setTargetSupplierId] = useState<string>(initialTargetSupplierId || '');
  const [sourceSupplierId, setSourceSupplierId] = useState<string>(initialSourceSupplierId || '');

  const [searchTarget, setSearchTarget] = useState('');
  const [searchSource, setSearchSource] = useState('');

  const [isTargetSelectOpen, setIsTargetSelectOpen] = useState(false);
  const [isSourceSelectOpen, setIsSourceSelectOpen] = useState(false);

  const [confirmTransactions, setConfirmTransactions] = useState(false);
  const [confirmDeactivation, setConfirmDeactivation] = useState(false);

  // Sync initial props
  React.useEffect(() => {
    if (isOpen) {
      if (initialTargetSupplierId) setTargetSupplierId(initialTargetSupplierId);
      if (initialSourceSupplierId) setSourceSupplierId(initialSourceSupplierId);
      setConfirmTransactions(false);
      setConfirmDeactivation(false);
      setSearchTarget('');
      setSearchSource('');
    }
  }, [isOpen, initialTargetSupplierId, initialSourceSupplierId]);

  // Fetch all suppliers for selection
  const { data: allSuppliers = [], isLoading: isLoadingSuppliers } = useQuery({
    queryKey: ['all_suppliers_for_merge'],
    queryFn: getAllSuppliers,
    enabled: isOpen,
    staleTime: 1000 * 60 * 2,
  });

  const targetSupplier = React.useMemo(() => {
    return allSuppliers.find((s) => s.id === targetSupplierId) || null;
  }, [allSuppliers, targetSupplierId]);

  const sourceSupplier = React.useMemo(() => {
    return allSuppliers.find((s) => s.id === sourceSupplierId) || null;
  }, [allSuppliers, sourceSupplierId]);

  // Fetch count of related documents for preview
  const { data: sourceStats } = useQuery({
    queryKey: ['supplier_merge_stats', sourceSupplierId],
    queryFn: async () => {
      if (!sourceSupplierId) return { poCount: 0, qrCount: 0, branchesCount: 0 };
      const [poRes, qrRes, branchRes] = await Promise.all([
        supabase.from('purchase_orders').select('*', { count: 'exact', head: true }).eq('supplier_id', sourceSupplierId),
        supabase.from('quote_requests').select('*', { count: 'exact', head: true }).eq('supplier_id', sourceSupplierId),
        supabase.from('supplier_branches').select('*', { count: 'exact', head: true }).eq('supplier_id', sourceSupplierId),
      ]);
      return {
        poCount: poRes.count || 0,
        qrCount: qrRes.count || 0,
        branchesCount: branchRes.count || 0,
      };
    },
    enabled: !!sourceSupplierId && isOpen,
  });

  const filteredTargetList = React.useMemo(() => {
    const q = searchTarget.toLowerCase().trim();
    return allSuppliers.filter(
      (s) =>
        s.id !== sourceSupplierId &&
        (s.name.toLowerCase().includes(q) || s.rif.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q)))
    );
  }, [allSuppliers, sourceSupplierId, searchTarget]);

  const filteredSourceList = React.useMemo(() => {
    const q = searchSource.toLowerCase().trim();
    return allSuppliers.filter(
      (s) =>
        s.id !== targetSupplierId &&
        (s.name.toLowerCase().includes(q) || s.rif.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q)))
    );
  }, [allSuppliers, targetSupplierId, searchSource]);

  const mergeMutation = useMutation({
    mutationFn: async () => {
      if (!targetSupplierId || !sourceSupplierId) {
        throw new Error('Debes seleccionar ambos proveedores.');
      }
      if (targetSupplierId === sourceSupplierId) {
        throw new Error('No puedes fusionar un proveedor consigo mismo.');
      }
      const success = await mergeSuppliers(targetSupplierId, sourceSupplierId);
      if (!success) {
        throw new Error('La función de fusión no pudo completarse.');
      }
      return true;
    },
    onSuccess: () => {
      showSuccess(`Proveedores fusionados exitosamente.`);
      queryClient.invalidateQueries({ queryKey: ['suppliers_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['all_suppliers_for_merge'] });
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders_paginated'] });
      queryClient.invalidateQueries({ queryKey: ['quote_requests'] });
      queryClient.invalidateQueries({ queryKey: ['service_orders'] });
      onClose();
    },
    onError: (err: any) => {
      showError(err?.message || 'Error al ejecutar la fusión.');
    },
  });

  const canSubmit =
    targetSupplierId &&
    sourceSupplierId &&
    targetSupplierId !== sourceSupplierId &&
    confirmTransactions &&
    confirmDeactivation &&
    !mergeMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !mergeMutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-[700px] md:max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl p-6 md:p-8 space-y-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-procarni-blue/10 text-procarni-blue">
              <GitMerge className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl md:text-2xl font-extrabold text-procarni-dark tracking-tight">
                Fusión de Proveedores
              </DialogTitle>
              <DialogDescription className="text-xs md:text-sm text-slate-500 font-medium">
                Herramienta administrativa para consolidar proveedores duplicados en un único registro maestro.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Selection Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Col 1: Proveedor Destino (Principal) */}
          <div className="space-y-2 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 relative">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-procarni-blue flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Proveedor Destino (Principal)
              </Label>
              <Badge className="bg-procarni-blue text-white text-[10px] font-bold">A Conservar</Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Registro maestro que absorberá todo el historial y permanecerá <strong>Activo</strong>.
            </p>

            {/* Selector Dropdown / Search */}
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar proveedor principal..."
                  value={searchTarget}
                  onChange={(e) => {
                    setSearchTarget(e.target.value);
                    setIsTargetSelectOpen(true);
                  }}
                  onFocus={() => setIsTargetSelectOpen(true)}
                  className="pl-9 h-9 text-xs bg-white rounded-xl border-slate-200"
                />
              </div>

              {isTargetSelectOpen && (
                <div className="border border-slate-200 bg-white rounded-xl shadow-lg p-1 max-h-48 overflow-y-auto">
                  {filteredTargetList.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2 text-center">No se encontraron proveedores</p>
                  ) : (
                    filteredTargetList.slice(0, 30).map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setTargetSupplierId(s.id);
                          setSearchTarget('');
                          setIsTargetSelectOpen(false);
                        }}
                        className={cn(
                          "px-3 py-2 text-xs rounded-lg cursor-pointer hover:bg-slate-100 flex items-center justify-between transition-colors",
                          targetSupplierId === s.id && "bg-procarni-blue/10 text-procarni-blue font-bold"
                        )}
                      >
                        <div className="truncate">
                          <span className="font-semibold block truncate">{s.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{s.rif}</span>
                        </div>
                        {targetSupplierId === s.id && <CheckCircle2 className="h-4 w-4 text-procarni-blue shrink-0" />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Target Details Card */}
            {targetSupplier && (
              <Card className="bg-white border-slate-200 shadow-sm rounded-xl p-3 space-y-1.5 mt-2 animate-in fade-in duration-200">
                <p className="text-sm font-bold text-procarni-dark truncate">{targetSupplier.name}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 font-mono">
                  <span>RIF: <strong>{targetSupplier.rif}</strong></span>
                  {targetSupplier.code && <span>• Cód: <strong>{targetSupplier.code}</strong></span>}
                </div>
                {targetSupplier.rubros && (
                  <p className="text-[11px] text-slate-500 truncate">Rubro: {targetSupplier.rubros}</p>
                )}
                {targetSupplier.phone && (
                  <p className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" /> {targetSupplier.phone}
                  </p>
                )}
              </Card>
            )}
          </div>

          {/* Col 2: Proveedor Origen (Secundario / a Absorber) */}
          <div className="space-y-2 p-4 rounded-2xl bg-amber-50/50 border border-amber-200/80 relative">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <GitMerge className="h-3.5 w-3.5" /> Proveedor Origen (A Absorber)
              </Label>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] font-bold">
                A Desactivar
              </Badge>
            </div>
            <p className="text-[11px] text-amber-800/80">
              Registro secundario que transferirá sus datos y pasará a <strong>Inactivo</strong>.
            </p>

            {/* Selector Dropdown / Search */}
            <div className="space-y-2 pt-1">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar proveedor secundario..."
                  value={searchSource}
                  onChange={(e) => {
                    setSearchSource(e.target.value);
                    setIsSourceSelectOpen(true);
                  }}
                  onFocus={() => setIsSourceSelectOpen(true)}
                  className="pl-9 h-9 text-xs bg-white rounded-xl border-amber-200 focus:ring-amber-300"
                />
              </div>

              {isSourceSelectOpen && (
                <div className="border border-amber-200 bg-white rounded-xl shadow-lg p-1 max-h-48 overflow-y-auto">
                  {filteredSourceList.length === 0 ? (
                    <p className="text-xs text-slate-400 p-2 text-center">No se encontraron proveedores</p>
                  ) : (
                    filteredSourceList.slice(0, 30).map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setSourceSupplierId(s.id);
                          setSearchSource('');
                          setIsSourceSelectOpen(false);
                        }}
                        className={cn(
                          "px-3 py-2 text-xs rounded-lg cursor-pointer hover:bg-amber-50 flex items-center justify-between transition-colors",
                          sourceSupplierId === s.id && "bg-amber-100 text-amber-900 font-bold"
                        )}
                      >
                        <div className="truncate">
                          <span className="font-semibold block truncate">{s.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{s.rif}</span>
                        </div>
                        {sourceSupplierId === s.id && <CheckCircle2 className="h-4 w-4 text-amber-700 shrink-0" />}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Source Details Card */}
            {sourceSupplier && (
              <Card className="bg-white border-amber-200 shadow-sm rounded-xl p-3 space-y-1.5 mt-2 animate-in fade-in duration-200">
                <p className="text-sm font-bold text-procarni-dark truncate">{sourceSupplier.name}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 font-mono">
                  <span>RIF: <strong>{sourceSupplier.rif}</strong></span>
                  {sourceSupplier.code && <span>• Cód: <strong>{sourceSupplier.code}</strong></span>}
                </div>
                {sourceStats && (
                  <div className="flex items-center gap-3 pt-1 text-[10px] text-amber-900 font-medium">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" /> {sourceStats.poCount} OCs / {sourceStats.qrCount} SCs
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPinned className="h-3 w-3" /> {sourceStats.branchesCount} Sedes
                    </span>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Informative Summary / Flow Preview */}
        {targetSupplier && sourceSupplier && (
          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-2 text-xs text-blue-900 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 font-bold text-procarni-blue">
              <ArrowRight className="h-4 w-4" />
              <span>Resumen de la Fusión:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
              <li>
                Todas las <strong>Órdenes de Compra, Solicitudes, Sedes, Fichas Técnicas e Historial de Precios</strong> de{' '}
                <strong className="text-procarni-dark">"{sourceSupplier.name}"</strong> se transferirán automáticamente a{' '}
                <strong className="text-procarni-blue">"{targetSupplier.name}"</strong>.
              </li>
              <li>
                Si el proveedor principal no tiene teléfono, correo o dirección registrados, se completarán con los datos del secundario.
              </li>
              <li>
                El proveedor origen <strong className="text-procarni-dark">"{sourceSupplier.name}"</strong> será marcado como{' '}
                <span className="font-bold text-amber-700">Inactivo</span> con un comentario de trazabilidad.
              </li>
            </ul>
          </div>
        )}

        {/* Security Checkboxes */}
        <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="confirm-transactions"
              checked={confirmTransactions}
              onCheckedChange={(c) => setConfirmTransactions(Boolean(c))}
              className="mt-0.5"
            />
            <Label htmlFor="confirm-transactions" className="text-xs font-medium text-slate-700 leading-snug cursor-pointer">
              Entiendo que todos los documentos históricos, transacciones y sedes pasarán a estar asociados al proveedor principal.
            </Label>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="confirm-deactivation"
              checked={confirmDeactivation}
              onCheckedChange={(c) => setConfirmDeactivation(Boolean(c))}
              className="mt-0.5"
            />
            <Label htmlFor="confirm-deactivation" className="text-xs font-medium text-slate-700 leading-snug cursor-pointer">
              Confirmo la consolidación y el archivado del registro duplicado original.
            </Label>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={mergeMutation.isPending}
            className="w-full sm:w-auto text-xs rounded-2xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => mergeMutation.mutate()}
            className="w-full sm:w-auto bg-procarni-primary hover:bg-red-900 text-white font-bold text-xs rounded-2xl h-10 px-5 shadow-lg shadow-red-900/10 flex items-center gap-2"
          >
            {mergeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Fusionando Proveedores...</span>
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4" />
                <span>Confirmar y Fusionar</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
