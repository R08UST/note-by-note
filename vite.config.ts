import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Relative base so the built site works from a subfolder (npx serve, GitHub pages path, etc.).
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['homr-web', 'onnxruntime-web'],
    include: ['homr-web > @techstark/opencv-js'],
  },
  server: {
    host: '127.0.0.1',
    port: 4317,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4318,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
