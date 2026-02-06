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