import React from 'react';
import { toast } from "sonner";
import { Clock, ShoppingCart } from "lucide-react";

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
      <div className="flex items-center gap-3.5 p-4 bg-white/95 backdrop-blur-xl border border-procarni-primary/30 shadow-2xl rounded-3xl ring-2 ring-procarni-primary/10 text-procarni-dark max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-procarni-primary to-procarni-secondary flex items-center justify-center text-white shrink-0 shadow-md">
          <Clock className="w-5 h-5 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-procarni-primary">
            Recordatorio de Compras para Hoy
          </p>
          <p className="text-xs font-extrabold text-procarni-dark truncate">
            {dueCount === 1 ? firstReminderTitle : `Tienes ${dueCount} compras o tareas programadas`}
          </p>
          {dueCount > 1 && (
            <p className="text-[11px] text-gray-500 truncate italic">
              Ej: {firstReminderTitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(t);
            onOpen();
          }}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-procarni-primary to-procarni-secondary text-white text-xs font-extrabold shadow-md hover:scale-105 active:scale-95 shrink-0 transition-all cursor-pointer"
        >
          Ver
        </button>
      </div>
    ),
    {
      position: 'top-center',
      duration: 9000,
      id: 'due-reminders-startup-toast'
    }
  );
};
