# Tech Stack & Code Quality Rules

## 🛠 Core Stack
- **Framework**: React application with **TypeScript**.
- **Routing**: Use **React Router**. Keep all routes centralized in `src/App.tsx`.
- **Styling**: Always use **Tailwind CSS**. Utilize Tailwind classes extensively for layout, spacing, and design.
- **Components**: Prioritize **shadcn/ui** and **Lucide React** for icons.

## 🏗 Project Structure
- Source code MUST stay in the `src/` folder.
- **Pages**: Store in `src/pages/`.
- **Components**: Store in `src/components/`.
- **Main Entry**: The default page is `src/pages/Index.tsx`. Always update it to include new components so they are visible.

## 🛡 Code Quality & Linting (Critical)
- **Lint Compliance**: All code must comply with the rules defined in `eslint.config.js`. 
- **Type Safety**: Avoid using `any`. Define proper Interfaces or Types for all props and data structures.
- **Imports**: Use clean, organized imports. Group internal and external dependencies separately.
- **shadcn/ui Integrity**: Use prebuilt components from `@/components/ui/`. **DO NOT** edit these files directly; if customization is needed, wrap them in a new component.

## 📦 Available Assets
- All **shadcn/ui** and **Radix UI** components are already installed. Do not attempt to reinstall them.
- Use **Lucide React** for consistent iconography.

---
## 🎨 Visual & UX Evolution (Modern Utility SaaS)

### A. Color Strategy (Strict Palette)
Do not use arbitrary hex codes. Adhere strictly to this semantic palette:

* **Procarni Primary (`#880a0a` - Italian Red):**
    * **USE:** Main action buttons ("Save", "Create"), critical active states.
    * **FORBIDDEN:** Full card backgrounds or long text paragraphs.
* **Procarni Dark (`#0f172a` - Slate 900):**
    * **USE:** Headings (`h1`, `h2`), High-emphasis text, Sidebar backgrounds (if dark mode), Active navigation items.
    * **NOTE:** Replaces pure black for a premium look.
* **Procarni Secondary (`#0e5708` - Success Green):**
    * **USE:** Success indicators, "Approved" states, positive financial values.
* **Procarni Alert (`#d97706` - Technical Amber):**
    * **USE:** Warnings, "Pending" states, low stock alerts.
    * **STYLE:** Always use with soft backgrounds (e.g., `bg-amber-50 text-procarni-alert border-procarni-alert/30`).
* **Monochromatic Base:**
    * **Page Backgrounds:** `bg-gray-50/50` (or `bg-slate-50`).
    * **Cards:** `bg-white` with `border-gray-200` and `shadow-sm`.

### B. Typography & Micro-Labels
* **Micro-Labels:** For input labels and table headers, use:
    `text-[10px] uppercase tracking-wider font-semibold text-gray-500`.
* **Real Data:** For content, use:
    `text-procarni-dark (or gray-900) font-medium text-sm`.
* **Financial Numbers:** Use monospace fonts (`font-mono`) or `tabular-nums` for perfect alignment.

### C. UI Components (Flat Style)
* **Inputs:** Soft borders (`border-gray-200`), light background (`bg-gray-50/50`). Focus ring: `ring-procarni-primary/20`.
* **Tables:** Minimalist. Gray headers, subtle row hover (`hover:bg-gray-50`). Actions aligned to the right.
* **Charts:** Use **Recharts**. Clean style, no heavy grids. Use the corporate palette for lines/bars.

## 🧭 Navigation Architecture

### A. "Index & Create" Pattern
* **Parent Pages (Index):** Management lists (e.g., `PurchaseOrderManagement`). These are the **only** pages visible in the Sidebar.
* **Child Pages (Create/Edit):** Forms (e.g., `GeneratePurchaseOrder`). These must **NOT** appear in the Sidebar. They are accessed via the Parent Page.

### B. Dynamic Breadcrumbs
* Always implement the `DynamicBreadcrumbs` component to provide context (e.g., `Operations > Purchase Orders > New Order`).

## 🛡️ Extended Engineering Standards (TypeScript Strict)

### A. Strict Type Safety (No 'any')
* **GOLDEN RULE:** The use of `any` is **STRICTLY PROHIBITED**.
* **Source of Truth:** Always use types generated in `src/integrations/supabase/types.ts` or explicit interfaces.
* **Unknown:** If a type is uncertain, use `unknown` and perform *type narrowing* (validation) before use.

### B. State & Data Management
* **Data Fetching:** Use `TanStack Query` (React Query) for all asynchronous data reading.
* **Service Layer:** Centralize Supabase logic in `src/integrations/supabase/services/`. Do not write raw `supabase.from...` queries inside UI components.

## 📱 Mobile First Standards

### A. Anti-Overflow Protocol
* **Flexbox Safety:** Always use `min-w-0` on flexible children (`flex-1`) containing text.
* **Text Truncation:** Use `truncate` for long text (IDs, Emails) on mobile. Use `break-words` only if the text is critical.
* **No Horizontal Scroll:** Avoid tables with horizontal scroll. Transform rows into stacked `Cards` for mobile views (`block md:hidden`).

### B. Touch Ergonomics
* **Touch Targets:** Buttons and inputs must be at least 44px high (`h-10` or `h-11`).
* **Full Width Actions:** On mobile, primary action buttons should be `w-full` and stacked vertically (`flex-col`).