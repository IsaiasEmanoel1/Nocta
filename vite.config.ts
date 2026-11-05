import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', css: false, include: ['src/test/**/*.test.{ts,tsx}'] },
  server: {
    strictPort: true, port: 5173,
    watch: { ignored: ['**/inspirações/**', '**/.cache/**', '**/android/**', '**/test-results/**'] },
  },
})
