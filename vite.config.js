import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps the build working when it is served from a sub-path
// (GitHub Pages project sites) as well as from a domain root (Vercel/Netlify).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: true,
    port: 5173,
  },
})
