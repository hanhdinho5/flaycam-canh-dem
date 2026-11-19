import { defineConfig } from 'vite';
import { resolve } from 'node:path';
const r = (f: string) => resolve(import.meta.dirname, f);
export default defineConfig({
  server: { host: true, port: 5173 },
  build: { rollupOptions: { input: { main: r('index.html'), control: r('control.html') } } },
});
