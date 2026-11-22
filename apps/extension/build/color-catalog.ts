import { colornames } from 'color-name-list';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import type { Plugin } from 'vite';

const COLOR_CATALOG_MODULE =
  /[/\\]node_modules[/\\]color-name-list[/\\]dist[/\\]colornames\.esm\.js$/;

/** Preserve every upstream color and its order without repeating object field names. */
export function createCompactColorCatalogSource(): string {
  const tuples = colornames.map(({ name, hex }) => [name, hex]);
  return `export const colornames = ${JSON.stringify(tuples)}.map(([name, hex]) => ({name, hex}));`;
}

/** Supply the same compact color representation to extension pages and development. */
export function compactColorCatalog(): Plugin {
  return {
    name: 'sniptale:compact-color-catalog',
    enforce: 'pre',
    transform(_source, id) {
      if (COLOR_CATALOG_MODULE.test(id)) return createCompactColorCatalogSource();
    },
  };
}

/** Supply the compact representation to the self-contained injected bundles. */
export function esbuildCompactColorCatalog(): EsbuildPlugin {
  return {
    name: 'sniptale-compact-color-catalog',
    setup(build) {
      build.onLoad({ filter: COLOR_CATALOG_MODULE }, () => ({
        contents: createCompactColorCatalogSource(),
        loader: 'js',
      }));
    },
  };
}
