// vite.config.ts

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path' // ✅ 개선 사항: 'path' 모듈 import

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // ✅ 개선 사항: 절대 경로 별칭(@) 설정을 추가하여 빌드 오류 해결
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})