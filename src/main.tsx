import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(<App />);
