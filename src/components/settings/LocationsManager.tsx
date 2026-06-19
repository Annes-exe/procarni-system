import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLocations, addLocation, deleteLocation, updateLocation } from '@/integrations/supabase/data';
import { Location } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { showError, showSuccess } from '@/utils/toast';
import { Trash2, Edit2, Check, X, Plus } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LocationsManager = () => {
  const queryClient = useQueryClient();
  const [newState, setNewState] = useState('');
  const [newCity, setNewCity] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState('');
  const [editCity, setEditCity] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
  });

  const addMutation = useMutation({
    mutationFn: () => addLocation(newState.trim(), newCity.trim()),
    onSuccess: () => {
      showSuccess('Ubicación agregada correctamente');
      setNewState('');
      setNewCity('');
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: any) => {
      showError(error.message || 'Error al agregar ubicación');
    }
  });

  const updateMutation = useMutation({
    mutationFn: () => updateLocation(editingId!, editState.trim(), editCity.trim()),
    onSuccess: () => {
      showSuccess('Ubicación actualizada correctamente');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: any) => {
      showError(error.message || 'Error al actualizar ubicación');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => {
      showSuccess('Ubicación eliminada correctamente');
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
    onError: (error: any) => {
      showError(error.message || 'Error al eliminar ubicación');
    }
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newState.trim() || !newCity.trim()) {
      showError('Estado y Ciudad son requeridos');
      return;
    }
    addMutation.mutate();
  };

  const handleEdit = (loc: Location) => {
    setEditingId(loc.id);
    setEditState(loc.state);
    setEditCity(loc.city);
  };

  const handleSaveEdit = () => {
    if (!editState.trim() || !editCity.trim()) {
      showError('Estado y Ciudad son requeridos');
      return;
    }
    updateMutation.mutate();
  };

  const filteredLocations = locations.filter(loc => 
    loc.state.toLowerCase().includes(searchTerm.toLowerCase()) || 
    loc.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4 items-end bg-gray-50/50 p-4 rounded-xl border border-gray-100">
        <div className="flex-1 w-full">
          <Label htmlFor="newState" className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Estado</Label>
          <Input 
            id="newState" 
            value={newState} 
            onChange={(e) => setNewState(e.target.value)} 
            placeholder="Ej. Miranda"
            className="bg-white"
          />
        </div>
        <div className="flex-1 w-full">
          <Label htmlFor="newCity" className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Ciudad / Municipio</Label>
          <Input 
            id="newCity" 
            value={newCity} 
            onChange={(e) => setNewCity(e.target.value)} 
            placeholder="Ej. Chacao"
            className="bg-white"
          />
        </div>
        <Button 
          type="submit" 
          disabled={addMutation.isPending}
          className="w-full md:w-auto bg-procarni-primary hover:bg-procarni-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" /> Agregar
        </Button>
      </form>

      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-procarni-dark">Ubicaciones Registradas ({filteredLocations.length})</h4>
        <Input 
          placeholder="Buscar..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64 h-8 text-xs bg-white"
        />
      </div>

      <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
        <div className="max-h-96 overflow-y-auto">
          <Table>
            <TableHeader className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-1/2">Estado</TableHead>
                <TableHead className="w-1/2">Ciudad / Municipio</TableHead>
                <TableHead className="text-right w-24">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-gray-500">Cargando ubicaciones...</TableCell>
                </TableRow>
              ) : filteredLocations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-gray-500">No se encontraron ubicaciones.</TableCell>
                </TableRow>
              ) : (
                filteredLocations.map(loc => (
                  <TableRow key={loc.id} className="group hover:bg-gray-50/50">
                    <TableCell>
                      {editingId === loc.id ? (
                        <Input value={editState} onChange={(e) => setEditState(e.target.value)} className="h-8" />
                      ) : (
                        <span className="font-medium text-procarni-dark">{loc.state}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === loc.id ? (
                        <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} className="h-8" />
                      ) : (
                        <span className="text-gray-600">{loc.city}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingId === loc.id ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending} className="h-8 w-8 p-0 text-procarni-secondary hover:text-green-700 hover:bg-green-50">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(loc)} className="h-8 w-8 p-0 text-procarni-blue hover:text-blue-700 hover:bg-blue-50">
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            if(window.confirm('¿Seguro que deseas eliminar esta ubicación?')) deleteMutation.mutate(loc.id);
                          }} disabled={deleteMutation.isPending} className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default LocationsManager;
