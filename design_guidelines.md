# Lineamientos de Diseño: Procarni Premium

Para mantener la consistencia visual en todo el sistema, sigue estos principios estéticos que definen el nuevo look "Premium" y moderno inspirado en el rediseño de Fichas Técnicas.

## 1. Colores de Marca (Tokens)

Usa la paleta oficial de Procarni para crear jerarquías visuales claras:

- **Primario (`procarni-primary`)**: Rojo Italia (#880a0a). Identidad central. Úsalo para iconos de cabecera (sin degradados), alertas críticas e interacciones de borrado.
- **Azul Corporativo (`procarni-blue`)**: Azul Marino equilibrado (#1B294A). Úsalo para títulos de página, tarjetas destacadas (sidebar) y elementos que requieran un contraste premium sin ser tan oscuro como el negro.
- **Oscuro Técnico (`procarni-dark`)**: Azul casi negro (#0f172a). Úsalo para textos de máxima importancia o elementos de UI muy específicos que necesiten profundidad extrema.
- **Secundario (`procarni-secondary`)**: Verde acciones (#0e5708). Para botones de éxito y confirmaciones.
- **Fondo General**: `#F8FAFC` (Slate 50). Un fondo ligeramente grisáceo que hace resaltar las tarjetas blancas.
- **Gradientes**: `from-procarni-primary to-procarni-secondary`. Ideal para iconos destacados y botones de acción principal.

## 2. Estética "Glassmorphism"

Para que las tarjetas se sientan modernas y ligeras sobre el fondo:

- **Clase base**: `bg-white/70 backdrop-blur-xl border-none shadow-2xl shadow-gray-200/50`.
- **Anillo de luz**: Usa `ring-1 ring-white` para dar un efecto de borde iluminado muy sutil que separa la tarjeta del fondo.
- **Bordes**: Prioriza bordes muy redondeados (`rounded-3xl` o `rounded-[2rem]`).

## 3. Tipografía y Jerarquía

- **Títulos (H1/H2)**: `font-extrabold tracking-tight text-gray-900`. El grosor extra da autoridad y un look moderno.
- **Subtítulos**: `text-gray-500 font-medium italic`. Las cursivas suaves funcionan bien para descripciones secundarias debajo de los títulos.
- **Etiquetas (Labels)**: `text-xs font-bold uppercase tracking-widest text-gray-400`. Úsalas en formularios para un look "limpio" y profesional.

## 4. Componentes Premium

### Botones
- Los botones de acción principal deben tener sombras suaves (`shadow-xl`) y escalas ligeras al interactuar (`hover:scale-[1.01] active:scale-[0.99]`).

### Tablas
- **Fondo**: `bg-white/50 backdrop-blur-sm`.
- **Filas**: Espacio generoso (`py-4`). Efecto de hover sutil con colores de marca (`hover:bg-blue-50/30`).
- **Iconos**: Agrupa iconos de acciones en el lado derecho y mantenlos ocultos hasta que se pase el ratón (`opacity-0 group-hover:opacity-100`).

### Zonas de Carga (Upload Zones)
- Evita el `input` clásico. Crea un área (`div`) con bordes punteados (`border-dashed`), con iconos grandes y feedback inmediato (cambio de color y rotación de iconos).

## 5. Micro-interacciones

Añade siempre transiciones suaves a todos los cambios de estado:
- `transition-all duration-300` para cambios de color y escala.
- `animate-in fade-in slide-in-from-bottom-4` para la carga inicial de las páginas.
- Pequeños desplazamientos en iconos (`group-hover:-translate-x-1`) para botones de "Volver".

> [!TIP]
> **Menos es más**: Usa los espacios en blanco (`gap-8`, `p-8`) para que la interfaz respire y no se sienta saturada de información.
