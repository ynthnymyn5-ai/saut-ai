import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// The client lives in ./client. In development the Express server mounts Vite
// as middleware (single port, Replit-friendly); in production it serves dist/public.
export default defineConfig({
  root: path.resolve(import.meta.dirname, "client"),
  plugins: [react()],
  resolve: { alias: { "@shared": path.resolve(import.meta.dirname, "shared") } },
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true },
});
