import { toast } from "sonner";

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
