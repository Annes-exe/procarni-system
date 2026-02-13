import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MadeWithDyad } from '@/components/made-with-dyad';
import { UploadCloud, FileText, Download, Trash2, DatabaseBackup, RefreshCw } from 'lucide-react';
import { showError, showSuccess, showLoading, dismissToast } from '@/utils/toast';
import { useSession } from '@/components/SessionContextProvider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import PinInputDialog from '@/components/PinInputDialog';
import ResetDataButton from '@/components/ResetDataButton'; // Import the new ResetDataButton component

interface UploadResult {
  successCount: number;
  failureCount: number;
  errors: Array<{ row: number; data: any; reason: string }>;
  message: string;
}

const BulkUpload = () => {
  const { session } = useSession();
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [materialFile, setMaterialFile] = useState<File | null>(null);
  const [relationFile, setRelationFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // State for PIN dialog
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pinActionType, setPinActionType] = useState<'backup' | 'delete' | null>(null);
  const [pinDataType, setPinDataType] = useState<'supplier' | 'material' | 'supplier_material_relation' | null>(null);
  const [isConfirmingPin, setIsConfirmingPin] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, type: 'supplier' | 'material' | 'supplier_material_relation') => {
    if (event.target.files && event.target.files[0]) {
      if (type === 'supplier') {
        setSupplierFile(event.target.files[0]);
      } else if (type === 'material') {
        setMaterialFile(event.target.files[0]);
      } else {
        setRelationFile(event.target.files[0]);
      }
      setUploadResult(null); // Clear previous results
    }
  };

  const handleUpload = async (type: 'supplier' | 'material' | 'supplier_material_relation') => {
    const file = type === 'supplier' ? supplierFile : (type === 'material' ? materialFile : relationFile);
    if (!file) {
      showError('Por favor, selecciona un archivo Excel para cargar.');
      return;
    }
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión.');
      return;
    }

    setUploading(true);
    const loadingToastId = showLoading(`Cargando y procesando ${type === 'supplier' ? 'proveedores' : (type === 'material' ? 'materiales' : 'relaciones proveedor-material')}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al procesar la carga masiva de ${type === 'supplier' ? 'proveedores' : (type === 'material' ? 'materiales' : 'relaciones proveedor-material')}.`);
      }

      const result: UploadResult = await response.json();
      setUploadResult(result);

      dismissToast(loadingToastId); // Dismiss the loading toast
      if (result.failureCount > 0) {
        showError(`Carga completada con ${result.failureCount} errores. Revisa los detalles.`);
      } else {
        showSuccess(result.message);
      }

      // Clear the file input after successful upload
      if (type === 'supplier') {
        setSupplierFile(null);
      } else if (type === 'material') {
        setMaterialFile(null);
      } else {
        setRelationFile(null);
      }

    } catch (error: any) {
      console.error('[BulkUpload] Error during upload:', error);
      dismissToast(loadingToastId); // Dismiss the loading toast even on error
      showError(error.message || 'Error desconocido al realizar la carga masiva.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async (type: 'supplier' | 'material' | 'supplier_material_relation', mode: 'template' | 'backup', pin?: string) => {
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión para descargar.');
      return;
    }

    setDownloadingTemplate(true);
    const loadingToastId = showLoading(`Generando ${mode === 'template' ? 'plantilla' : 'respaldo'} de ${type === 'supplier' ? 'proveedores' : (type === 'material' ? 'materiales' : 'relaciones proveedor-material')}...`);

    try {
      const functionName = mode === 'template' ? 'generate-template' : 'export-data';
      const body = mode === 'template' ? JSON.stringify({ type }) : JSON.stringify({ type, pin });

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: body,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al generar ${mode === 'template' ? 'la plantilla' : 'el respaldo'}.`);
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const fileNameMatch = contentDisposition && contentDisposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch ? fileNameMatch[1] : `${mode === 'template' ? 'plantilla' : 'respaldo'}_${type}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      dismissToast(loadingToastId);
      showSuccess(`${mode === 'template' ? 'Plantilla' : 'Respaldo'} descargado exitosamente.`);
    } catch (error: any) {
      console.error('[BulkUpload] Error downloading data:', error);
      dismissToast(loadingToastId);
      showError(error.message || `Error desconocido al descargar ${mode === 'template' ? 'la plantilla' : 'el respaldo'}.`);
    } finally {
      setDownloadingTemplate(false);
      setIsConfirmingPin(false);
      setIsPinDialogOpen(false);
    }
  };

  const handleDeleteAll = async (type: 'supplier' | 'material' | 'supplier_material_relation', pin: string) => {
    if (!session) {
      showError('No hay sesión activa. Por favor, inicia sesión para eliminar datos.');
      return;
    }

    setIsConfirmingPin(true);
    const loadingToastId = showLoading(`Eliminando todos los ${type === 'supplier' ? 'proveedores' : (type === 'material' ? 'materiales' : 'relaciones proveedor-material')}...`);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-all-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, pin }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error al eliminar todos los ${type === 'supplier' ? 'proveedores' : (type === 'material' ? 'materiales' : 'relaciones proveedor-material')}.`);
      }

      const result = await response.json();
      dismissToast(loadingToastId);
      showSuccess(result.message);

      // Optionally, invalidate queries to refresh data in other components
      // queryClient.invalidateQueries({ queryKey: [type === 'supplier' ? 'suppliers' : (type === 'material' ? 'materials' : 'supplierMaterials')] });

    } catch (error: any) {
      console.error('[BulkUpload] Error deleting all data:', error);
      dismissToast(loadingToastId);
      showError(error.message || 'Error desconocido al eliminar datos.');
    } finally {
      setIsConfirmingPin(false);
      setIsPinDialogOpen(false);
    }
  };

  const openPinDialogForBackup = (type: 'supplier' | 'material' | 'supplier_material_relation') => {
    setPinActionType('backup');
    setPinDataType(type);
    setIsPinDialogOpen(true);
  };

  const openPinDialogForDelete = (type: 'supplier' | 'material' | 'supplier_material_relation') => {
    setPinActionType('delete');
    setPinDataType(type);
    setIsPinDialogOpen(true);
  };

  const handlePinConfirm = (pin: string) => {
    if (pinActionType === 'backup' && pinDataType) {
      handleDownloadTemplate(pinDataType, 'backup', pin);
    } else if (pinActionType === 'delete' && pinDataType) {
      handleDeleteAll(pinDataType, pin);
    }
  };

  const renderUploadSection = (type: 'supplier' | 'material' | 'supplier_material_relation') => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sube un archivo Excel (.xlsx) con los datos de {type === 'supplier' ? 'tus proveedores' : (type === 'material' ? 'tus materiales' : 'las relaciones entre proveedores y materiales')}.
        Asegúrate de que el archivo siga el formato de plantilla especificado.
      </p>
      <div className="flex items-center space-x-2">
        <Input
          id={`file-upload-${type}`}
          type="file"
          accept=".xlsx"
          onChange={(e) => handleFileChange(e, type)}
          disabled={uploading}
          className="flex-1"
        />
        <Button
          onClick={() => handleUpload(type)}
          disabled={uploading || (type === 'supplier' ? !supplierFile : (type === 'material' ? !materialFile : !relationFile))}
          className="bg-procarni-secondary hover:bg-green-700"
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          {uploading ? 'Cargando...' : 'Subir Archivo'}
        </Button>
      </div>

      {uploadResult && (
        <Dialog open={!!uploadResult} onOpenChange={() => setUploadResult(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Resultados de la Carga Masiva</DialogTitle>
              <DialogDescription>
                {uploadResult.successCount} registros procesados exitosamente, {uploadResult.failureCount} con errores.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              {uploadResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-destructive">Errores ({uploadResult.failureCount}):</h4>
                  <ul className="list-disc pl-5 text-sm text-destructive">
                    {uploadResult.errors.map((err, index) => (
                      <li key={index}>
                        Fila {err.row}: {err.reason} (Datos: {JSON.stringify(err.data)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {uploadResult.errors.length === 0 && (
                <p className="text-sm text-green-600">Todos los registros se procesaron sin errores.</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <div className="mt-6 p-4 border rounded-md bg-muted/20">
        <h4 className="font-semibold mb-2 flex items-center">
          <FileText className="mr-2 h-4 w-4" />
          Plantilla de Ejemplo para {type === 'supplier' ? 'Proveedores' : (type === 'material' ? 'Materiales' : 'Relaciones Proveedor-Material')}
        </h4>
        <p className="text-sm text-muted-foreground">
          Descarga la plantilla para asegurarte de que tu archivo Excel tenga el formato correcto.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => handleDownloadTemplate(type, 'template')}
          disabled={downloadingTemplate}
        >
          <Download className="mr-2 h-4 w-4" />
          {downloadingTemplate ? 'Generando...' : 'Descargar Plantilla'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          **Columnas esperadas para {type === 'supplier' ? 'Proveedores' : (type === 'material' ? 'Materiales' : 'Relaciones Proveedor-Material')}:**
          <br />
          {type === 'supplier' ? (
            <>
              `Código` (opcional, se autogenera si está vacío, ej: P001), `RIF` (requerido, ej: J123456789), `Nombre` (requerido), `Email`, `Teléfono Principal`, `Teléfono Secundario`, `Instagram`, `Dirección`, `Términos de Pago` (Contado, Crédito, Otro), `Términos de Pago Personalizados` (si es 'Otro'), `Días de Crédito` (si es 'Crédito'), `Estado` (Active, Inactive)
            </>
          ) : type === 'material' ? (
            <>
              `Código` (opcional, se autogenera si está vacío, ej: MT001), `Nombre` (requerido), `Categoría` (requerido, ej: SECA, FRESCA, etc.), `Unidad` (requerido, ej: KG, LT, UND), `Exento de IVA` (Sí/No)
            </>
          ) : (
            <>
              `Código P` (Código del proveedor, requerido, ej: P001), `Código MP` (Código del material, requerido, ej: MT001), `ESPECIFICACION` (opcional, ej: Presentación de 10kg)
            </>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <div className="container mx-auto p-4">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-procarni-primary">Carga Masiva de Datos</CardTitle>
          <CardDescription>Sube tus proveedores, materiales y sus relaciones desde archivos Excel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="suppliers" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
              <TabsTrigger value="materials">Materiales</TabsTrigger>
              <TabsTrigger value="relations">Relaciones P-M</TabsTrigger>
            </TabsList>
            <TabsContent value="suppliers">
              {renderUploadSection('supplier')}
            </TabsContent>
            <TabsContent value="materials">
              {renderUploadSection('material')}
            </TabsContent>
            <TabsContent value="relations">
              {renderUploadSection('supplier_material_relation')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className="mb-6 border-destructive card-alert-border">
        <CardHeader>
          <CardTitle className="text-destructive">Gestión Avanzada de Datos</CardTitle>
          <CardDescription>Opciones para respaldar, eliminar o reiniciar datos existentes. Requiere PIN de seguridad.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Suppliers */}
          <div className="flex flex-col gap-2 p-4 border rounded-md">
            <h4 className="font-semibold">Proveedores</h4>
            <Button
              variant="outline"
              onClick={() => openPinDialogForBackup('supplier')}
              disabled={downloadingTemplate}
            >
              <DatabaseBackup className="mr-2 h-4 w-4" /> Descargar Respaldo
            </Button>
            <Button
              variant="destructive"
              onClick={() => openPinDialogForDelete('supplier')}
              disabled={isConfirmingPin}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar Todos
            </Button>
          </div>

          {/* Materials */}
          <div className="flex flex-col gap-2 p-4 border rounded-md">
            <h4 className="font-semibold">Materiales</h4>
            <Button
              variant="outline"
              onClick={() => openPinDialogForBackup('material')}
              disabled={downloadingTemplate}
            >
              <DatabaseBackup className="mr-2 h-4 w-4" /> Descargar Respaldo
            </Button>
            <Button
              variant="destructive"
              onClick={() => openPinDialogForDelete('material')}
              disabled={isConfirmingPin}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar Todos
            </Button>
          </div>

          {/* Relations */}
          <div className="flex flex-col gap-2 p-4 border rounded-md">
            <h4 className="font-semibold">Relaciones P-M</h4>
            <Button
              variant="outline"
              onClick={() => openPinDialogForBackup('supplier_material_relation')}
              disabled={downloadingTemplate}
            >
              <DatabaseBackup className="mr-2 h-4 w-4" /> Descargar Respaldo
            </Button>
            <Button
              variant="destructive"
              onClick={() => openPinDialogForDelete('supplier_material_relation')}
              disabled={isConfirmingPin}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar Todos
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6 border-destructive card-alert-border">
        <CardHeader>
          <CardTitle className="text-destructive">Reinicio Completo de Datos</CardTitle>
          <CardDescription>
            <strong>¡ADVERTENCIA!</strong> Esto eliminará TODOS tus proveedores, materiales y relaciones,
            y reiniciará los correlativos de los códigos a P001 y MT001.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResetDataButton />
        </CardContent>
      </Card>

      <MadeWithDyad />

      <PinInputDialog
        isOpen={isPinDialogOpen}
        onClose={() => setIsPinDialogOpen(false)}
        onConfirm={handlePinConfirm}
        title={pinActionType === 'backup' ? 'Confirmar Descarga de Respaldo' : 'Confirmar Eliminación de Datos'}
        description={
          pinActionType === 'backup'
            ? `Introduce el PIN de 6 dígitos para descargar el respaldo de todos los ${pinDataType === 'supplier' ? 'proveedores' : (pinDataType === 'material' ? 'materiales' : 'relaciones proveedor-material')} de tu cuenta.`
            : `Esta acción es irreversible. Introduce el PIN de 6 dígitos para eliminar permanentemente todos los ${pinDataType === 'supplier' ? 'proveedores' : (pinDataType === 'material' ? 'materiales' : 'relaciones proveedor-material')} de tu cuenta.`
        }
        confirmText={pinActionType === 'backup' ? 'Descargar' : 'Eliminar'}
        isConfirming={isConfirmingPin}
      />
    </div>
  );
};

export default BulkUpload;