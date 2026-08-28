import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requisitionService } from '@/services/requisitionService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  FileSpreadsheet, 
  Plus, 
  Printer, 
  Search, 
  FileText, 
  HelpCircle,
  Calendar,
  User,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DynamicBreadcrumbs } from '@/components/DynamicBreadcrumbs';
import { showSuccess, showError } from '@/utils/toast';

const RequisitionsManagement = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'purchase' | 'service' | 'warehouse'>('all');
  
  // States for the Row Customization Dialog
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'purchase' | 'service' | 'warehouse'>('purchase');
  const [rowCount, setRowCount] = useState<number>(15);
  const [formatCount, setFormatCount] = useState<number>(1);
  const [activeRequisitionId, setActiveRequisitionId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'print_existing'>('create');

  // Fetch all requisitions
  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['requisitions'],
    queryFn: requisitionService.getAll
  });

  // Create requisition mutation
  const createMutation = useMutation({
    mutationFn: ({ type, quantity }: { type: 'purchase' | 'service' | 'warehouse'; quantity: number }) => 
      requisitionService.create(type, quantity),
    onSuccess: (newReqs) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      if (newReqs && newReqs.length > 0) {
        const codes = newReqs.map(r => {
          const prefix = r.type === 'purchase' ? 'RC' : r.type === 'service' ? 'RS' : 'VS';
          return `${prefix}-${String(r.sequence_number).padStart(3, '0')}`;
        }).join(', ');
        showSuccess(`Requisiciones creadas con éxito: ${codes}`);
        
        // Open all created requisitions in a single tab
        const idsJoined = newReqs.map(r => r.id).join(',');
        window.open(`/requisitions/print/${idsJoined}?rows=${rowCount}`, '_blank');
      }
      setIsConfigOpen(false);
    },
    onError: () => {
      showError('Error al crear la requisición.');
    }
  });

  const handleOpenCreateConfig = (type: 'purchase' | 'service' | 'warehouse') => {
    setDialogMode('create');
    setSelectedType(type);
    setRowCount(type === 'service' ? 12 : 15); // Default count: 15 for purchase/warehouse, 12 for service
    setFormatCount(1);
    setIsConfigOpen(true);
  };

  const handleOpenPrintConfig = (id: string, type: 'purchase' | 'service' | 'warehouse') => {
    setDialogMode('print_existing');
    setActiveRequisitionId(id);
    setSelectedType(type);
    setRowCount(type === 'service' ? 12 : 15);
    setIsConfigOpen(true);
  };

  const handleConfirmAction = () => {
    if (dialogMode === 'create') {
      createMutation.mutate({ type: selectedType, quantity: formatCount });
    } else if (dialogMode === 'print_existing' && activeRequisitionId) {
      window.open(`/requisitions/print/${activeRequisitionId}?rows=${rowCount}`, '_blank');
      setIsConfigOpen(false);
    }
  };

  // Filtered list
  const filteredRequisitions = requisitions.filter((req) => {
    const sequenceStr = String(req.sequence_number);
    const prefix = req.type === 'purchase' ? 'RC' : req.type === 'service' ? 'RS' : 'VS';
    const formattedCode = `${prefix}-${sequenceStr.padStart(3, '0')}`.toLowerCase();
    const search = searchTerm.toLowerCase();

    const matchesSearch = 
      formattedCode.includes(search) || 
      sequenceStr.includes(search) ||
      (req.profiles?.first_name?.toLowerCase() || '').includes(search) ||
      (req.profiles?.last_name?.toLowerCase() || '').includes(search);

    const matchesType = typeFilter === 'all' || req.type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Header section with page info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-procarni-blue">
            Formatos y Requisiciones
          </h1>
          <p className="text-gray-500 font-medium italic text-sm mt-1">
            Gestión y descarga de requisiciones en blanco con correlativos secuenciales.
          </p>
        </div>
      </div>

      {/* Primary Generation Buttons - Bento Style cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between h-52">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-procarni-primary/10 flex items-center justify-center text-procarni-primary group-hover:scale-110 transition-transform duration-300">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-procarni-primary bg-procarni-primary/5 px-3 py-1 rounded-full">
                RC - Compras
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Requisición de Compra</h2>
              <p className="text-gray-400 text-xs mt-1">Formato imprimible estándar para compras de materias primas o materiales.</p>
            </div>
            <Button 
              onClick={() => handleOpenCreateConfig('purchase')}
              className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar RC</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between h-52">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-procarni-blue/10 flex items-center justify-center text-procarni-blue group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-procarni-blue bg-procarni-blue/5 px-3 py-1 rounded-full">
                RS - Servicios
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Requisición de Servicio</h2>
              <p className="text-gray-400 text-xs mt-1">Formato imprimible estándar para la solicitud de reparaciones y servicios.</p>
            </div>
            <Button 
              onClick={() => handleOpenCreateConfig('service')}
              className="bg-procarni-blue hover:bg-procarni-blue/90 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar RS</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between h-52">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-300">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 bg-emerald-500/5 px-3 py-1 rounded-full">
                VS - Salida
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Salida de Insumos/Suministros</h2>
              <p className="text-gray-400 text-xs mt-1">Vale de Salida de Almacén para retiro de materiales y suministros de stock.</p>
            </div>
            <Button 
              onClick={() => handleOpenCreateConfig('warehouse')}
              className="bg-emerald-600 hover:bg-emerald-750 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar VS</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* History and Filtering Table */}
      <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-procarni-dark self-start sm:self-center">
            Historial de Requisiciones Generadas
          </h3>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por correlativo o creador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-10 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
              />
            </div>

            {/* Type filter */}
            <Select 
              value={typeFilter} 
              onValueChange={(val) => setTypeFilter(val as any)}
            >
              <SelectTrigger className="w-full sm:w-44 h-10 border-gray-200 rounded-xl bg-gray-50/50 text-sm">
                <SelectValue placeholder="Tipo de Formato" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-150">
                <SelectItem value="all">Todos los formatos</SelectItem>
                <SelectItem value="purchase">Requisiciones de Compra (RC)</SelectItem>
                <SelectItem value="service">Requisiciones de Servicio (RS)</SelectItem>
                <SelectItem value="warehouse">Salida de Insumos/Suministros (VS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-24 text-center text-gray-400 font-medium flex items-center justify-center gap-3">
              <span className="w-2 h-2 rounded-full bg-procarni-primary animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-procarni-primary animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-2 h-2 rounded-full bg-procarni-primary animate-bounce [animation-delay:0.4s]"></span>
              <span>Cargando historial de correlativos...</span>
            </div>
          ) : filteredRequisitions.length === 0 ? (
            <div className="py-24 text-center text-gray-400">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">No se encontraron requisiciones</p>
              <p className="text-xs text-gray-400 mt-1">Intenta con otros filtros o genera una nueva requisición.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-gray-50/50">
                <TableRow>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 py-4 pl-6">Correlativo</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 py-4">Tipo</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 py-4">Fecha de Creación</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 py-4">Generado Por</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 py-4 text-right pr-6">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequisitions.map((req) => {
                  const prefix = req.type === 'purchase' ? 'RC' : req.type === 'service' ? 'RS' : 'VS';
                  const code = `${prefix}-${String(req.sequence_number).padStart(3, '0')}`;
                  const createdDate = req.created_at 
                    ? format(new Date(req.created_at), "dd 'de' MMMM, yyyy - hh:mm a", { locale: es }) 
                    : 'N/A';
                  
                  const creatorName = req.profiles 
                    ? `${req.profiles.first_name || ''} ${req.profiles.last_name || ''}`.trim() || 'Desconocido'
                    : 'Desconocido';

                  return (
                    <TableRow key={req.id} className="hover:bg-blue-50/30 group transition-all duration-300">
                      <TableCell className="font-mono font-bold text-sm text-procarni-dark py-4 pl-6">
                        {code}
                      </TableCell>
                      <TableCell className="py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          req.type === 'purchase' 
                            ? 'bg-procarni-primary/10 text-procarni-primary' 
                            : req.type === 'service'
                              ? 'bg-procarni-blue/10 text-procarni-blue'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {req.type === 'purchase' ? 'Compra' : req.type === 'service' ? 'Servicio' : 'Salida Insumos'}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500 font-medium text-xs py-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          {createdDate}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500 font-medium text-xs py-4">
                        <span className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {creatorName}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 text-right pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenPrintConfig(req.id, req.type)}
                          className="text-gray-400 hover:text-procarni-primary hover:bg-procarni-primary/5 rounded-xl h-9 px-3 gap-1.5 font-semibold transition-colors"
                        >
                          <Printer className="w-4 h-4" />
                          <span className="hidden sm:inline">Imprimir / PDF</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* Row Count configuration dialog */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-md rounded-[1.75rem] border-none bg-white shadow-2xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-procarni-dark">
              {dialogMode === 'create' ? 'Configurar nueva requisición' : 'Re-imprimir requisición'}
            </DialogTitle>
            <DialogDescription className="text-gray-500 text-xs italic">
              Ajusta las opciones del formato en blanco antes de visualizar el archivo imprimible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {(selectedType === 'purchase' || selectedType === 'warehouse') && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-gray-400 block">
                  Filas del Formato (Materiales)
                </label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={rowCount}
                  onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value) || 0))}
                  className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
                />
                <span className="text-[10px] text-gray-400 block font-medium">
                  Especifica la cantidad de renglones vacíos a dibujar en la hoja para escribir a mano.
                </span>
              </div>
            )}
            
            {dialogMode === 'create' && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-widest text-gray-400 block">
                  Cantidad de Formatos a Generar
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={formatCount}
                  onChange={(e) => setFormatCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
                />
                <span className="text-[10px] text-gray-400 block font-medium">
                  Permite generar múltiples folios secuenciales consecutivos en un solo PDF.
                </span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsConfigOpen(false)}
              className="rounded-xl border-gray-200 hover:bg-gray-50 text-sm h-11"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={createMutation.isPending}
              className={`rounded-xl text-white shadow-lg text-sm h-11 ${
                selectedType === 'purchase' 
                  ? 'bg-procarni-primary hover:bg-procarni-primary/90' 
                  : selectedType === 'service'
                    ? 'bg-procarni-blue hover:bg-procarni-blue/90'
                    : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {createMutation.isPending ? 'Procesando...' : 'Generar y Continuar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequisitionsManagement;
