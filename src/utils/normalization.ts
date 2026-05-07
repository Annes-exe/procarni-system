/**
 * Normaliza una cadena de texto para comparaciones insensibles a acentos y mayúsculas.
 * @param str La cadena a normalizar
 * @returns La cadena en minúsculas y sin acentos
 */
export const normalizeString = (str: string | null | undefined): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};
