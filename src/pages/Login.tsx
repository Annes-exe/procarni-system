import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

import { AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

const currentYear = new Date().getFullYear();

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const cleanIdentifier = identifier.trim();
      let loginEmail = cleanIdentifier;

      // Si el identificador no tiene '@', asumimos que es un username
      if (!cleanIdentifier.includes('@')) {
        // Primero intentamos con el username tal como fue ingresado
        const { data: emailData, error: rpcError } = await supabase
          .rpc('get_email_by_username', { p_username: cleanIdentifier });

        if (rpcError) {
          console.error('RPC Error:', rpcError);
          throw new Error('Error al verificar el usuario en el servidor.');
        }

        if (!emailData) {
          // Intentar con el username en minúsculas por si el teclado móvil capitalizó la primera letra
          const { data: lowerEmailData } = await supabase
            .rpc('get_email_by_username', { p_username: cleanIdentifier.toLowerCase() });

          if (!lowerEmailData) {
            throw new Error('Usuario no encontrado. Verifica si está bien escrito o ingresa con tu correo corporativo.');
          }
          loginEmail = lowerEmailData;
        } else {
          loginEmail = emailData;
        }
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: password,
      });

      if (signInError) {
        if (signInError.message === 'Invalid login credentials') {
          throw new Error('Credenciales inválidas. Verifica tu contraseña y que el usuario o correo sea el correcto.');
        }
        throw signInError;
      }

      // El usuario se logueó correctamente, la redirección suele manejarla el App.tsx o ProtectedRoute
      // pero por si acaso forzamos la ida a inicio
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full font-inter bg-slate-50">
      {/* 1. Left Panel (Branding and Context) - Hidden on small screens */}
      {/* STRICT MONOCHROMATIC: Slate-900 with subtle texture or completely flat. No Red Gradients. */}
      <div className="hidden lg:flex lg:w-1/2 bg-procarni-dark text-white p-12 flex-col justify-center relative overflow-hidden">
        {/* Subtle decorative element ensuring it remains monochrome */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 opacity-50"></div>

        {/* Content */}
        <div className="relative z-10 max-w-lg space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Procarni System
            </h1>
            <div className="h-1 w-12 bg-procarni-primary rounded-full"></div>
            {/* Red accent limited to small details */}
          </div>

          <h2 className="text-xl font-medium text-slate-300">
            Gestión de Suministros y Compras
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-md">
            Plataforma integral diseñada para centralizar, optimizar y agilizar el flujo de abastecimiento.
          </p>
        </div>

        {/* Footer/Copyright for left panel */}
        <div className="absolute bottom-12 left-12 text-slate-600 text-xs">
          &copy; {currentYear} Procarni System
        </div>
      </div>

      {/* 2. Right Panel (Login Form) - Full width on mobile, 50% on large screens */}
      <div className="w-full lg:w-1/2 bg-slate-50 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-100 p-8">
          <div className="flex flex-col items-center justify-center mb-8">
            <img
              src="/Sis-Prov.png"
              alt="Sis-Prov Logo"
              className="h-12 w-auto object-contain mb-6"
            />
            <h1 className="text-2xl font-bold text-center text-slate-900 tracking-tight">
              Bienvenido de nuevo
            </h1>
            <p className="text-sm text-slate-500 mt-2 text-center">
              Ingresa tus credenciales para acceder al sistema
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5 ml-1">
                Usuario o Correo Corporativo
              </label>
              <input
                id="identifier"
                name="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ejemplo@procarni.com o tunombre"
                required
                className="block w-full rounded-md border-gray-200 bg-gray-50 text-gray-900 sm:text-sm focus:border-red-500 focus:ring-red-500 transition-colors"
                style={{ padding: '10px 12px', border: '1px solid #E5E7EB' }}
              />
            </div>

            <div className="pt-2">
              <label htmlFor="password" className="block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5 ml-1">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="block w-full rounded-md border-gray-200 bg-gray-50 text-gray-900 sm:text-sm focus:border-red-500 focus:ring-red-500 transition-colors pr-10"
                  style={{ padding: '10px 12px', border: '1px solid #E5E7EB' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 p-3 rounded-md border border-red-100 mt-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-procarni-primary hover:bg-red-900 text-white font-medium rounded-md py-2.5 shadow-sm transition-all active:scale-[0.98] text-sm tracking-wide flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Verificando...' : 'Entrar al Sistema'}
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
};

export default Login;