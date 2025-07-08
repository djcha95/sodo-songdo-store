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
  // 💡 [추가] Vite의 캐시 폴더 위치를 프로젝트 외부로 지정
  cacheDir: '../../node_modules/.vite/sodomall-app-cache',
});