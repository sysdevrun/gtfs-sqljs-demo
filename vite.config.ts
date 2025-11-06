import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/gtfs-sqljs-demo/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['gtfs-sqljs'],
    include: ['jszip', 'papaparse', 'sql.js', 'protobufjs']
  }
})
