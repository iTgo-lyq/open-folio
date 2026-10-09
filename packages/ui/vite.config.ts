import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: new URL("./preview", import.meta.url).pathname,
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 10683, strictPort: true },
  preview: { host: "127.0.0.1", port: 10683, strictPort: true },
});
