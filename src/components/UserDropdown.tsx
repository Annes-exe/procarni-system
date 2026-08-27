import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/components/SessionContextProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { showError, showSuccess } from '@/utils/toast';
import { User, Bell, BellOff, Edit } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface UserDropdownProps {
  showText?: boolean;
}

const UserDropdown = ({ showText = false }: UserDropdownProps) => {
  const { session, supabase } = useSession();
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');
  const [username, setUsername] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  const fetchProfile = async () => {
    if (session?.user?.id) {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, first_name, last_name')
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        setUsername(data.username);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
      }
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [session?.user?.id, supabase]);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error al cerrar sesión:', error.message);
      showError('Error al cerrar sesión.');
    } else {
      showSuccess('Sesión cerrada exitosamente.');
      navigate('/login');
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.id) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        .eq('id', session.user.id);

      if (error) throw error;

      showSuccess('Datos de perfil actualizados exitosamente.');
      setIsEditDialogOpen(false);
      await fetchProfile();
    } catch (error: any) {
      console.error('Error al guardar cambios de perfil:', error);
      showError(error.message || 'Error al actualizar el perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!session?.user) {
    return null; // No mostrar si no hay usuario logueado
  }

  const email = session.user.email || 'usuario@procarni.com';

  // Use full name as displayName, fallback to username, fallback to email prefix
  let displayName = '';
  if (firstName || lastName) {
    displayName = `${firstName} ${lastName}`.trim();
  } else if (username) {
    displayName = username;
  } else {
    const nameFromEmail = email.split('@')[0];
    displayName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
  }

  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition-all group">
            <div className="w-[38px] h-[38px] rounded-[0.95rem] bg-gradient-to-tr from-procarni-primary to-procarni-blue flex items-center justify-center text-white shadow-xl shadow-procarni-primary/10 ring-2 ring-white group-hover:ring-procarni-primary/20 transition-all text-xs font-black shrink-0 font-mono">
              {initials}
            </div>
            <div className={`text-left ${showText ? "block" : "hidden sm:block"}`}>
              <p className="text-[13.5px] font-black text-procarni-blue group-hover:text-procarni-primary transition-colors tracking-tight leading-tight">{displayName}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight">{email}</p>
            </div>
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onSelect={(e) => { e.preventDefault(); setIsEditDialogOpen(true); }}
            className="cursor-pointer flex items-center gap-2"
          >
            <Edit className="h-4 w-4" />
            Editar Perfil
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {isSupported && (
            <>
              <DropdownMenuItem 
                onClick={isSubscribed ? unsubscribe : subscribe}
                className="cursor-pointer flex items-center gap-2"
              >
                {isSubscribed ? (
                  <>
                    <BellOff className="h-4 w-4 text-red-500" />
                    Desactivar Notificaciones
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 text-green-500" />
                    Activar Notificaciones
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            Cerrar Sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-white rounded-3xl p-6 border-none shadow-2xl ring-1 ring-black/5">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold text-procarni-dark">Editar Perfil</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveChanges} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="firstName" className="text-xs font-bold uppercase tracking-widest text-gray-400">Nombre</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Ingresa tu nombre"
                className="h-10 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName" className="text-xs font-bold uppercase tracking-widest text-gray-400">Apellido</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Ingresa tu apellido"
                className="h-10 border-gray-200 focus:ring-procarni-primary/20 rounded-xl"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-procarni-primary hover:bg-procarni-primary/90 text-white rounded-xl">
                {isSaving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserDropdown;