import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/mermaid-editor/',
  server: {
    port: 5180,
    strictPort: true,
  },
})
