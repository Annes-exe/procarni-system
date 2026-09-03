// src/utils/statusTranslations.ts
// Diccionario y utilidades centralizadas para traducción y estilos de estados en todo el sistema

export const ORDER_STATUS_TRANSLATIONS: Record<string, string> = {
  Draft: 'Borrador',
  Pending: 'Pendiente',
  Approved: 'Aprobada',
  Credit: 'Crédito',
  ToPay: 'Por pagar',
  Paid: 'Pagada',
  Received: 'Aprobada',
  Rejected: 'Rechazada',
  Archived: 'Archivada',
};

export const SERVICE_ORDER_STATUS_TRANSLATIONS: Record<string, string> = {
  Draft: 'Borrador',
  Pending: 'Pendiente',
  Approved: 'Aprobada',
  Paid: 'Pagada',
  Received: 'Aprobada',
  Rejected: 'Rechazada',
  Archived: 'Archivada',
};

export const QUOTE_STATUS_TRANSLATIONS: Record<string, string> = {
  Draft: 'Borrador',
  Pending: 'Pendiente',
  Sent: 'Enviada',
  Approved: 'Aprobada',
  Rejected: 'Rechazada',
  Archived: 'Archivada',
};

export const RECEPTION_STATUS_TRANSLATIONS: Record<string, string> = {
  Ninguno: 'Sin recepción',
  'En tránsito': 'En tránsito',
  Parcial: 'Recepción parcial',
  Recibido: 'Recibido completo',
};

export const ENTITY_STATUS_TRANSLATIONS: Record<string, string> = {
  Active: 'Activo',
  Inactive: 'Inactivo',
  active: 'Activo',
  inactive: 'Inactivo',
};

const ALL_STATUS_MAP: Record<string, string> = {
  ...ORDER_STATUS_TRANSLATIONS,
  ...SERVICE_ORDER_STATUS_TRANSLATIONS,
  ...QUOTE_STATUS_TRANSLATIONS,
  ...ENTITY_STATUS_TRANSLATIONS,
  // Normalizaciones en minúsculas y variaciones
  draft: 'Borrador',
  pending: 'Pendiente',
  approved: 'Aprobada',
  credit: 'Crédito',
  'a credito': 'A Crédito',
  topay: 'Por pagar',
  'por pagar': 'Por pagar',
  paid: 'Pagada',
  received: 'Aprobada',
  rejected: 'Rechazada',
  archived: 'Archivada',
  active: 'Activo',
  inactive: 'Inactivo',
};

/**
 * Traduce cualquier estado conocido al español legible.
 * Si el estado no se encuentra en el diccionario, devuelve el texto original.
 */
export const translateStatus = (status?: string | null): string => {
  if (!status) return 'N/A';
  const cleanKey = status.trim();
  const normalizedKey = cleanKey.toLowerCase().replace(/[-_ ]/g, '');

  if (ALL_STATUS_MAP[cleanKey]) return ALL_STATUS_MAP[cleanKey];
  if (ALL_STATUS_MAP[normalizedKey]) return ALL_STATUS_MAP[normalizedKey];

  return status;
};

/**
 * Retorna las clases de Tailwind correspondientes a cada estado según la paleta corporativa de Procarni.
 */
export const getStatusColorClass = (status?: string | null): string => {
  const s = status?.toLowerCase().trim() || '';

  if (s === 'approved' || s === 'aprobado' || s === 'aprobada' || s === 'received' || s === 'recibido' || s === 'recibida' || s === 'active' || s === 'activo') {
    return 'bg-emerald-50 text-procarni-secondary border-emerald-200';
  }
  if (s === 'credit' || s === 'crédito' || s === 'a crédito') {
    return 'bg-blue-50 text-procarni-blue border-blue-200';
  }
  if (s === 'paid' || s === 'pagado' || s === 'pagada') {
    return 'bg-teal-50 text-teal-700 border-teal-200';
  }
  if (s === 'topay' || s === 'por pagar') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  if (s === 'pending' || s === 'pendiente' || s === 'draft' || s === 'borrador') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (s === 'rejected' || s === 'rechazado' || s === 'rechazada') {
    return 'bg-red-50 text-procarni-primary border-red-200';
  }
  if (s === 'archived' || s === 'archivado' || s === 'archivada' || s === 'inactive' || s === 'inactivo') {
    return 'bg-slate-100 text-slate-600 border-slate-300';
  }

  return 'bg-slate-50 text-slate-700 border-slate-200';
};

/**
 * Verifica si un estado coincide con una búsqueda en español o en inglés.
 */
export const matchesStatusSearch = (status: string | undefined | null, query: string): boolean => {
  if (!status || !query) return false;
  const q = query.toLowerCase().trim();
  const raw = status.toLowerCase();
  const translated = translateStatus(status).toLowerCase();

  return raw.includes(q) || translated.includes(q);
};
