import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, UploadCloud, Eye, Search, Trash2 } from 'lucide-react';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import { showError, showSuccess } from '@/utils/toast';
import SmartSearch from '@/components/SmartSearch';
import { searchSuppliers, uploadFichaTecnica, getAllFichasTecnicas, searchMaterialsBySupplier, deleteFichaTecnica } from '@/integrations/supabase/data';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FichaTecnica } from '@/integrations/supabase/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useIsMobile } from '@/hooks/use-mobile';

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

  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialSearchResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [currentFichaUrl, setCurrentFichaUrl] = useState('');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [fichaToDelete, setFichaToDelete] = useState<any | null>(null);

  const { data: fichas, isLoading: isLoadingFichas, refetch } = useQuery<any[]>({
    queryKey: ['fichasTecnicas'],
    queryFn: getAllFichasTecnicas,
    enabled: !!session,
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, storage_url }: { id: string; storage_url: string }) => deleteFichaTecnica(id, storage_url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fichasTecnicas'] });
      showSuccess('Ficha técnica eliminada exitosamente.');
      setIsDeleteDialogOpen(false);
      setFichaToDelete(null);
    },
    onError: (err) => {
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
      (ficha.suppliers?.name && ficha.suppliers.name.toLowerCase().includes(lowerCaseSearchTerm))
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

  const handleSupplierSelect = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setSelectedMaterial(null); // Reset material when supplier changes
  };

  const handleMaterialSelect = (material: MaterialSearchResult) => {
    setSelectedMaterial(material);
  };

  const searchSupplierMaterials = async (query: string) => {
    if (!selectedSupplier) return [];
    // We use the material name as the product name for the ficha técnica
    return searchMaterialsBySupplier(selectedSupplier.id, query);
  };

  const handleUpload = async () => {
    if (!selectedSupplier) {
      showError('Por favor, selecciona un proveedor.');
      return;
    }
    if (!selectedMaterial) {
      showError('Por favor, selecciona un material/producto.');
      return;
    }
    if (!selectedFile) {
      showError('Por favor, selecciona un archivo PDF.');
      return;
    }

    setIsUploading(true);

    try {
      // Convert file to Base64
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // Extract Base64 string after the comma (removing data URL prefix)
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(selectedFile);
      });

      const payload = {
        nombre_producto: selectedMaterial.name, // Use material name as product name
        proveedor_id: selectedSupplier.id,
        fileBase64: fileBase64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
      };

      // Log the payload to verify it's correct
      console.log('[FichaTecnicaUpload] Payload:', payload);

      const newFicha = await uploadFichaTecnica(payload);

      if (newFicha) {
        showSuccess('Ficha técnica subida y registrada exitosamente.');
        // Reset form
        setSelectedSupplier(null);
        setSelectedMaterial(null);
        setSelectedFile(null);
        // Clear file input manually
        const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        // Force refetch the list
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

  const confirmDelete = (ficha: any) => {
    setFichaToDelete(ficha);
    setIsDeleteDialogOpen(true);
  };

  const executeDelete = async () => {
    if (fichaToDelete) {
      await deleteMutation.mutateAsync({ id: fichaToDelete.id, storage_url: fichaToDelete.storage_url });
    }
  };

  const renderFichasTable = () => {
    if (isLoadingFichas) {
      return <div className="text-center text-muted-foreground p-8">Cargando fichas técnicas...</div>;
    }

    if (filteredFichas.length === 0) {
      return <div className="text-center text-muted-foreground p-8">No hay fichas técnicas registradas o no se encontraron resultados.</div>;
    }

    if (isMobile) {
      return (
        <div className="grid gap-4">
          {filteredFichas.map((ficha) => (
            <Card key={ficha.id} className="p-4">
              <CardTitle className="text-lg mb-1 truncate">{ficha.nombre_producto}</CardTitle>
              <CardDescription className="mb-2">Proveedor: {ficha.suppliers?.name || 'N/A'}</CardDescription>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => handleViewFicha(ficha.storage_url)}>
                  <Eye className="mr-2 h-4 w-4" /> Ver PDF
                </Button>
                <Button variant="destructive" size="sm" onClick={() => confirmDelete(ficha)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="rounded-md border border-gray-100 overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 pl-4 py-3">Producto</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Proveedor</TableHead>
              <TableHead className="font-semibold text-xs tracking-wider uppercase text-gray-500 py-3">Fecha Subida</TableHead>
              <TableHead className="text-right font-semibold text-xs tracking-wider uppercase text-gray-500 pr-4 py-3">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFichas.map((ficha) => (
              <TableRow key={ficha.id} className="hover:bg-gray-50/50 transition-colors">
                <TableCell className="pl-4 py-3 font-medium text-procarni-dark">{ficha.nombre_producto}</TableCell>
                <TableCell className="py-3 text-gray-600">{ficha.suppliers?.name || 'N/A'}</TableCell>
                <TableCell className="py-3 text-gray-600">{new Date(ficha.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right pr-4 py-3">
                  <Button variant="ghost" size="icon" onClick={() => handleViewFicha(ficha.storage_url)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => confirmDelete(ficha)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-procarni-primary tracking-tight">Fichas Técnicas</h1>
          <p className="text-muted-foreground text-sm">Gestiona los documentos técnicos asociados a proveedores y productos.</p>
        </div>
      </div>

      <Card className="mb-6 border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg text-procarni-primary">Subir Nueva Ficha</CardTitle>
          <CardDescription>Asocia un documento PDF a un proveedor y producto.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label htmlFor="supplier">Proveedor *</Label>
              <SmartSearch
                placeholder="Buscar proveedor por RIF o nombre"
                onSelect={handleSupplierSelect}
                fetchFunction={searchSuppliers}
                displayValue={selectedSupplier?.name || ''}
                disabled={isUploading}
              />
              {selectedSupplier && <p className="text-sm text-muted-foreground mt-1">Proveedor seleccionado: {selectedSupplier.name}</p>}
            </div>
            <div>
              <Label htmlFor="productName">Producto (Material) *</Label>
              <SmartSearch
                placeholder={selectedSupplier ? "Buscar material asociado al proveedor" : "Selecciona un proveedor primero"}
                onSelect={handleMaterialSelect}
                fetchFunction={searchSupplierMaterials}
                displayValue={selectedMaterial?.name || ''}
                disabled={isUploading || !selectedSupplier}
              />
              {selectedMaterial && <p className="text-sm text-muted-foreground mt-1">Material seleccionado: {selectedMaterial.name} ({selectedMaterial.code})</p>}
            </div>
          </div>

          <div className="grid gap-2 mb-6">
            <Label htmlFor="pdfFile">Archivo PDF *</Label>
            <Input
              id="pdfFile"
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              disabled={isUploading}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground">Archivo seleccionado: {selectedFile.name}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleUpload} disabled={isUploading || !selectedSupplier || !selectedMaterial || !selectedFile} className="bg-procarni-secondary hover:bg-green-700">
              <UploadCloud className="mr-2 h-4 w-4" />
              {isUploading ? 'Subiendo...' : 'Subir Ficha Técnica'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-transparent md:bg-white md:border md:border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Documentos Registrados</CardTitle>
          <CardDescription>Lista de documentos subidos.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:p-6 pt-0">
          <div className="relative mb-4 px-4 md:px-0 mt-4 md:mt-0">
            <Search className="absolute left-6 md:left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por producto o proveedor..."
              className="w-full appearance-none bg-background pl-8 shadow-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {renderFichasTable()}
        </CardContent>
      </Card>

      <MadeWithDyad />

      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Visualización de Ficha Técnica</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {currentFichaUrl ? (
              <iframe src={currentFichaUrl} className="w-full h-full border-none" title="PDF Viewer"></iframe>
            ) : (
              <div className="text-center text-destructive">No se pudo cargar el documento.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog for delete confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás absolutamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la ficha técnica "{fichaToDelete?.nombre_producto}" y su archivo asociado del almacenamiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FichaTecnicaUpload;