// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({
      runtime: 'edge',
      split: true
    }),
    csrf: {
      checkOrigin: false // Pour Vercel
    }
  },
  preprocess: vitePreprocess()
};