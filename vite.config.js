// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Esto le dice a Vite: cuando un paquete pida 'events',
      // en su lugar, dale el paquete 'events' que acabamos de instalar.
      events: 'events',
    }
  }
})