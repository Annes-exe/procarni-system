import React, { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  UploadCloud,
  Eye,
  Search,
  Trash2,
  FileText,
  CheckCircle2,
  FileUp,
  ExternalLink,
  ChevronRight,
  Filter
} from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import SmartSearch from '@/components/SmartSearch';
import {
  searchSuppliers,
  uploadFichaTecnica,
  getAllFichasTecnicas,
  searchMaterialsBySupplier,
  deleteFichaTecnica
} from '@/integrations/supabase/data';
import { uploadToCloudinary } from '@/services/cloudinaryService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FichaTecnica } from '@/integrations/supabase/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Supplier {
  id: string;
  name: string;
  rif: string;
}

interface MaterialSearchResult {
  id: string;
  name: string;
  code: string;
  category?: string;
  unit?: string;
  is_exempt?: boolean;
  specification?: string;
}

const FichaTecnicaUpload = () => {
  const { session } = useSession();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialSearchResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentFichaUrl, setCurrentFichaUrl] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [fichaToDelete, setFichaToDelete] = useState<any | null>(null);

  const { data: fichas, isLoading: isLoadingFichas } = useQuery<FichaTecnica[]>({
    queryKey: ['fichasTecnicas'],
    queryFn: getAllFichasTecnicas,
    enabled: !!session,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, cloudinary_public_id }: { id: string; cloudinary_public_id?: string }) =>
      deleteFichaTecnica(id, cloudinary_public_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fichasTecnicas'] });
      showSuccess('Ficha técnica eliminada exitosamente.');
      setIsDeleteDialogOpen(false);
      setFichaToDelete(null);
    },
    onError: (err: any) => {
      showError(`Error al eliminar ficha: ${err.message}`);
      setIsDeleteDialogOpen(false);
      setFichaToDelete(null);
    },
  });

  const filteredFichas = useMemo(() => {
    if (!fichas) return [];
    if (!searchTerm) return fichas;

    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return fichas.filter(ficha =>
      ficha.nombre_producto.toLowerCase().includes(lowerCaseSearchTerm) ||
      ((ficha as any).suppliers?.name && (ficha as any).suppliers.name.toLowerCase().includes(lowerCaseSearchTerm))
    );
  }, [fichas, searchTerm]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type !== 'application/pdf') {
        showError('Solo se permiten archivos PDF.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleSupplierSelect = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSelectedMaterial(null);
  };

  const handleMaterialSelect = (material: MaterialSearchResult) => {
    setSelectedMaterial(material);
  };

  const searchSupplierMaterials = async (query: string) => {
    if (!selectedSupplier) return [];
    return searchMaterialsBySupplier(selectedSupplier.id, query);
  };

  const handleUpload = async () => {
    if (!selectedSupplier || !selectedMaterial || !selectedFile) {
      showError('Por favor, completa todos los campos requeridos y selecciona un archivo.');
      return;
    }

    setIsUploading(true);

    try {
      const sanitizedSupplierName = selectedSupplier.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/-+/g, '_');

      const targetFolder = `procarni_system/fichas_tecnicas/${sanitizedSupplierName}`;
      const cloudinaryResponse = await uploadToCloudinary(selectedFile, targetFolder);

      const payload = {
        nombre_producto: selectedMaterial.name,
        proveedor_id: selectedSupplier.id,
        storage_url: cloudinaryResponse.secure_url,
        cloudinary_public_id: cloudinaryResponse.public_id,
      };

      const newFicha = await uploadFichaTecnica(payload);

      if (newFicha) {
        showSuccess('Ficha técnica subida exitosamente.');
        setSelectedSupplier(null);
        setSelectedMaterial(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        queryClient.invalidateQueries({ queryKey: ['fichasTecnicas'] });
      }
    } catch (error: any) {
      console.error('Error during upload:', error);
      showError(error.message || 'Error desconocido al subir la ficha técnica.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleViewFicha = (url: string) => {
    setCurrentFichaUrl(url);
    setIsViewerOpen(true);
  };

  const confirmDelete = (ficha: FichaTecnica) => {
    setFichaToDelete(ficha);
    setIsDeleteDialogOpen(true);
  };

  const executeDelete = async () => {
    if (fichaToDelete) {
      await deleteMutation.mutateAsync({
        id: fichaToDelete.id,
        cloudinary_public_id: fichaToDelete.cloudinary_public_id
      });
    }
  };

  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 animate-in fade-in duration-500">
      <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
        <FileText className="h-8 w-8 text-gray-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900">No hay documentos registrados</h3>
      <p className="text-sm text-gray-500 max-w-xs mt-1">Empieza por subir tu primera ficha técnica usando el formulario de arriba.</p>
    </div>
  );

  const renderFichasTable = () => {
    if (isLoadingFichas) {
      return (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      );
    }

    if (filteredFichas.length === 0) {
      return renderEmptyState();
    }

    if (isMobile) {
      return (
        <div className="grid gap-4">
          {filteredFichas.map((ficha) => (
            <Card key={ficha.id} className="overflow-hidden border-none shadow-md bg-white/80 backdrop-blur-sm hover:shadow-lg transition-all duration-300 group">
              <div className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="bg-procarni-primary/10 p-2 rounded-lg">
                    <FileText className="h-5 w-5 text-procarni-primary" />
                  </div>
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600 border-none font-medium">
                    {ficha.created_at ? new Date(ficha.created_at).toLocaleDateString() : 'N/A'}
                  </Badge>
                </div>
                <h4 className="text-base font-bold text-gray-900 mb-1 leading-tight group-hover:text-procarni-primary transition-colors">{ficha.nombre_producto}</h4>
                <p className="text-sm text-gray-500 line-clamp-1 mb-4">{(ficha as any).suppliers?.name || 'N/A'}</p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 h-9 rounded-lg border-gray-200 hover:bg-procarni-primary/5 hover:text-procarni-primary hover:border-procarni-primary/30 transition-all font-medium"
                    onClick={() => handleViewFicha(ficha.storage_url)}
                  >
                    <Eye className="mr-2 h-4 w-4" /> Ver PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg text-gray-400 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => confirmDelete(ficha)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-gray-100/50 overflow-hidden bg-white/50 backdrop-blur-sm shadow-sm ring-1 ring-black/5">
        <Table>
          <TableHeader className="bg-gray-50/80">
            <TableRow className="border-b border-gray-100 hover:bg-transparent">
              <TableHead className="py-4 pl-6 text-xs font-bold uppercase tracking-wider text-gray-500">Producto / Material</TableHead>
              <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Proveedor</TableHead>
              <TableHead className="py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Fecha</TableHead>
              <TableHead className="py-4 pr-6 text-right text-xs font-bold uppercase tracking-wider text-gray-500 px-4">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFichas.map((ficha) => (
              <TableRow key={ficha.id} className="group border-b border-gray-100 last:border-0 hover:bg-blue-50/30 transition-all duration-200">
                <TableCell className="py-4 pl-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-procarni-primary/5 text-procarni-primary flex items-center justify-center shrink-0 group-hover:bg-procarni-primary group-hover:text-white transition-all duration-300">
                      <FileText className="h-5 w-5" />
                    </div>
                    <span className="font-semibold text-gray-900 group-hover:text-procarni-primary transition-colors">{ficha.nombre_producto}</span>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-gray-600 font-medium">{(ficha as any).suppliers?.name || 'Prov. Desconocido'}</span>
                </TableCell>
                <TableCell className="py-4">
                  <span className="text-gray-500 text-sm">{ficha.created_at ? new Date(ficha.created_at).toLocaleDateString() : '-'}</span>
                </TableCell>
                <TableCell className="py-4 pr-6 text-right">
                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-procarni-primary hover:bg-procarni-primary/10"
                      onClick={() => handleViewFicha(ficha.storage_url)}
                      title="Ver Documento"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-lg text-gray-400 hover:text-destructive hover:bg-destructive/10"
                      onClick={() => confirmDelete(ficha)}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-8 pb-20">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="px-0 hover:bg-transparent text-gray-500 hover:text-procarni-primary transition-colors group"
            >
              <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
              Volver
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-procarni-primary flex items-center justify-center shadow-lg shadow-procarni-primary/20">
                <FileUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold text-procarni-blue tracking-tight leading-none">Fichas Técnicas</h1>
                <p className="text-gray-500 mt-1 font-medium italic">Gestión de documentación técnica de proveedores</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400 bg-white px-4 py-2 rounded-full shadow-sm border border-gray-100">
            <CheckCircle2 className="h-4 w-4 text-procarni-secondary" />
            <span>Respaldado en Cloudinary</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Main Upload Card - Glassmorphism */}
          <Card className="lg:col-span-8 border-none shadow-2xl shadow-gray-200/50 bg-white/70 backdrop-blur-xl ring-1 ring-white overflow-hidden rounded-[2rem]">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-transparent border-b border-gray-100 py-6 pr-4">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-xl text-gray-900 font-bold">Subida de Documentos</CardTitle>
                  <CardDescription className="text-gray-500 mt-0.5">Asocia un PDF técnico a un proveedor y producto específico.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2 group">
                  <Label htmlFor="supplier" className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 group-focus-within:text-procarni-primary transition-colors">
                    Proveedor Selecto
                  </Label>
                  <div className="relative group/search">
                    <SmartSearch
                      placeholder="Busca un proveedor..."
                      onSelect={handleSupplierSelect}
                      fetchFunction={searchSuppliers}
                      displayValue={selectedSupplier?.name || ''}
                      disabled={isUploading}
                    />
                  </div>
                  {selectedSupplier && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-procarni-secondary/10 rounded-lg animate-in zoom-in-95 duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-procarni-secondary" />
                      <span className="text-xs font-semibold text-procarni-secondary">RIF: {selectedSupplier.rif}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2 group">
                  <Label htmlFor="product" className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1 group-focus-within:text-procarni-primary transition-colors">
                    Material / Producto
                  </Label>
                  <div className="relative">
                    <SmartSearch
                      placeholder={selectedSupplier ? "Busca el material..." : "Espera por proveedor..."}
                      onSelect={handleMaterialSelect}
                      fetchFunction={searchSupplierMaterials}
                      displayValue={selectedMaterial?.name || ''}
                      disabled={isUploading || !selectedSupplier}
                    />
                  </div>
                  {selectedMaterial && (
                    <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-procarni-primary/10 rounded-lg animate-in zoom-in-95 duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-procarni-primary" />
                      <span className="text-xs font-semibold text-procarni-primary">Cód: {selectedMaterial.code}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced File Drop Zone */}
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-1">Documento Técnico (PDF)</Label>
                <input
                  id="pdfFile"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  disabled={isUploading}
                />

                <div
                  onClick={triggerFileSelect}
                  className={cn(
                    "relative group cursor-pointer transition-all duration-500 overflow-hidden",
                    "border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 text-center",
                    selectedFile
                      ? "border-procarni-secondary bg-procarni-secondary/5"
                      : "border-gray-200 bg-gray-50/50 hover:bg-white hover:border-procarni-primary/40 hover:shadow-xl hover:shadow-procarni-primary/5"
                  )}
                >
                  <div className={cn(
                    "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500",
                    selectedFile
                      ? "bg-procarni-secondary text-white transform rotate-0"
                      : "bg-white text-gray-400 shadow-sm group-hover:bg-procarni-primary group-hover:text-white group-hover:rotate-12"
                  )}>
                    {selectedFile ? <CheckCircle2 className="h-8 w-8" /> : <UploadCloud className="h-8 w-8" />}
                  </div>

                  <div>
                    <h5 className={cn(
                      "text-lg font-bold transition-colors",
                      selectedFile ? "text-procarni-secondary" : "text-gray-700 group-hover:text-procarni-primary"
                    )}>
                      {selectedFile ? "¡Archivo Listo!" : "Haz clic para seleccionar"}
                    </h5>
                    <p className="text-sm text-gray-400 mt-1">
                      {selectedFile ? selectedFile.name : "Solo se admiten archivos PDF técnicos"}
                    </p>
                  </div>

                  {/* Background decoration in drop zone */}
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <FileText className="h-32 w-32 -mr-8 -mt-8 rotate-12" />
                  </div>
                </div>
              </div>

              <div className="flex pt-4">
                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !selectedSupplier || !selectedMaterial || !selectedFile}
                  className={cn(
                    "w-full h-14 rounded-2xl text-lg font-bold shadow-xl transition-all duration-300",
                    "bg-gradient-to-r from-procarni-primary to-procarni-secondary hover:shadow-procarni-primary/20 hover:scale-[1.01] active:scale-[0.99]",
                    (isUploading || !selectedSupplier || !selectedMaterial || !selectedFile) && "opacity-50 grayscale"
                  )}
                >
                  {isUploading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Subiendo a Cloudinary...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UploadCloud className="h-5 w-5" />
                      <span>Registrar Ficha Técnica</span>
                    </div>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Records & Info - Sidebar style for large screens */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="border-none shadow-xl bg-procarni-blue text-white overflow-hidden rounded-[2rem]">
              <div className="p-8 relative">
                <FileText className="absolute bottom-0 right-0 h-32 w-32 text-white/5 -mb-8 -mr-8 rotate-12" />
                <h3 className="text-xl font-bold mb-2">Estandarización</h3>
                <p className="text-procarni-primary-foreground/80 text-sm leading-relaxed mb-6">
                  Mantener las fichas técnicas actualizadas permite garantizar la calidad de los procesos y agilizar las auditorías de proveedores.
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm font-medium bg-white/10 p-2.5 rounded-xl border border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-procarni-secondary" />
                    Búsqueda inteligente por RIF
                  </div>
                  <div className="flex items-center gap-3 text-sm font-medium bg-white/10 p-2.5 rounded-xl border border-white/10">
                    <div className="w-1.5 h-1.5 rounded-full bg-procarni-secondary" />
                    Filtrado automático por producto
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-procarni-blue">Estadísticas</h3>
                  <Badge className="bg-procarni-blue/10 text-procarni-blue border-none">Hoy</Badge>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500 font-medium">Total Documentos</span>
                    <span className="font-bold text-gray-900">{fichas?.length || 0}</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-50 rounded-full overflow-hidden">
                    <div className="h-full bg-procarni-primary rounded-full transition-all duration-1000" style={{ width: `${Math.min((fichas?.length || 0) * 5, 100)}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* List Section */}
        <div className="space-y-6 pt-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Documentos Registrados</h2>
              <p className="text-gray-500 text-sm italic">Explora, visualiza o descarga la documentación técnica</p>
            </div>

            <div className="relative w-full md:w-80 group">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-procarni-primary" />
              </div>
              <Input
                type="text"
                placeholder="Busca por material o proveedor..."
                className="w-full h-11 pl-10 pr-4 bg-white border-gray-100 rounded-2xl shadow-sm focus:ring-procarni-primary focus:border-procarni-primary transition-all duration-300"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="animate-in fade-in slide-in-from-top-4 duration-1000 delay-200">
            {renderFichasTable()}
          </div>
        </div>
      </div>

      {/* Modern PDF Viewer Dialog */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-[95vw] lg:max-w-6xl h-[95vh] p-0 overflow-hidden rounded-3xl border-none shadow-2xl bg-gray-900">
          <DialogHeader className="p-4 bg-white/10 backdrop-blur-xl border-b border-white/10 flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle className="text-lg text-white font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-procarni-secondary" />
                Visor de Ficha Técnica
              </DialogTitle>
              <DialogDescription className="text-gray-400 mt-0">Documento certificado y verificado.</DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex-1 w-full h-full bg-[#323639] relative group">
            {currentFichaUrl ? (
              <iframe
                src={currentFichaUrl}
                className="w-full h-full border-none"
                title="PDF Viewer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                <p className="text-white/60 font-medium">Cargando documento...</p>
              </div>
            )}

            {/* Quick Actions overlay for the viewer */}
            <div className="absolute bottom-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <Button
                asChild
                className="rounded-full bg-white text-gray-900 hover:bg-procarni-secondary hover:text-white transition-colors h-12 font-bold px-6 shadow-2xl"
              >
                <a href={currentFichaUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir en pestaña nueva
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Premium AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl border-none shadow-2xl p-8 max-w-md">
          <AlertDialogHeader>
            <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mb-4 animate-bounce duration-1000">
              <Trash2 className="h-8 w-8 text-destructive" />
            </div>
            <AlertDialogTitle className="text-2xl font-black text-gray-900">¿Proceder con eliminación?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 text-base py-2">
              Se eliminará permanentemente <span className="font-bold text-gray-900 italic">"{fichaToDelete?.nombre_producto}"</span> y se retirará el archivo físico de Cloudinary. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-8 gap-3 sm:gap-0">
            <AlertDialogCancel
              disabled={deleteMutation.isPending}
              className="rounded-xl border-gray-100 text-gray-500 font-bold hover:bg-gray-50"
            >
              Mantener documento
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              disabled={deleteMutation.isPending}
              className={cn(
                "rounded-xl bg-destructive text-white font-bold hover:bg-red-600 transition-all",
                deleteMutation.isPending && "grayscale animate-pulse"
              )}
            >
              {deleteMutation.isPending ? 'Procesando...' : 'Confirmar borrado'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FichaTecnicaUpload;