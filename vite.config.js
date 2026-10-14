import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { include: ['tests/**/*.test.{js,jsx}'], fileParallelism: false },
  build: {
    outDir: 'dist'
  }
});
