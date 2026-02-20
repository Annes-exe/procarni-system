import React from 'react';
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
import { showError, showSuccess } from '@/utils/toast';

const UserDropdown = () => {
  const { session, supabase } = useSession();
  const navigate = useNavigate();

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

  if (!session?.user) {
    return null; // No mostrar si no hay usuario logueado
  }

  const email = session.user.email || 'usuario@procarni.com';
  // Use email prefix as name or "Usuario"
  const name = email.split('@')[0];
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);
  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity group">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground group-hover:text-procarni-primary transition-colors">{displayName}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-procarni-primary to-procarni-secondary flex items-center justify-center text-white font-bold shadow-md ring-2 ring-transparent group-hover:ring-procarni-primary/20 transition-all text-xs">
            {initials}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          Cerrar Sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserDropdown;