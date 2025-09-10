// vite.config.ts

/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// ✅ [추가] 번들 분석 도구를 import 합니다.
import { visualizer } from 'rollup-plugin-visualizer';

// https://vitejs.dev/config/
export default defineConfig({
  // ✅ [수정] plugins 배열에 visualizer를 추가합니다.
  plugins: [
    react(),
    visualizer({
      open: true, // 빌드 시 자동으로 분석 리포트를 브라우저에서 엽니다.
      filename: 'dist/bundle-analysis.html', // 결과 파일을 dist 폴더 내에 생성합니다.
      gzipSize: true, // gzip 압축 후의 크기도 함께 보여줍니다.
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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

  // ✅ [추가] Vitest 테스트 환경 설정
  test: {
    globals: true, // describe, it, expect 등을 import 없이 사용
    environment: 'jsdom', // 브라우저 DOM 환경 시뮬레이션
    setupFiles: './src/setupTests.ts', // 테스트 실행 전 설정 파일 지정
    css: true, // CSS 파일 처리 활성화
  },
});