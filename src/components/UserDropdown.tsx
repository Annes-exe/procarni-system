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
import { showError, showSuccess } from '@/utils/toast';
import { User, Bell, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const UserDropdown = () => {
  const { session, supabase } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState<string | null>(null);
  const { isSupported, isSubscribed, subscribe, unsubscribe } = usePushNotifications();

  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user?.id) {
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single();

        if (!error && data) {
          setUsername(data.username);
        }
      }
    };

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

  if (!session?.user) {
    return null; // No mostrar si no hay usuario logueado
  }

  const email = session.user.email || 'usuario@procarni.com';

  // Use fetched username, fallback to email prefix if not set
  let displayName = username;
  if (!displayName) {
    const nameFromEmail = email.split('@')[0];
    displayName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
  }

  const initials = displayName.substring(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity group">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-foreground group-hover:text-procarni-primary transition-colors">{displayName}</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-procarni-primary to-procarni-secondary flex items-center justify-center text-white shadow-md ring-2 ring-transparent group-hover:ring-procarni-primary/20 transition-all">
            <User className="w-[18px] h-[18px]" />
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
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
  );
};

export default UserDropdown;