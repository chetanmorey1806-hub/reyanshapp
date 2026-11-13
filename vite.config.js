import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { storiesAI } from './server/aiEditor.js'

export default defineConfig({
  plugins: [react(), storiesAI()],
  // decoders are lazy-loaded; pre-bundle them so the first HEIC/TIFF upload doesn't reload the page
  optimizeDeps: { include: ['heic2any', 'utif'] },
})
