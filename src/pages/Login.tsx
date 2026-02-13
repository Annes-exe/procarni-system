import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { MadeWithDyad } from '@/components/made-with-dyad';

const currentYear = new Date().getFullYear();

const Login = () => {
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

          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#880a0a', // Procarni Primary Red
                    brandAccent: '#660808',
                    inputBackground: '#F9FAFB', // gray-50
                    inputBorder: '#E5E7EB', // gray-200
                    inputText: '#111827', // gray-900
                    inputPlaceholder: '#9CA3AF', // gray-400
                  },
                  radii: {
                    borderRadiusButton: '6px',
                    inputBorderRadius: '6px',
                  },
                  space: {
                    inputPadding: '10px 12px',
                    buttonPadding: '10px 16px',
                  }
                },
              },
              className: {
                container: 'space-y-4',
                button: 'w-full bg-procarni-primary hover:bg-red-900 text-white font-medium rounded-md py-2.5 shadow-sm transition-all active:scale-[0.98] text-sm tracking-wide',
                label: 'block text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-1.5 ml-1',
                input: 'block w-full rounded-md border-gray-200 bg-gray-50 text-gray-900 sm:text-sm focus:border-red-500 focus:ring-red-500 transition-colors',
                loader: 'text-procarni-primary animate-spin',
                anchor: 'text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors underline-offset-4 hover:underline',
                divider: 'bg-gray-200 my-4',
                message: 'text-xs text-red-600 bg-red-50 p-3 rounded-md border border-red-100 mt-4',
              },
            }}
            theme="light"
            redirectTo={window.location.origin}
            localization={{
              variables: {
                sign_in: {
                  button_label: 'Entrar al Sistema',
                  email_label: 'Correo Corporativo',
                  password_label: 'Contraseña',
                  email_input_placeholder: 'ejemplo@procarni.com',
                  password_input_placeholder: '••••••••',
                  loading_button_label: 'Verificando...',
                },
              },
            }}
          />
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Login;