import react from '@vitejs/plugin-react'
import type { Connect } from 'vite'
import { defineConfig, type Plugin } from 'vite'

function immutableSamples(): Plugin {
  const apply: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url?.startsWith('/samples/')) {
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    next()
  }
  return {
    name: 'immutable-samples',
    configureServer(server) {
      server.middlewares.use(apply)
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply)
    },
  }
}

// Relative base so the built site works from a subfolder (npx serve, GitHub pages path, etc.).
export default defineConfig({
  base: './',
  plugins: [react(), immutableSamples()],
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
