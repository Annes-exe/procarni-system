# Sistema de Gestión de Compras (Procarni System)

Este es un sistema integral de **Gestión de Aprovisionamiento y Compras** diseñado para optimizar el flujo de trabajo real de la empresa **Procarni**. Desarrollado con una arquitectura moderna *serverless*, permite gestionar el ciclo de vida completo de las compras, desde la solicitud de cotizaciones hasta la generación de órdenes y análisis de precios.

![Estado del Proyecto](https://img.shields.io/badge/Estado-En_Producci%C3%B3n-green)
![Tech Stack](https://img.shields.io/badge/Stack-React_|_TypeScript_|_Supabase-blue)
![Propósito](https://img.shields.io/badge/Prop%C3%B3sito-Profesional_y_Acad%C3%A9mico-orange)

## 🚀 Características Principales

El sistema está dividido en módulos estratégicos para cubrir todas las necesidades operativas de la empresa:

### 📦 Gestión de Compras y Servicios
- **Órdenes de Compra y Servicio**: Creación, edición y seguimiento de órdenes con secuencias automáticas y validación de presupuestos.
- **Generación de Documentos PDF**: Motor backend dedicado (Edge Functions) para generar PDFs profesionales de órdenes y solicitudes al instante.
- **Flujo de Aprobación**: Estados lógicos (Borrador, Enviada, Completada, Cancelada) adaptados al flujo de caja y auditoría.

### 🤝 Proveedores y Materiales
- **Base de Datos de Proveedores**: Gestión centralizada de contactos, condiciones comerciales y evaluaciones.
- **Catálogo de Materiales**: Subida de fichas técnicas y organización por categorías para estandarizar inventarios.
- **Historial de Precios**: Monitoreo de la variación de costos de materiales a lo largo del tiempo para inteligencia de negocios.

### 📊 Análisis y Comparativas
- **Comparador de Cotizaciones**: Herramienta visual para comparar precios entre múltiples proveedores y seleccionar la mejor opción costo-beneficio.
- **Solicitudes de Cotización (RFQ)**: Generación y envío de solicitudes a proveedores vía Email o integración con WhatsApp.

### 🛡️ Seguridad y Auditoría
- **Audit Log**: Registro inmutable de acciones críticas dentro del sistema para trazabilidad y control interno.
- **Roles y Permisos**: Gestión de acceso basada en autenticación segura de Supabase.

## 🛠️ Tecnologías Utilizadas

### Frontend (Cliente)
- **React 18 + Vite**: Interfaz de alta velocidad para maximizar la productividad del personal.
- **TypeScript**: Tipado estático para garantizar la escalabilidad y reducir errores en producción.
- **Tailwind CSS + Shadcn/UI**: Diseño moderno, responsivo y accesible.
- **React Query (TanStack)**: Gestión eficiente del estado del servidor.

### Backend (Serverless)
- **Supabase**: 
  - **Database**: PostgreSQL para la integridad de datos relacionales.
  - **Auth**: Seguridad de nivel empresarial.
  - **Storage**: Respaldo seguro de documentos y fichas técnicas.
  - **Edge Functions**: Lógica de negocio (Deno/TypeScript) para tareas pesadas como generación de reportes.

## 📂 Estructura del Proyecto

src/
├── components/        # Componentes reutilizables (Tablas, Formularios, UI)
├── context/           # Estado global (ej. Carrito de Compras)
├── integrations/      # Servicios de conexión con Supabase
├── pages/             # Vistas principales (Gestión de Órdenes, Proveedores, etc.)
└── utils/             # Funciones auxiliares y validadores

supabase/
├── functions/         # Edge Functions (Backend logic: PDFs, Emails)
└── migrations/        # Esquemas de base de datos SQL

## 🎓 Contexto del Proyecto
Este desarrollo tiene un doble propósito profesional y académico:

1. Herramienta Laboral: Implementado como sistema oficial para la gestión de compras y proveedores en la empresa.

2. Proyecto Académico: Constituye el proyecto de pasantías y tesis de grado para la titulación en Informática.

Todos los derechos reservados.