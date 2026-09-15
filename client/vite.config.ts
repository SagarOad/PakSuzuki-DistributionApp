import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev server proxies /api to the local Web API so the React dev experience matches
// production (same-origin relative fetches), no CORS juggling needed even locally.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5080',
        changeOrigin: true,
        secure: false
      },
      // Uploads live on the API (App_Data), not in the Vite/wwwroot build output.
      '/uploads': {
        target: 'http://localhost:5080',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    // Ships straight into the API project's wwwroot - see ../deploy.md for the
    // full "all-in-one" IIS/VPS deployment flow.
    outDir: '../src/Presentation/PakSuzuki.WebApi/wwwroot',
    emptyOutDir: true
  }
})
