import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom', 'wagmi', '@tanstack/react-query', 'viem'],
  },
  optimizeDeps: {
    include: ['wagmi', '@tanstack/react-query', 'viem'],
  },
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],
})
