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

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    css: true,
  },
});