import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4444',
        changeOrigin: true
      },
      '/download': {
        target: 'http://localhost:4444',
        changeOrigin: true
      },
      '/bootstrap': {
        target: 'http://localhost:4444',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:4444',
        ws: true,
        changeOrigin: true
      }
    }
  }
})