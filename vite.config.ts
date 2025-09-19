// vite.config.ts

/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite'; // ✅ [추가] 명시적인 타입 import

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 현재 환경(development, production 등)에 따라 환경 변수를 불러옵니다.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // ✅ [수정] 조건부 스프레딩을 사용하여 플러그인 배열을 구성합니다.
    plugins: [
      react(),
      ...(env.NODE_ENV !== 'production'
        ? [
            visualizer({
              open: true,
              filename: 'dist/bundle-analysis.html',
              gzipSize: true,
            }) as Plugin, // 타입 단언 추가
          ]
        : []),
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
          rewrite: (path) => path.replace(/^\/firebase-storage-proxy/, ''),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      css: true,
    },
  };
});