import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
      },
      plugins: [
        react(), 
        tailwindcss()
      ],
      base: '/',
      assetsInclude: ['**/*.png', '**/*.jpg', '**/*.svg', '**/*.PNG', '**/*.JPG', '**/*.JPEG', '**/*.jpeg'],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
          '@features': path.resolve(__dirname, 'src/features')
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        target: 'es2022',
        minify: 'esbuild',
        cssCodeSplit: true,
        chunkSizeWarningLimit: 1200,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('pdfjs-dist') || id.includes('jspdf') || id.includes('jspdf-autotable')) {
                  return 'vendor-pdf';
                }
                if (id.includes('tesseract.js')) {
                  return 'vendor-ocr';
                }
                if (id.includes('read-excel-file') || id.includes('jszip')) {
                  return 'vendor-excel';
                }
                if (id.includes('recharts') || id.includes('d3') || id.includes('chart.js') || id.includes('react-chartjs-2')) {
                  return 'vendor-charts';
                }
                if (id.includes('lucide-react')) {
                  return 'vendor-icons';
                }
                if (id.includes('motion') || id.includes('framer-motion')) {
                  return 'vendor-motion';
                }
                if (id.includes('firebase')) {
                  return 'vendor-firebase';
                }
                if (id.includes('@google/genai')) {
                  return 'vendor-gemini';
                }
                if (id.includes('dexie') || id.includes('zustand')) {
                  return 'vendor-state';
                }
              }
            }
          }
        }
      }
    };
});

