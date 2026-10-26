import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { registerSW } from "virtual:pwa-register";

// Prevent mouse wheel from inadvertently changing values in number inputs across the entire application
window.addEventListener(
  "wheel",
  () => {
    if (document.activeElement instanceof HTMLInputElement && document.activeElement.type === "number") {
      document.activeElement.blur();
    }
  },
  { passive: true }
);

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
