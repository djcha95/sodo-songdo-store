// vite.config.ts

/// <reference types="vitest" /> 
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; 
import Inspect from 'vite-plugin-inspect';

// ✅ [수정] Manifest 오류 해결을 위해 잠시 주석 처리합니다.
// import { VitePWA } from 'vite-plugin-pwa'; 

export default defineConfig({
  plugins: [
    Inspect(), 
    react(),
    
    // ✅ [수정] Manifest 오류 해결을 위해 플러그인 사용 부분을 주석 처리합니다.
    // 나중에 PWA 기능이 필요할 때 다시 주석을 해제하세요.
    /*
    VitePWA({
      devOptions: {
        enabled: false 
      },
    })
    */
  ], 
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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