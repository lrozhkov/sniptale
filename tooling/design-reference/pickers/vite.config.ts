import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { enableShadowPropertyDefaults } from './shadow-properties.ts';
import { layoutPolicy } from '../../../apps/extension/build/layout.ts';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Build actual picker panels for the bounded local reference server. */
export default defineConfig({
  root: repositoryRoot,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'reference-shadow-property-defaults',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const stylesheet = bundle['pickers.css'];
        if (!stylesheet || stylesheet.type !== 'asset') {
          throw new Error('The picker reference build must emit pickers.css.');
        }
        const css =
          typeof stylesheet.source === 'string'
            ? stylesheet.source
            : new TextDecoder().decode(stylesheet.source);
        stylesheet.source = enableShadowPropertyDefaults(css);
      },
    },
  ],
  resolve: {
    alias: Object.entries(layoutPolicy.aliases).map(([find, replacement]) => ({
      find: find === 'zod' ? /^zod$/u : find,
      replacement: resolve(repositoryRoot, replacement),
    })),
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: resolve(repositoryRoot, 'tooling/design-reference/.generated'),
    emptyOutDir: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./entry.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'pickers.js',
      cssFileName: 'pickers',
    },
  },
});
