// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Regrouper les services
          if (id.includes('/services/')) {
            return 'app-services';
          }
          // Regrouper les stores
          if (id.includes('/stores/')) {
            return 'app-stores';
          }
          // Regrouper les composants
          if (id.includes('/components/')) {
            return 'app-components';
          }
          // Dépendances externes majeures
          if (id.includes('node_modules/viem/')) {
            return 'vendor-viem';
          }
          if (id.includes('node_modules/@walletconnect/') || 
              id.includes('node_modules/@reown/')) {
            return 'vendor-wallet';
          }
          if (id.includes('node_modules/crypto-js/')) {
            return 'vendor-crypto';
          }
        }
      }
    }
  }
});