// vite.config.ts

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// ⚠️ [변경] path는 더 이상 필요 없으므로 제거해도 됩니다.
// import path from 'path'; 
import tsconfigPaths from 'vite-tsconfig-paths'; // ✅ [추가] 플러그인을 import 합니다.

// https://vitejs.dev/config/
export default defineConfig({
  // ✅ [수정] plugins 배열에 tsconfigPaths()를 추가합니다.
  plugins: [react(), tsconfigPaths()],

  // ⚠️ [제거] tsconfigPaths 플러그인이 자동으로 처리하므로 이 부분은 제거합니다.
  // resolve: {
  //   alias: {
  //     '@': path.resolve(__dirname, './src'),
  //   },
  // },

  // --- 이하 기존 설정은 그대로 유지합니다 ---
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

  // ✅ [추가] build 옵션: 
  // 거대한 index.js 파일을 라이브러리별로 분리하여 Vercel 배포 오류를 해결합니다.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // node_modules의 라이브러리들을 분리합니다.
          if (id.includes('node_modules')) {
            // 1. firebase 관련 파일들을 'chunk-firebase'로 분리
            if (id.includes('firebase')) {
              return 'chunk-firebase';
            }
            // 2. react 관련 파일들을 'chunk-react'로 분리
            if (id.includes('react-router-dom') || id.includes('react-dom') || id.includes('react')) {
              return 'chunk-react';
            }
            // 3. framer-motion을 'chunk-motion'으로 분리
            if (id.includes('framer-motion')) {
              return 'chunk-motion';
            }
            // 4. 기타 라이브러리 (dayjs, toast 등)
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