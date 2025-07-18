// vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  cacheDir: '../../node_modules/.vite/sodomall-app-cache',
  
  server: {
    proxy: {
      '/api': {
        // 1. 요청을 보낼 실제 Firebase 서버 주소 (이 부분은 그대로 둡니다)
        target: 'https://asia-northeast3-sso-do.cloudfunctions.net',
        changeOrigin: true,

        // 2. ✅ [추가] 이 부분이 핵심입니다.
        // 프론트에서 보낸 주소('/api/kakaoLogin')에서 '/api' 부분을 제거하고
        // '/kakaoLogin'만 실제 서버로 전달합니다.
        rewrite: (path) => path.replace(/^\/api/, ''), 
      },
      // ✅ [추가] Firebase Storage CORS 문제 해결을 위한 프록시 설정
      '/firebase-storage-proxy': {
        target: 'https://firebasestorage.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/firebase-storage-proxy/, '')
      }
    },
  },
});