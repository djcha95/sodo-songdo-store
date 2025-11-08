// vite.config.ts

/// <reference types="vitest" /> 
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; 
// ✅ [추가] 방금 설치한 inspect 플러그인을 import합니다.
import Inspect from 'vite-plugin-inspect';
// ✅ [추가] PWA 플러그인 import (이전에 추가했던 코드)
import { VitePWA } from 'vite-plugin-pwa'; 

export default defineConfig({
  plugins: [
    // ✅ [추가] Inspect()를 plugins 배열의 맨 처음에 추가합니다.
    Inspect(), 
    react(),
    // ✅ [추가] PWA 플러그인 및 dev 옵션 (이전에 추가했던 코드)
    VitePWA({
      devOptions: {
        enabled: false 
      },
    })
  ], 
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // ✅ [추가] /src 경로도 @와 동일하게 처리하도록 강제 (모듈 중복 방지)
      '/src': path.resolve(__dirname, 'src'),
    },
  },
  
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

  // ... (build, optimizeDeps, test 설정은 기존과 동일합니다) ...
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      treeshake: true, 
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const svc = (
              id.match(
                /[\\/]node_modules[\\/](?:firebase|@firebase)[\\/](app-check|analytics|auth|firestore|functions|storage|messaging|performance|remote-config|app)[\\/]/
              )?.[1] ||
              (/[\\/]node_modules[\\/](?:firebase|@firebase)[\\/]app[\\/]/.test(id) ? 'app' : null)
            );
            if (svc) {
              return `chunk-firebase-${svc}`;
            }
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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});