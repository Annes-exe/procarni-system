import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { MadeWithDyad } from '@/components/made-with-dyad';

const currentYear = new Date().getFullYear();

const Login = () => {
  return (
    <div className="min-h-screen flex w-full">
      {/* 1. Left Panel (Branding and Context) - Hidden on small screens */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 text-white p-12 flex-col justify-center relative overflow-hidden">
        {/* Background Gradient/Color (Dark Burgundy to Near Black) */}
        <div className="absolute inset-0 bg-gradient-to-b from-procarni-primary to-gray-900 opacity-90"></div>
        
        {/* Content */}
        <div className="relative z-10 max-w-md space-y-6">
          <h1 className="text-5xl font-extrabold tracking-tight leading-tight">
            Procarni System
          </h1>
          <h2 className="text-2xl font-semibold text-gray-200">
            Gestión de Suministros y Compras
          </h2>
          <p className="text-gray-300 text-lg max-w-sm">
            Plataforma integral diseñada para centralizar, optimizar y agilizar el flujo de abastecimiento y las órdenes de compra de la empresa.
          </p>
        </div>
      </div>

      {/* 2. Right Panel (Login Form) - Full width on mobile, 50% on large screens */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-8 dark:bg-gray-800">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center justify-center mb-6">
            <img 
              src="/Sis-Prov.png" 
              alt="Sis-Prov Logo" 
              className="h-16 w-auto object-contain drop-shadow-md mb-4" 
            />
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white">
              Acceso al Sistema
            </h1>
          </div>
          
          <Auth
            supabaseClient={supabase}
            providers={[]}
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    // Usar Hex color para mayor robustez en Supabase Auth UI
                    brand: '#880a0a', // Procarni Primary Red
                    brandAccent: '#660808', // Rojo ligeramente más oscuro para hover/focus
                  },
                },
              },
            }}
            theme="light"
            redirectTo={window.location.origin}
            localization={{
              variables: {
                sign_in: {
                  button_label: 'Iniciar Sesión',
                  email_label: 'Correo Electrónico',
                  password_label: 'Contraseña',
                  forgot_password_link: '¿Olvidaste tu contraseña?',
                  loading_button_label: 'Iniciando sesión...',
                  social_provider_text: 'Iniciar sesión con {{provider}}',
                  confirmation_text: 'Te hemos enviado un correo para confirmar tu cuenta.',
                  email_input_placeholder: 'Tu correo electrónico',
                  password_input_placeholder: 'Tu contraseña',
                  no_account_text: '¿No tienes una cuenta?',
                  link_text: '¿Ya tienes una cuenta? Inicia sesión',
                },
                sign_up: {
                  button_label: 'Registrarse',
                  email_label: 'Correo Electrónico',
                  password_label: 'Contraseña',
                  confirm_password_label: 'Confirmar Contraseña',
                  loading_button_label: 'Registrando...',
                  social_provider_text: 'Registrarse con {{provider}}',
                  confirmation_text: 'Te hemos enviado un correo para confirmar tu cuenta.',
                  email_input_placeholder: 'Tu correo electrónico',
                  password_input_placeholder: 'Tu contraseña',
                  confirm_password_input_placeholder: 'Confirma tu contraseña',
                  link_text: '¿No tienes una cuenta? Regístrate',
                },
                forgotten_password: {
                  button_label: 'Enviar enlace de restablecimiento',
                  email_label: 'Correo Electrónico',
                  loading_button_label: 'Enviando...',
                  link_text: '¿Olvidaste tu contraseña?',
                  confirmation_text: 'Te hemos enviado un correo con instrucciones para restablecer tu contraseña.',
                  email_input_placeholder: 'Tu correo electrónico',
                },
                update_password: {
                  button_label: 'Actualizar contraseña',
                  password_label: 'Nueva contraseña',
                  confirm_password_label: 'Confirmar nueva contraseña',
                  loading_button_label: 'Actualizando...',
                  password_input_placeholder: 'Tu nueva contraseña',
                  confirm_password_input_placeholder: 'Confirma tu nueva contraseña',
                },
              },
            }}
          />
          
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 pt-4">
            &copy; {currentYear} Procarni System. Todos los derechos reservados.
          </p>
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Login;