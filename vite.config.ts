import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the built site works from a subfolder (npx serve, GitHub pages path, etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4318,
    strictPort: true,
  },
})
