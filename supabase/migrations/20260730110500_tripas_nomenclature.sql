-- Migration: Add TRIPAS nomenclature helper function and document policy
-- Policy: TRIPAS PLASTICA 90X300 CM ROJO (METROS X CAJA: 500 MT) CORRUGADA (todos los campos son opcionales excepto TIPO)

CREATE OR REPLACE FUNCTION validate_tripas_nomenclature(name text)
RETURNS boolean AS $$
BEGIN
  -- If name does not start with TRIPAS, it doesn't need to comply with this specific naming rule
  IF NOT (name ILIKE 'TRIPAS%') THEN
    RETURN true;
  END IF;

  -- Verify match against format using regex (with optional fields)
  RETURN name ~* '^TRIPAS\s+(PLASTICA|CELULOSA|FIBROSA|COLAGENO|CERO\s+MERMA|TIMBRADA)(\s+[^\s]+\s+CM)?(\s+[^()]+)?(\s+\(METROS\s+X\s+CAJA:\s*[^\s]+\s+MT\))?(\s+(CORRUGADA|LISA))?\s*$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION validate_tripas_nomenclature(text) IS 'Valida que la nomenclatura para tripas de empaque cumpla con el formato oficial (campos opcionales, con parentesis solo en metros por caja).';
