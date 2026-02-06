// src/utils/validators.ts

/**
 * Normaliza y valida un RIF venezolano.
 * Elimina guiones y espacios, fuerza mayúsculas.
 * Formato esperado: J123456789, V123456789, G123456789, E123456789, P123456789
 * @param rif El RIF a normalizar y validar.
 * @returns El RIF normalizado o null si es inválido.
 */
export const validateRif = (rif: string): string | null => {
  if (!rif) return null;

  // Eliminar guiones, espacios y convertir a mayúsculas
  const normalizedRif = rif.replace(/[- ]/g, '').toUpperCase();

  // Expresión regular para validar el formato del RIF
  // Inicia con J, V, G, E, P seguido de 8 o 9 dígitos
  const rifRegex = /^[JVGEP]\d{8,9}$/;

  if (rifRegex.test(normalizedRif)) {
    return normalizedRif;
  } else {
    return null; // RIF inválido
  }
};