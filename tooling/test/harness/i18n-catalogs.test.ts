import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { afterEach, expect, it } from 'vitest';
import {
  createCatalogProjection,
  esbuildI18nCatalogs,
  i18nCatalogs,
} from '../../../apps/extension/build/i18n-catalogs';

const roots: string[] = [];
const i18n = 'apps/extension/src/platform/i18n';
const manifest = {
  popup: ['common', 'popup', 'settings.quickActions'],
  'popup-shell': ['common', 'popup.tabs'],
  'content-shim': ['shared.defaults', 'content.pageLauncher'],
};

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-i18n-build-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, i18n, 'catalogs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages/platform/src/i18n'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'packages/platform/src/i18n/config.ts'),
    'const LOCALE_REGISTRY = {en: {}, ru: {}};'
  );
  writeManifest(root, manifest);
  writeCatalogs(root, 'Common');
  return root;
}

function writeManifest(root: string, value: typeof manifest) {
  fs.writeFileSync(
    path.join(root, i18n, 'catalog-subsets.ts'),
    `export const CATALOG_SUBSETS = ${JSON.stringify(value)} as const;`
  );
}

function writeCatalogs(root: string, title: string) {
  for (const locale of ['en', 'ru']) {
    fs.writeFileSync(
      path.join(root, i18n, 'catalogs', `${locale}.json`),
      JSON.stringify({
        common: { title: `${title}-${locale}` },
        popup: { tabs: { title: `Tab-${locale}` }, extra: `Popup-only-${locale}` },
        settings: {
          quickActions: { title: `Quick-${locale}` },
          unrelated: `Settings-only-${locale}`,
        },
        shared: { defaults: { title: `Default-${locale}` } },
        content: { pageLauncher: { title: `Launcher-${locale}` } },
        editor: { title: `Editor-only-${locale}` },
      })
    );
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('preserves selected locale values and excludes unrelated scopes from the emitted runtime graph', async () => {
  const root = fixture();
  for (const [name, present, absent] of [
    ['popup', 'Quick-en', 'Editor-only-en'],
    ['popup-shell', 'Tab-ru', 'Popup-only-ru'],
    ['content-shim', 'Launcher-ru', 'Common-ru'],
  ]) {
    const result = await build({
      stdin: { contents: `export {catalogs} from 'sniptale:i18n/${name}';`, resolveDir: root },
      plugins: [esbuildI18nCatalogs(root)],
      write: false,
      bundle: true,
      metafile: true,
      format: 'esm',
    });
    const output = result.outputFiles[0].text;
    expect(output).toContain(present);
    expect(output).not.toContain(absent);
    expect(output).not.toContain('Settings-only');
    expect(Object.keys(result.metafile.inputs)).not.toContainEqual(
      expect.stringContaining('catalogs/')
    );
    expect(Object.values(result.metafile.outputs).flatMap((file) => file.imports)).toEqual([]);
  }
});

it('rejects malformed catalogs and missing projection paths before emitting a partial module', () => {
  const root = fixture();
  fs.writeFileSync(path.join(root, i18n, 'catalogs/en.json'), '{"common":"a","common":"b"}');
  expect(() => createCatalogProjection(root, 'popup')).toThrow(/duplicate/u);
  writeCatalogs(root, 'Common');
  writeManifest(root, { ...manifest, popup: ['missing.branch'] });
  expect(() => createCatalogProjection(root, 'popup')).toThrow(
    'en: missing catalog projection path missing.branch'
  );
  expect(() => createCatalogProjection(root, 'unknown')).toThrow('Unknown i18n catalog projection');
});

it('watches all source inputs and rereads catalog and subset changes without a stale projection cache', () => {
  const root = fixture();
  const first = createCatalogProjection(root, 'popup');
  expect(first.watchFiles).toEqual(
    expect.arrayContaining([
      path.join(root, i18n, 'catalog-subsets.ts'),
      path.join(root, i18n, 'catalogs/en.json'),
      path.join(root, i18n, 'catalogs/ru.json'),
      path.join(root, 'packages/platform/src/i18n/config.ts'),
    ])
  );
  writeCatalogs(root, 'Changed');
  expect(createCatalogProjection(root, 'popup').code).toContain('Changed-en');
  expect(createCatalogProjection(root, 'popup').code).not.toContain('Common-en');
  writeManifest(root, { ...manifest, popup: ['common'] });
  expect(createCatalogProjection(root, 'popup').code).not.toContain('Tab-en');
});

it('resolves the same compact module through the Vite/Vitest adapter', async () => {
  const root = fixture();
  const plugin = i18nCatalogs(root);
  const server = await createServer({
    configFile: false,
    root,
    plugins: [plugin],
    server: { middlewareMode: true },
  });
  try {
    const result = await server.ssrLoadModule('sniptale:i18n/popup-shell');
    expect(result.catalogs.en).toEqual({
      common: { title: 'Common-en' },
      popup: { tabs: { title: 'Tab-en' } },
    });
    expect(result.catalogs.ru.popup).not.toHaveProperty('extra');
    writeCatalogs(root, 'Updated');
    const update = plugin.handleHotUpdate;
    if (typeof update !== 'function') throw new Error('Missing catalog HMR hook');
    const modules = await Reflect.apply(update, undefined, [
      {
        file: path.join(root, i18n, 'catalogs/en.json'),
        server,
        modules: [],
      },
    ]);
    expect(modules.map((item: { id: string }) => item.id)).toContain('\0sniptale:i18n/popup-shell');
    const refreshed = await server.ssrLoadModule('sniptale:i18n/popup-shell');
    expect(refreshed.catalogs.en.common.title).toBe('Updated-en');
  } finally {
    await server.close();
  }
});
