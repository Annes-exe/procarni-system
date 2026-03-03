import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useLocation } from 'react-router-dom';

interface SessionContextType {
  session: Session | null;
  supabase: typeof supabase;
  isLoadingSession: boolean; // Añadido: estado de carga de la sesión
  role: string | null; // Añadido: rol del usuario
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setRole(data.role);
      } else {
        setRole(null);
      }
    } catch (err) {
      console.error('Error fetching role:', err);
      setRole(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const finishLoading = () => {
      if (mounted) setLoading(false);
    };

    // Fallback: If Supabase auth gets stuck in resolving local storage, force the app to load.
    timeoutId = setTimeout(() => {
      console.warn("Auth initialization timeout - forcing app load.");
      finishLoading();
    }, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);

      if (currentSession?.user) {
        fetchRole(currentSession.user.id).catch(console.error);
      } else {
        setRole(null);
      }

      finishLoading();
    });

    const initSession = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!mounted) return;
        setSession(initialSession);

        if (initialSession?.user) {
          fetchRole(initialSession.user.id).catch(console.error);
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error("Session init error:", error);
      } finally {
        finishLoading();
      }
    };

    initSession();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!session && location.pathname !== '/login') {
        navigate('/login');
      } else if (session && location.pathname === '/login') {
        navigate('/');
      }
    }
  }, [session, loading, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-xl text-gray-600">Cargando sesión...</p>
      </div>
    );
  }

  return (
    <SessionContext.Provider value={{ session, supabase, isLoadingSession: loading, role }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};