/**
 * Elimina caracteres invisibles, espacios de ancho cero, caracteres de control no imprimibles
 * y normaliza espacios en blanco especiales provenientes de copiado de PDF, Excel o web.
 * @param str La cadena a limpiar
 * @returns La cadena sanitizada sin caracteres invisibles
 */
export const cleanInvisibleChars = (str: string | null | undefined): string => {
  if (!str) return "";
  return str
    // Elimina caracteres de ancho cero, marcas de dirección (BOM, ZWSP, ZWNJ, ZWJ, LTR, RTL, etc.)
    // \u200B (ZWSP), \u200C (ZWNJ), \u200D (ZWJ), \uFEFF (BOM/ZWNBSP), \u200E-\u200F (LTR/RTL), \u202A-\u202E (Bidi), \u2060 (WJ), \u180E, \u00AD (Soft Hyphen)
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2060\u180E\u00AD\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // Reemplaza espacios especiales (no rompibles, de diferentes anchos) por espacios regulares
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .trim();
};

/**
 * Normaliza una cadena de texto para comparaciones insensibles a acentos, mayúsculas y caracteres invisibles.
 * @param str La cadena a normalizar
 * @returns La cadena en minúsculas, sin caracteres invisibles y sin acentos
 */
export const normalizeString = (str: string | null | undefined): string => {
  if (!str) return "";
  return cleanInvisibleChars(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};
