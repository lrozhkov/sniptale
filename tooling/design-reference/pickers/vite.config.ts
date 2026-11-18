import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { enableShadowPropertyDefaults } from './shadow-properties.ts';
import { flattenCatalog } from '../../../apps/extension/build/i18n-profile-selections.ts';
import { layoutPolicy } from '../../../apps/extension/build/layout.ts';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const referenceCatalog = '\0reference-picker-catalog';
const gradientStorage = fileURLToPath(new URL('./reference-gradient-storage.ts', import.meta.url));
const pickerPreferences = fileURLToPath(
  new URL('./reference-picker-preferences.ts', import.meta.url)
);
const paintLifecycle = fileURLToPath(new URL('./reference-paint-lifecycle.ts', import.meta.url));
const catalogDirectory = resolve(repositoryRoot, 'apps/extension/src/platform/i18n/catalogs');

function loadPickerMessages(locale: string) {
  const file = resolve(catalogDirectory, locale + '.json');
  const catalog: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return Object.fromEntries(
    Object.entries(flattenCatalog(catalog)).filter(
      ([key]) => key.startsWith('shared.ui.') || key.startsWith('highlighter.paintPicker.')
    )
  );
}

/** Build actual picker panels for the bounded local reference server. */
export default defineConfig({
  root: repositoryRoot,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'reference-picker-resources',
      enforce: 'pre',
      resolveId(source, importer) {
        if (
          source === '../../composition/picker-preferences/use-picker-preferences' &&
          importer?.endsWith('/apps/extension/src/ui/paint-selector/index.tsx')
        ) {
          return pickerPreferences;
        }
        if (
          source === './lifecycle' &&
          importer?.endsWith('/apps/extension/src/ui/paint-selector/index.tsx')
        ) {
          return paintLifecycle;
        }
        if (
          source === '../infrastructure/browser-storage' &&
          importer?.includes('/composition/persistence/gradient-presets/')
        ) {
          return gradientStorage;
        }
        if (
          source === '../catalog-transport' &&
          importer?.endsWith('/platform/i18n/locale/state.ts')
        ) {
          return referenceCatalog;
        }
      },
      load(id) {
        if (id !== referenceCatalog) return;
        const messages = { en: loadPickerMessages('en'), ru: loadPickerMessages('ru') };
        return `const messages = ${JSON.stringify(messages)};
          export async function loadCatalogMessages(locale) { return messages[locale]; }`;
      },
    },
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
