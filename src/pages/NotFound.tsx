import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50/50 relative overflow-hidden p-4">
      {/* Decorative blurred background shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-100/30 rounded-full blur-3xl -z-10 animate-pulse-subtle" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-100/30 rounded-full blur-3xl -z-10" />

      {/* Main glassmorphic card */}
      <div className="bg-white/80 backdrop-blur-xl border border-slate-100 shadow-2xl shadow-slate-200/80 rounded-[2rem] p-8 md:p-12 max-w-lg w-full text-center ring-1 ring-white/50 animate-in fade-in slide-in-from-bottom-6 duration-500">
        
        {/* Animated Warning Icon */}
        <div className="mx-auto w-20 h-20 bg-gradient-to-tr from-[#880a0a] to-[#1B294A] rounded-2xl flex items-center justify-center shadow-lg shadow-red-900/10 mb-8 transform hover:rotate-12 transition-transform duration-300">
          <FileQuestion className="w-10 h-10 text-white animate-bounce" />
        </div>

        {/* Text content */}
        <h1 className="text-8xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-[#1B294A] via-[#880a0a] to-[#1B294A] mb-4">
          404
        </h1>
        
        <h2 className="text-2xl font-bold text-[#1B294A] mb-3">
          Página no encontrada
        </h2>
        
        <p className="text-slate-500 font-medium italic mb-8 max-w-sm mx-auto">
          Lo sentimos, la ruta <code className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono not-italic text-[#880a0a]">{location.pathname}</code> no existe o no tienes permisos para acceder a ella.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="w-full sm:w-auto px-6 h-12 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver atrás
          </Button>

          <Button
            onClick={() => navigate("/")}
            className="w-full sm:w-auto px-6 h-12 rounded-xl bg-gradient-to-r from-[#880a0a] to-[#1b294a] text-white hover:from-[#9c1212] hover:to-[#223561] font-semibold shadow-lg shadow-red-900/10 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Página de inicio
          </Button>
        </div>
      </div>

      {/* Footer brand label */}
      <div className="mt-8 text-center animate-in fade-in delay-300">
        <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">
          Procarni System &bull; Gestión de Suministros
        </p>
      </div>
    </div>
  );
};

export default NotFound;

