import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { getPendingMaterials, updateMaterial, getAllUnits, getAllMaterialCategories } from '@/integrations/supabase/data';
import { supabase } from '@/integrations/supabase/client';
import { showSuccess, showError } from '@/utils/toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Check, Edit, Link, Search, X, Loader2, Sparkles, MoreHorizontal, FileText, ExternalLink, ShoppingBag } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import SmartSearch from '@/components/SmartSearch';
import MaterialCreationDialog from '@/components/MaterialCreationDialog';
import { Material } from '@/integrations/supabase/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface OriginOrder {
  orderId: string;
  sequenceNumber: number | null;
  issueDate: string | null;
  createdAt: string | null;
  status: string;
  supplierName?: string | null;
  type: 'PO' | 'QR';
}

const formatOrderNumber = (sequence: number | null | undefined, dateString?: string | null) => {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `OC-${year}-${month}-${seq}`;
};

const formatQuoteNumber = (sequence: number | null | undefined, dateString?: string | null) => {
  if (!sequence) return 'N/A';
  const date = dateString ? new Date(dateString) : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const seq = String(sequence).padStart(3, '0');
  return `SC-${year}-${month}-${seq}`;
};

const MaterialApproval = () => {
  const { role, isLoadingSession } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [linkingMaterial, setLinkingMaterial] = useState<Material | null>(null);
  
  // States for linking to master
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [selectedParentName, setSelectedParentName] = useState<string>('');
  const [isLinkingSubmitting, setIsLinkingSubmitting] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Guard: Redirect if not admin
  React.useEffect(() => {
    if (!isLoadingSession && role !== 'admin') {
      navigate('/');
      showError('No tienes permisos para acceder a esta página.');
    }
  }, [role, isLoadingSession, navigate]);

  // Fetch pending materials
  const { data: pendingMaterials = [], isLoading } = useQuery<Material[]>({
    queryKey: ['pending_materials'],
    queryFn: getPendingMaterials,
    enabled: role === 'admin'
  });

  // Query categories
  const { data: categories = [] } = useQuery({
    queryKey: ['material_categories'],
    queryFn: getAllMaterialCategories,
    enabled: role === 'admin'
  });

  // Query profiles for showing creator names
  const { data: creatorProfiles = {} } = useQuery<Record<string, string>>({
    queryKey: ['profiles_map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, username, email');
      if (error) return {};
      const map: Record<string, string> = {};
      data.forEach((p: any) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ');
        map[p.id] = name || p.username || p.email || 'Usuario';
      });
      return map;
    },
    enabled: role === 'admin'
  });

  // Query purchase orders / quote requests where pending materials were used
  const pendingMaterialIds = pendingMaterials.map(m => m.id);

  const { data: materialOriginOrders = {}, isLoading: isLoadingOriginOrders } = useQuery<Record<string, OriginOrder[]>>({
    queryKey: ['pending_materials_origin_orders', pendingMaterialIds],
    queryFn: async () => {
      if (pendingMaterialIds.length === 0) return {};

      const map: Record<string, OriginOrder[]> = {};

      // 1. Query Purchase Orders (OC)
      const { data: poItems, error: poError } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          material_id,
          material_name,
          created_at,
          order_id,
          purchase_orders (
            id,
            sequence_number,
            issue_date,
            created_at,
            status,
            suppliers (
              id,
              name
            )
          )
        `)
        .in('material_id', pendingMaterialIds);

      if (!poError && poItems) {
        poItems.forEach((item: any) => {
          if (!item.material_id || !item.purchase_orders) return;
          const po = item.purchase_orders;
          if (!map[item.material_id]) {
            map[item.material_id] = [];
          }
          if (!map[item.material_id].some(o => o.orderId === po.id)) {
            map[item.material_id].push({
              orderId: po.id,
              sequenceNumber: po.sequence_number,
              issueDate: po.issue_date,
              createdAt: po.created_at || item.created_at,
              status: po.status,
              supplierName: po.suppliers?.name || null,
              type: 'PO'
            });
          }
        });
      }

      // 2. Query Quote Requests (SC) for additional context
      const { data: qrItems, error: qrError } = await supabase
        .from('quote_request_items')
        .select(`
          id,
          material_id,
          material_name,
          created_at,
          request_id,
          quote_requests (
            id,
            sequence_number,
            issue_date,
            created_at,
            status,
            suppliers (
              id,
              name
            )
          )
        `)
        .in('material_id', pendingMaterialIds);

      if (!qrError && qrItems) {
        qrItems.forEach((item: any) => {
          if (!item.material_id || !item.quote_requests) return;
          const qr = item.quote_requests;
          if (!map[item.material_id]) {
            map[item.material_id] = [];
          }
          if (!map[item.material_id].some(o => o.orderId === qr.id)) {
            map[item.material_id].push({
              orderId: qr.id,
              sequenceNumber: qr.sequence_number,
              issueDate: qr.issue_date,
              createdAt: qr.created_at || item.created_at,
              status: qr.status,
              supplierName: qr.suppliers?.name || null,
              type: 'QR'
            });
          }
        });
      }

      // Sort chronologically (oldest first so creation/origin is first)
      Object.keys(map).forEach(matId => {
        map[matId].sort((a, b) => {
          const dateA = new Date(a.createdAt || a.issueDate || 0).getTime();
          const dateB = new Date(b.createdAt || b.issueDate || 0).getTime();
          return dateA - dateB;
        });
      });

      return map;
    },
    enabled: role === 'admin' && pendingMaterialIds.length > 0
  });

  const filteredMaterials = pendingMaterials.filter(material => {
    if (selectedCategoryFilter === 'all') return true;
    return material.category === selectedCategoryFilter;
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (materialId: string) => {
      const materialToApprove = pendingMaterials.find(m => m.id === materialId);
      const isMaster = !materialToApprove?.base_material_id;

      const { data, error } = await supabase
        .from('materials')
        .update({ 
          status: 'active',
          is_master: isMaster
        })
        .eq('id', materialId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      showSuccess(`Material "${data.name}" aprobado y activado con éxito.`);
      queryClient.invalidateQueries({ queryKey: ['pending_materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    },
    onError: (err: any) => {
      console.error('[Approve Material Error]:', err);
      showError('Error al aprobar el material.');
    }
  });



  // Link to master handler
  const handleLinkToMasterSubmit = async () => {
    if (!linkingMaterial || !selectedParentId) return;
    setIsLinkingSubmitting(true);
    try {
      // Call resolve_materials_unified RPC
      const { error } = await supabase.rpc('resolve_materials_unified', {
        p_action: 'merge',
        p_target_material_id: selectedParentId,
        p_source_material_ids: [linkingMaterial.id]
      });

      if (error) throw error;

      showSuccess(`Material "${linkingMaterial.name}" vinculado exitosamente al Patrón de Oro "${selectedParentName}".`);
      setLinkingMaterial(null);
      setSelectedParentId('');
      setSelectedParentName('');
      queryClient.invalidateQueries({ queryKey: ['pending_materials'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
    } catch (err: any) {
      console.error('[Link to Master Error]:', err);
      showError('Error al vincular el material.');
    } finally {
      setIsLinkingSubmitting(false);
    }
  };

  if (isLoadingSession || isLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-procarni-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-procarni-blue">
            Aprobación de Nuevos Materiales
          </h1>
          <p className="text-sm text-gray-500 font-medium italic mt-1">
            Revisa, edita, aprueba o vincula materiales pendientes para mantener la integridad del catálogo.
          </p>
        </div>
      </div>

      {/* Main Card */}
      <Card className="bg-white border border-slate-100/80 shadow-2xl shadow-gray-200/50 rounded-[2rem] overflow-hidden">
        <CardHeader>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold text-procarni-dark flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
                Bandeja de Entrada de Materiales Pendientes
              </CardTitle>
              <CardDescription>
                {pendingMaterials.length === 0 
                  ? 'No hay materiales pendientes de aprobación en este momento.' 
                  : `Tienes ${pendingMaterials.length} material(es) en total que requieren revisión.`}
              </CardDescription>
            </div>
            
            {/* Category filter */}
            {pendingMaterials.length > 0 && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Label htmlFor="cat-filter" className="text-xs font-bold uppercase tracking-widest text-gray-400 whitespace-nowrap">Filtrar por:</Label>
                <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                  <SelectTrigger id="cat-filter" className="w-full md:w-[200px] bg-white border border-gray-200 rounded-xl h-10">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filteredMaterials.length > 0 ? (
            <div className="overflow-x-auto">
              <Table className="bg-white/50 rounded-2xl overflow-hidden border border-gray-100">
                <TableHeader className="bg-slate-100/50">
                  <TableRow>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Nombre</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Categoría</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Unidad</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Marca/Color</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">OC de Origen</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Creado Por</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Fecha</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider font-semibold text-gray-500">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMaterials.map((material) => (
                    <TableRow key={material.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="font-semibold text-slate-800">
                        <div>
                          {material.name}
                          {material.code && (
                            <span className="text-[11px] font-mono text-gray-400 block">{material.code}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50 text-slate-700">
                          {material.category || 'Sin Categoría'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-slate-600">{material.unit || 'N/A'}</TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {material.brand && <span>Marca: {material.brand}</span>}
                        {material.brand && material.color && <br />}
                        {material.color && <span>Color: {material.color}</span>}
                        {!material.brand && !material.color && <span className="text-gray-300">-</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {(() => {
                          const originOrders = materialOriginOrders[material.id] || [];
                          if (isLoadingOriginOrders) {
                            return <span className="text-slate-400 text-xs animate-pulse">Cargando...</span>;
                          }
                          if (originOrders.length === 0) {
                            return (
                              <span className="text-slate-400 text-xs italic">Directo / Catálogo</span>
                            );
                          }

                          const primaryOrder = originOrders[0];
                          const otherOrders = originOrders.slice(1);
                          const isPO = primaryOrder.type === 'PO';
                          const linkUrl = isPO 
                            ? `/purchase-orders/${primaryOrder.orderId}` 
                            : `/quote-requests/${primaryOrder.orderId}`;
                          const displayLabel = isPO
                            ? formatOrderNumber(primaryOrder.sequenceNumber, primaryOrder.issueDate || primaryOrder.createdAt)
                            : formatQuoteNumber(primaryOrder.sequenceNumber, primaryOrder.issueDate || primaryOrder.createdAt);

                          return (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <a
                                  href={linkUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-blue-50 text-procarni-blue hover:bg-blue-100 hover:text-procarni-dark transition-all border border-blue-200/60 shadow-xs group/po"
                                  title={`Abrir orden en nueva pestaña: ${displayLabel}`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileText className="h-3.5 w-3.5 text-blue-600 group-hover/po:scale-110 transition-transform" />
                                  <span className="font-mono font-bold">{displayLabel}</span>
                                  <ExternalLink className="h-3 w-3 text-blue-400 group-hover/po:text-blue-600 transition-colors ml-0.5" />
                                </a>

                                {otherOrders.length > 0 && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <button 
                                        type="button"
                                        className="inline-flex items-center text-[10px] font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-md transition-colors"
                                        title="Ver más órdenes asociadas"
                                      >
                                        +{otherOrders.length} más
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-56 p-1.5 rounded-xl shadow-xl border border-slate-100" onClick={(e) => e.stopPropagation()}>
                                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Otras Órdenes / Solicitudes
                                      </div>
                                      {otherOrders.map((other) => {
                                        const otherIsPO = other.type === 'PO';
                                        const otherLink = otherIsPO ? `/purchase-orders/${other.orderId}` : `/quote-requests/${other.orderId}`;
                                        const otherLabel = otherIsPO
                                          ? formatOrderNumber(other.sequenceNumber, other.issueDate || other.createdAt)
                                          : formatQuoteNumber(other.sequenceNumber, other.issueDate || other.createdAt);

                                        return (
                                          <DropdownMenuItem key={other.orderId} asChild>
                                            <a
                                              href={otherLink}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg cursor-pointer hover:bg-slate-50 text-slate-700 w-full"
                                            >
                                              <span className="font-mono font-semibold text-procarni-blue">{otherLabel}</span>
                                              <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={other.supplierName || ''}>
                                                {other.supplierName || '-'}
                                              </span>
                                            </a>
                                          </DropdownMenuItem>
                                        );
                                      })}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                              </div>

                              {primaryOrder.supplierName && (
                                <span className="text-[11px] text-slate-500 font-medium truncate max-w-[160px] block" title={primaryOrder.supplierName}>
                                  {primaryOrder.supplierName}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-slate-600">
                        {material.user_id ? (creatorProfiles[material.user_id] || 'Cargando...') : 'Sistema'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {material.created_at ? new Date(material.created_at).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell className="text-right pr-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-xl hover:bg-slate-100 text-slate-500"
                              title="Opciones"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52 rounded-2xl shadow-xl border border-slate-100 p-1.5">
                            <DropdownMenuItem
                              onClick={() => approveMutation.mutate(material.id)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-emerald-700 hover:bg-emerald-50"
                            >
                              <Check className="h-4 w-4 text-emerald-600" />
                              <span>Aprobar Material</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setLinkingMaterial(material)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-blue-700 hover:bg-blue-50"
                            >
                              <Link className="h-4 w-4 text-blue-600" />
                              <span>Vincular a Patrón de Oro</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setEditingMaterial(material)}
                              className="flex items-center gap-2 text-xs font-semibold py-2 rounded-xl cursor-pointer text-slate-700 hover:text-procarni-blue hover:bg-slate-50"
                            >
                              <Edit className="h-4 w-4 text-slate-400" />
                              <span>Editar Material</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : pendingMaterials.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-slate-100 text-slate-400 p-4 rounded-full mb-4 ring-8 ring-slate-50/50">
                <Search className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Sin coincidencias</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                No hay materiales pendientes en la categoría seleccionada ("{selectedCategoryFilter}").
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="bg-emerald-50 text-emerald-600 p-4 rounded-full mb-4 ring-8 ring-emerald-50/50">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">¡Todo limpio!</h3>
              <p className="text-sm text-slate-500 max-w-sm mt-1">
                No hay nuevos materiales pendientes de revisión. Tu catálogo se encuentra al día.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Linking to Master Dialog */}
      <Dialog open={!!linkingMaterial} onOpenChange={(open) => !open && setLinkingMaterial(null)}>
        <DialogContent className="sm:max-w-[450px] rounded-3xl bg-white/95 backdrop-blur-xl border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-procarni-blue">Vincular a Patrón de Oro</DialogTitle>
            <DialogDescription>
              Vincular el material pendiente <strong className="text-procarni-dark">"{linkingMaterial?.name}"</strong> a un material oficial. El material pendiente se archivará y todo su historial pasará al maestro.
            </DialogDescription>
            {linkingMaterial && materialOriginOrders[linkingMaterial.id]?.length > 0 && (
              <div className="mt-2 bg-blue-50/80 border border-blue-200/70 rounded-xl p-2.5 flex items-center gap-2 text-xs text-slate-700">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span>
                  Creado en{' '}
                  <strong className="font-mono text-procarni-blue">
                    {materialOriginOrders[linkingMaterial.id][0].type === 'PO' ? 'OC' : 'SC'}-
                    {materialOriginOrders[linkingMaterial.id][0].sequenceNumber}
                  </strong>
                  {materialOriginOrders[linkingMaterial.id][0].supplierName && (
                    <> ({materialOriginOrders[linkingMaterial.id][0].supplierName})</>
                  )}
                </span>
              </div>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="parentMaterial">Buscar Material Maestro Oficial</Label>
              <SmartSearch 
                placeholder="Escribe el nombre del patrón de oro..."
                displayValue={selectedParentName}
                selectedId={selectedParentId}
                onSelect={(item) => {
                  setSelectedParentId(item.id);
                  setSelectedParentName(item.name.split(' - ')[0]);
                }}
                fetchFunction={async (query) => {
                  if (!linkingMaterial) return [];

                  const { data, error } = await supabase.rpc('search_master_materials_suggested', {
                    p_target_name: linkingMaterial.name,
                    p_search_query: query.trim(),
                    p_exclude_id: linkingMaterial.id
                  });

                  if (error) {
                    console.error('[search_master_materials_suggested Error]:', error);
                    return [];
                  }

                  return (data || []).map((m: any) => ({
                    id: m.id,
                    name: `${m.name} - ${m.code || 'Sin código'}`,
                    group: m.is_suggested ? '⭐ Sugeridos (Similitud Trigrama)' : 'Otros Patrones de Oro'
                  }));
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkingMaterial(null)} className="rounded-xl">
              Cancelar
            </Button>
            <Button 
              onClick={handleLinkToMasterSubmit} 
              disabled={!selectedParentId || isLinkingSubmitting}
              className="bg-procarni-blue hover:bg-slate-800 text-white rounded-xl shadow-lg"
            >
              {isLinkingSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Vinculando...
                </>
              ) : 'Confirmar Vínculo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editing dialog reused from MaterialCreationDialog */}
      <MaterialCreationDialog 
        isOpen={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        editingMaterial={editingMaterial}
        onMaterialCreated={(updatedMat) => {
          // Since it was edited, we approve it as well (as standard flow)
          approveMutation.mutate(updatedMat.id);
          setEditingMaterial(null);
        }}
      />
    </div>
  );
};

export default MaterialApproval;
