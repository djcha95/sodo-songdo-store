// vite.config.ts

/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';
import type { PluginOption } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 현재 환경(development, production 등)에 따라 환경 변수를 불러옵니다.
  const env = loadEnv(mode, process.cwd(), '');
  
  // ✅ [수정] 플러그인 배열을 미리 정의하는 방식으로 변경
  const plugins: PluginOption[] = [react()];

  // 프로덕션 빌드가 아닐 때만 visualizer 플러그인을 추가
  if (env.NODE_ENV !== 'production') {
    plugins.push(
      visualizer({
        open: true,
        filename: 'dist/bundle-analysis.html',
        gzipSize: true,
      })
    );
  }
  
  return {
    // ✅ [수정] 위에서 정의한 plugins 변수를 사용
    plugins: plugins,
    
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