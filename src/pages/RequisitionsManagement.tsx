import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requisitionService } from '@/services/requisitionService';
import { Requisition } from '@/integrations/supabase/types';
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
  Printer, 
  Search, 
  FileText, 
  Calendar, 
  User, 
  ArrowRight,
  FlaskConical,
  Droplets,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { showSuccess, showError } from '@/utils/toast';

const RequisitionsManagement = () => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'purchase' | 'service' | 'warehouse' | 'logbook' | 'solvent_red' | 'solvent_brown'>('all');
  
  // States for the Row Customization Dialog (Standard Requisitions)
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'purchase' | 'service' | 'warehouse' | 'logbook'>('purchase');
  const [rowCount, setRowCount] = useState<number>(15);
  const [formatCount, setFormatCount] = useState<number>(1);
  const [activeRequisitionId, setActiveRequisitionId] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<'create' | 'print_existing'>('create');

  // States for Solvent Control Formats (Tapa Roja / Tapa Marrón)
  const [isSolventDialogOpen, setIsSolventDialogOpen] = useState(false);
  const [solventType, setSolventType] = useState<'red' | 'brown'>('red');
  const [solventDate, setSolventDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [solventLot, setSolventLot] = useState<string>('');
  const [solventResponsible, setSolventResponsible] = useState<string>('');
  const [solventQuantity, setSolventQuantity] = useState<number>(1);

  // Fetch all requisitions
  const { data: requisitions = [], isLoading } = useQuery({
    queryKey: ['requisitions'],
    queryFn: requisitionService.getAll
  });

  // Create requisition mutation (handles all types, persists to DB and creates sequential codes)
  const createMutation = useMutation({
    mutationFn: ({ 
      type, 
      quantity,
      metadata
    }: { 
      type: 'purchase' | 'service' | 'warehouse' | 'logbook' | 'solvent_red' | 'solvent_brown'; 
      quantity: number;
      metadata?: { lot_date?: string; lot_number?: string; responsible?: string };
    }) => 
      requisitionService.create(type, quantity, metadata),
    onSuccess: (newReqs, variables) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      if (newReqs && newReqs.length > 0) {
        const codes = newReqs.map(r => {
          const prefix = 
            r.type === 'purchase' ? 'RC' : 
            r.type === 'service' ? 'RS' : 
            r.type === 'warehouse' ? 'VS' : 
            r.type === 'logbook' ? 'BC' : 
            r.type === 'solvent_red' ? 'STR' : 'STM';
          return `${prefix}-${String(r.sequence_number).padStart(3, '0')}`;
        }).join(', ');
        showSuccess(`Requisición generada y guardada en historial: ${codes}`);
        
        // Open all created requisitions in a single tab
        const idsJoined = newReqs.map(r => r.id).join(',');
        const queryParams = new URLSearchParams();
        if (variables.type === 'solvent_red' || variables.type === 'solvent_brown') {
          if (variables.metadata?.lot_date) queryParams.set('date', variables.metadata.lot_date);
          if (variables.metadata?.lot_number) queryParams.set('lot', variables.metadata.lot_number);
          if (variables.metadata?.responsible) queryParams.set('responsible', variables.metadata.responsible);
        } else {
          queryParams.set('rows', String(rowCount));
        }

        const queryString = queryParams.toString();
        const url = `/requisitions/print/${idsJoined}${queryString ? `?${queryString}` : ''}`;
        window.open(url, '_blank');
      }
      setIsConfigOpen(false);
      setIsSolventDialogOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Error al crear la requisición.';
      showError(msg);
    }
  });

  const handleOpenCreateConfig = (type: 'purchase' | 'service' | 'warehouse' | 'logbook') => {
    if (type === 'logbook') {
      setRowCount(18);
      createMutation.mutate({ type: 'logbook', quantity: 1 });
      return;
    }
    setDialogMode('create');
    setSelectedType(type);
    setRowCount(type === 'service' ? 12 : 15);
    setFormatCount(1);
    setIsConfigOpen(true);
  };

  const handleOpenPrintConfig = (req: Requisition) => {
    if (req.type === 'logbook') {
      window.open(`/requisitions/print/${req.id}?rows=18`, '_blank');
      return;
    }
    if (req.type === 'solvent_red' || req.type === 'solvent_brown') {
      const params = new URLSearchParams();
      if (req.lot_date) params.set('date', req.lot_date);
      if (req.lot_number) params.set('lot', req.lot_number);
      if (req.responsible) params.set('responsible', req.responsible);
      const queryStr = params.toString();
      window.open(`/requisitions/print/${req.id}${queryStr ? `?${queryStr}` : ''}`, '_blank');
      return;
    }
    setDialogMode('print_existing');
    setActiveRequisitionId(req.id);
    setSelectedType(req.type);
    setRowCount(req.type === 'service' ? 12 : 15);
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

  // Open Dialog for Solvent Formats
  const handleOpenSolventDialog = (type: 'red' | 'brown') => {
    setSolventType(type);
    setSolventDate(format(new Date(), 'yyyy-MM-dd'));
    setSolventLot('');
    setSolventResponsible('');
    setSolventQuantity(1);
    setIsSolventDialogOpen(true);
  };

  // Launch Solvent Format: Persists to database and opens print view
  const handleGenerateSolvent = () => {
    createMutation.mutate({
      type: solventType === 'red' ? 'solvent_red' : 'solvent_brown',
      quantity: solventQuantity,
      metadata: {
        lot_date: solventDate,
        lot_number: solventLot.trim(),
        responsible: solventResponsible.trim()
      }
    });
  };

  // Filtered list
  const filteredRequisitions = requisitions.filter((req) => {
    const sequenceStr = String(req.sequence_number);
    const prefix = 
      req.type === 'purchase' ? 'RC' : 
      req.type === 'service' ? 'RS' : 
      req.type === 'warehouse' ? 'VS' : 
      req.type === 'logbook' ? 'BC' : 
      req.type === 'solvent_red' ? 'STR' : 'STM';
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
            Formatos del Departamento
          </h1>
          <p className="text-gray-500 font-medium italic text-sm mt-1">
            Generación, descarga e impresión de requisiciones, vales de salida y bitácoras de control de insumos.
          </p>
        </div>
      </div>

      {/* Primary Generation Buttons - Bento Style cards (2 rows of 3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Requisición de Compra */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
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

        {/* Requisición de Servicio */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
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

        {/* Salida de Insumos/Suministros */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar VS</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Bitácora Control (Cuartico) */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-600 bg-amber-500/5 px-3 py-1 rounded-full">
                BC - Bitácora
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Bitácora Control (Cuartico)</h2>
              <p className="text-gray-400 text-xs mt-1">Bitácora horizontal para el control de salida de insumos del Cuartico.</p>
            </div>
            <Button 
              onClick={() => handleOpenCreateConfig('logbook')}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar BC</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Solvente Tapa Roja (9 und) */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-[#880a0a] group-hover:scale-110 transition-transform duration-300">
                <FlaskConical className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#880a0a] bg-rose-500/5 px-3 py-1 rounded-full">
                STR • 9 Und.
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Solvente Tapa Roja</h2>
              <p className="text-gray-400 text-xs mt-1">Formato de control y entrega por lote (9 unidades). Registro de fecha de recepción.</p>
            </div>
            <Button 
              onClick={() => handleOpenSolventDialog('red')}
              className="bg-[#880a0a] hover:bg-[#880a0a]/90 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar STR</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Solvente Tapa Marrón (6 und) */}
        <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden group hover:scale-[1.01] transition-all duration-300">
          <CardContent className="p-8 flex flex-col justify-between min-h-[15rem] h-auto gap-4">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 rounded-2xl bg-amber-900/10 flex items-center justify-center text-amber-800 group-hover:scale-110 transition-transform duration-300">
                <Droplets className="w-6 h-6" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-800 bg-amber-900/5 px-3 py-1 rounded-full">
                STM • 6 Und.
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-procarni-dark">Solvente Tapa Marrón</h2>
              <p className="text-gray-400 text-xs mt-1">Formato de control y entrega por lote (6 unidades). Registro de fecha de recepción.</p>
            </div>
            <Button 
              onClick={() => handleOpenSolventDialog('brown')}
              className="bg-amber-800 hover:bg-amber-900 text-white rounded-xl shadow-lg mt-4 self-start flex items-center gap-2 group-hover:translate-x-1 transition-all duration-300"
            >
              <span>Generar STM</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* History and Filtering Table */}
      <Card className="bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50 ring-1 ring-white rounded-[2rem] overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-procarni-dark self-start sm:self-center">
            Historial de Formatos Generados
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
              onValueChange={(val) => setTypeFilter(val as 'all' | 'purchase' | 'service' | 'warehouse' | 'logbook' | 'solvent_red' | 'solvent_brown')}
            >
              <SelectTrigger className="w-full sm:w-56 h-10 border-gray-200 rounded-xl bg-gray-50/50 text-sm">
                <SelectValue placeholder="Tipo de Formato" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-gray-150">
                <SelectItem value="all">Todos los formatos</SelectItem>
                <SelectItem value="purchase">Requisiciones de Compra (RC)</SelectItem>
                <SelectItem value="service">Requisiciones de Servicio (RS)</SelectItem>
                <SelectItem value="warehouse">Salida de Insumos (VS)</SelectItem>
                <SelectItem value="logbook">Bitácora Cuartico (BC)</SelectItem>
                <SelectItem value="solvent_red">Solvente Tapa Roja (STR)</SelectItem>
                <SelectItem value="solvent_brown">Solvente Tapa Marrón (STM)</SelectItem>
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
              <p className="font-semibold text-gray-600">No se encontraron formatos generados</p>
              <p className="text-xs text-gray-400 mt-1">Intenta con otros filtros o genera un nuevo formato.</p>
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
                  const prefix = 
                    req.type === 'purchase' ? 'RC' : 
                    req.type === 'service' ? 'RS' : 
                    req.type === 'warehouse' ? 'VS' : 
                    req.type === 'logbook' ? 'BC' : 
                    req.type === 'solvent_red' ? 'STR' : 'STM';
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
                              : req.type === 'warehouse'
                                ? 'bg-emerald-100 text-emerald-800'
                                : req.type === 'logbook'
                                  ? 'bg-amber-100 text-amber-800'
                                  : req.type === 'solvent_red'
                                    ? 'bg-rose-100 text-[#880a0a]'
                                    : 'bg-amber-900/10 text-amber-900'
                        }`}>
                          {req.type === 'purchase' ? 'Compra' : 
                           req.type === 'service' ? 'Servicio' : 
                           req.type === 'warehouse' ? 'Salida Insumos' : 
                           req.type === 'logbook' ? 'Bitácora Cuartico' : 
                           req.type === 'solvent_red' ? 'Solvente Tapa Roja' : 'Solvente Tapa Marrón'}
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
                          onClick={() => handleOpenPrintConfig(req)}
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

      {/* Row Count configuration dialog (Standard Requisitions) */}
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
            {(selectedType === 'purchase' || selectedType === 'warehouse' || selectedType === 'logbook') && (
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
                  {selectedType === 'logbook' 
                    ? "Especifica la cantidad de filas a dibujar en la bitácora (18 por defecto)."
                    : "Especifica la cantidad de renglones vacíos a dibujar en la hoja para escribir a mano."}
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
                    : selectedType === 'warehouse'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {createMutation.isPending ? 'Procesando...' : 'Generar y Continuar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Solvent Control Formats Dialog (Tapa Roja / Tapa Marrón) */}
      <Dialog open={isSolventDialogOpen} onOpenChange={setIsSolventDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-[1.75rem] border-none bg-white shadow-2xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                solventType === 'red' ? 'bg-red-50 text-[#880a0a]' : 'bg-amber-50 text-amber-900'
              }`}>
                {solventType === 'red' ? <FlaskConical className="w-5 h-5" /> : <Droplets className="w-5 h-5" />}
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-procarni-dark">
                  {solventType === 'red' ? 'Generar Solvente Tapa Roja' : 'Generar Solvente Tapa Marrón'}
                </DialogTitle>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                  solventType === 'red' ? 'bg-red-100 text-[#880a0a]' : 'bg-amber-100 text-amber-900'
                }`}>
                  Capacidad: {solventType === 'red' ? '9 Unidades por Lote' : '6 Unidades por Lote'}
                </span>
              </div>
            </div>
            <DialogDescription className="text-gray-500 text-xs italic pt-1">
              Configura los datos del lote recibido. Al generar, se registrará el correlativo en el historial y se abrirá el formato imprimible.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Campo: Fecha de Recepción */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
                Fecha de Recepción del Lote *
              </label>
              <Input
                type="date"
                value={solventDate}
                onChange={(e) => setSolventDate(e.target.value)}
                className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
              />
              <span className="text-[10px] text-gray-400 block font-medium">
                Esta fecha se insertará automáticamente en la columna &quot;RECIBIDO FECHA&quot; de cada una de las {solventType === 'red' ? '9' : '6'} unidades.
              </span>
            </div>

            {/* Campo: N° de Lote (Opcional) */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
                N° de Lote / Código de Control (Opcional)
              </label>
              <Input
                type="text"
                placeholder="Ej. LOT-2026-01 / Factura"
                value={solventLot}
                onChange={(e) => setSolventLot(e.target.value)}
                className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
              />
            </div>

            {/* Campo: Responsable / Encargado (Opcional) */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
                Responsable / Encargado(a) (Opcional)
              </label>
              <Input
                type="text"
                placeholder="Ej. Control de Calidad / Insumos"
                value={solventResponsible}
                onChange={(e) => setSolventResponsible(e.target.value)}
                className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
              />
            </div>

            {/* Campo: Cantidad de hojas a generar */}
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block">
                Cantidad de Hojas / Lotes a Imprimir
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={solventQuantity}
                onChange={(e) => setSolventQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-11 border-gray-200 rounded-xl bg-gray-50/50 focus:ring-procarni-primary/20 text-sm"
              />
              <span className="text-[10px] text-gray-400 block font-medium">
                Cada hoja corresponde a un lote completo ({solventType === 'red' ? '9' : '6'} unidades).
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={createMutation.isPending}
              onClick={() => setIsSolventDialogOpen(false)}
              className="rounded-xl border-gray-200 hover:bg-gray-50 text-sm h-11"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleGenerateSolvent}
              disabled={createMutation.isPending}
              className={`rounded-xl text-white shadow-lg text-sm h-11 flex items-center gap-2 ${
                solventType === 'red' 
                  ? 'bg-[#880a0a] hover:bg-[#880a0a]/90' 
                  : 'bg-amber-800 hover:bg-amber-900'
              }`}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando en historial...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Generar e Imprimir</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequisitionsManagement;
