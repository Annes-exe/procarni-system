import React from 'react';
import { toast } from "sonner";
import { Clock, ShoppingCart, X } from "lucide-react";

export const showSuccess = (message: string) => {
  toast.success(message, { duration: 3000 });
};

export const showError = (message: string) => {
  toast.error(message, { duration: 4000 });
};

export const showLoading = (message: string) => {
  return toast.loading(message);
};

export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};

export const showSupplierAlert = (message: string) => {
  return toast.error(message, {
    id: "supplier-alert", // Evita duplicados
    duration: Infinity,
    closeButton: false,
    style: {
      background: '#fef2f2',
      border: '1px solid #fee2e2',
      color: '#991b1b',
      fontWeight: '600'
    },
    description: "Aviso importante del proveedor"
  });
};

export const showWarning = (message: string) => {
  toast(message, {
    duration: 4000,
    position: 'top-center',
    style: {
      background: '#fefce8', // Amarillo claro
      border: '1px solid #fef08a', // Borde amarillo
      color: '#854d0e', // Texto marrón/ámbar oscuro
      fontWeight: '600'
    }
  });
};

export const showDueRemindersToast = (
  dueCount: number,
  firstReminderTitle: string,
  onOpen: () => void
) => {
  toast.custom(
    (t) => (
      <div className="flex items-center gap-2.5 sm:gap-3.5 p-3 sm:p-4 bg-white/95 backdrop-blur-xl border border-procarni-primary/30 shadow-2xl rounded-2xl sm:rounded-3xl ring-2 ring-procarni-primary/10 text-procarni-dark w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-md mx-auto animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-procarni-primary to-procarni-secondary flex items-center justify-center text-white shrink-0 shadow-md">
          <Clock className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-procarni-primary truncate">
            Recordatorio de Compras para Hoy
          </p>
          <p className="text-xs font-extrabold text-procarni-dark truncate">
            {dueCount === 1 ? firstReminderTitle : `Tienes ${dueCount} compras o tareas programadas`}
          </p>
          {dueCount > 1 && (
            <p className="text-[10px] sm:text-[11px] text-gray-500 truncate italic">
              Ej: {firstReminderTitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
          type="button"
          onClick={() => {
            toast.dismiss(t);
            onOpen();
          }}
            className="px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white text-[11px] sm:text-xs font-extrabold shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          Ver
          </button>
          <button
            type="button"
            onClick={() => toast.dismiss(t)}
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Cerrar notificación"
          >
            <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </div>
      </div>
    ),
    {
      position: 'top-center',
      duration: 7000,
      id: 'due-reminders-startup-toast'
    }
  );
};
