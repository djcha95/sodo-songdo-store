// vite.config.ts
import { defineConfig } from 'vitest/config'; // ⬅️ 여기만 변경!
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  cacheDir: '../../node_modules/.vite/sodomall-app-cache',

  server: {
    proxy: {
      '/api': {
        target: 'https://asia-northeast3-sso-do.cloudfunctions.net',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/firebase-storage-proxy': {
        target: 'https://firebasestorage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/firebase-storage-proxy/, ''),
      },
    },
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      treeshake: true,
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
              return 'chunk-react';
            }
            const svc =
              id.match(
                /[\\/]node_modules[\\/](?:firebase|@firebase)[\\/](app-check|analytics|auth|firestore|functions|storage|messaging|performance|remote-config|app)[\\/]/
              )?.[1] ||
              (/[\\/]node_modules[\\/](?:firebase|@firebase)[\\/]app[\\/]/.test(id) ? 'app' : null);

            if (svc) return `chunk-firebase-${svc}`;
            return 'chunk-vendor';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 800,
  },

  optimizeDeps: {
    esbuildOptions: { target: 'es2020' },
  },

  // Vitest 설정 — 이제 타입 에러 없음
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});