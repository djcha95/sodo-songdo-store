// vite.config.ts

/// <reference types="vitest" /> // ✅ [확인] 이 지시문이 파일 맨 위에 있어야 합니다.
import { defineConfig } from 'vite'; // ✅ [수정] 'vitest/config'가 아닌 'vite'에서 가져옵니다.
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
        rewrite: (path) => path.replace(/^\/api/, ''), 
      },
      '/firebase-storage-proxy': {
        target: 'https://firebasestorage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/firebase-storage-proxy/, '')
      }
    },
  },

  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      treeshake: true, // treeshake 옵션 위치 수정됨 (이전 단계에서)
      output: {
        manualChunks(id) {
          // -------- React / Router 묶음 --------
          if (id.includes('node_modules')) {
            if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
              return 'chunk-react';
            }
            // -------- Firebase 서비스별 분리 --------
            const svc = (
              id.match(
                /[\\/]node_modules[\\/](?:firebase|@firebase)[\\/](app-check|analytics|auth|firestore|functions|storage|messaging|performance|remote-config|app)[\\/]/
              )?.[1] ||
              (/[\\/]node_modules[\\/](?:firebase|@firebase)[\\/]app[\\/]/.test(id) ? 'app' : null)
            );
            if (svc) {
              return `chunk-firebase-${svc}`;
            }
            // -------- 기타 외부 라이브러리 --------
            return 'chunk-vendor';
          }
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    chunkSizeWarningLimit: 800 
  },
  
  optimizeDeps: {
    esbuildOptions: { target: 'es2020' }
  },

  // Vitest 설정 (이제 타입 오류 없이 작동해야 함)
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});