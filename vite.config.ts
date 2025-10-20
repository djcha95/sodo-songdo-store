// vite.config.ts

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
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

  // ✅ [수정] build 옵션: 
  // manualChunks를 더 세분화하여 500kB가 넘는 chunk-firebase를 분리합니다.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // node_modules의 라이브러리들을 분리합니다.
          if (id.includes('node_modules')) {
            
            // --- 1. Firebase를 서비스별로 더 잘게 분리 ---
            if (id.includes('firebase/auth')) {
              return 'chunk-firebase-auth';
            }
            if (id.includes('firebase/firestore')) {
              return 'chunk-firebase-firestore';
            }
            if (id.includes('firebase/functions')) {
              return 'chunk-firebase-functions';
            }
            // 기타 firebase (예: app, storage 등)
            if (id.includes('firebase')) {
              return 'chunk-firebase-core';
            }

            // --- 2. React 관련 ---
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
              return 'chunk-react';
            }

            // --- 3. UI 라이브러리 ---
            if (id.includes('framer-motion')) {
              return 'chunk-motion';
            }
            if (id.includes('swiper')) {
              return 'chunk-swiper';
            }

            // --- 4. 유틸리티 라이브러리 ---
            if (id.includes('dayjs')) {
              return 'chunk-dayjs';
            }
            if (id.includes('react-hot-toast')) {
              return 'chunk-toast';
            }
            
            // --- 5. 그 외 모든 벤더 ---
            return 'chunk-vendor'; 
          }
        },
      },
    },
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});