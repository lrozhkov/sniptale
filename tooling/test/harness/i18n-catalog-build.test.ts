import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import { createPackagedCatalogs, i18nCatalogs } from '../../../apps/extension/build/i18n-catalogs';
import { CATALOG_PROFILES } from '../../../apps/extension/src/platform/i18n/catalog-profiles';
import {
  createI18nProfileSelections,
  I18N_PROFILE_NAMES,
} from '../../../apps/extension/build/i18n-profile-selections';

const roots: string[] = [];

it('packages every permitted runtime profile', () => {
  expect([...I18N_PROFILE_NAMES].sort()).toEqual([...CATALOG_PROFILES].sort());
});
const catalogPath = 'apps/extension/src/platform/i18n/catalogs';
const english = {
  common: {
    ready: 'Ready',
    bootstrap: { errorTitle: 'Start failed', errorBody: 'Try again' },
    actions: { retry: 'Retry' },
  },
  content: { title: 'Content', pageLauncher: { open: 'Open' } },
  shared: { defaults: { label: 'Default' }, package: 'Package' },
  gallery: {
    needed: 'Needed',
    sideEffect: 'Side-effect',
    unrelated: 'Unrelated',
    typeOnly: 'Type-only',
  },
  scenario: {
    editor: { guideAiSelection: 'Selection', guideAiApply: 'Apply', unrelated: 'Other' },
  },
  popup: { tabs: { video: 'Video' }, unrelated: 'Full popup' },
  editor: { title: 'Editor' },
};

function write(root: string, file: string, source: string) {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, source);
}

function writeCatalogs(root: string, locales: string[]) {
  write(
    root,
    'packages/runtime-contracts/src/i18n.ts',
    `const LOCALE_REGISTRY = {${locales.map((locale) => `${locale}: {}`).join(',')}};`
  );
  for (const locale of locales) {
    const marker = locale === 'en' ? 'Ready' : `UNLOADED-LOCALE-${locale}`;
    write(
      root,
      `${catalogPath}/${locale}.json`,
      JSON.stringify({
        ...english,
        common: { ...english.common, ready: marker },
      })
    );
  }
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-i18n-packaged-'));
  roots.push(root);
  for (const profile of I18N_PROFILE_NAMES) {
    if (profile === 'content-shim' || profile === 'popup-shell') continue;
    const file =
      profile === 'offscreen'
        ? 'offscreen/offscreen.ts'
        : `${profile}/index.${profile === 'background' || profile === 'media-permission' ? 'ts' : 'tsx'}`;
    write(root, `apps/extension/src/${file}`, 'export const preparedProfile = "ready";');
  }
  writeCatalogs(root, ['en', 'ru']);
  write(
    root,
    'apps/extension/src/platform/i18n/catalog-subsets.ts',
    `
    const CATALOG_SUBSETS = {
      bootstrap: ['common.bootstrap.errorTitle', 'common.bootstrap.errorBody', 'common.actions.retry']
    } as const;
  `
  );
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it('keeps owned domains, exact cross-owner keys, and anchored families without adjacent domains', () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/content/index.tsx',
    `
    import '../features/keys';
    import {} from '../features/side-effect';
    import type { Ignored } from '../features/type-only';
    export const title = 'content.title';
  `
  );
  write(
    root,
    'apps/extension/src/features/keys.ts',
    `
    export const key = 'gallery.needed';
    export const instruction = (action: string) => \`scenario.editor.guideAi\${action}\`;
  `
  );
  write(
    root,
    'apps/extension/src/features/type-only.ts',
    `
    export const key = 'gallery.typeOnly';
    export type Ignored = string;
  `
  );
  write(
    root,
    'apps/extension/src/features/side-effect.ts',
    "export const key = 'gallery.sideEffect';"
  );
  const result = createPackagedCatalogs(root);
  const asset = result.assets.find((item) => item.fileName === 'i18n/content/en.json');
  expect(asset).toBeDefined();
  const messages = JSON.parse(asset?.source ?? '{}');
  expect(messages).toMatchObject({
    'content.title': 'Content',
    'gallery.needed': 'Needed',
    'gallery.sideEffect': 'Side-effect',
    'scenario.editor.guideAiSelection': 'Selection',
    'scenario.editor.guideAiApply': 'Apply',
  });
  expect(Object.keys(messages)).not.toContain('gallery.unrelated');
  expect(Object.keys(messages)).not.toContain('gallery.typeOnly');
  expect(Object.keys(messages)).not.toContain('scenario.editor.unrelated');
  expect(result.watchFiles).toContain(path.join(root, 'apps/extension/src/features/keys.ts'));
  expect(result.watchFiles).not.toContain(
    path.join(root, 'apps/extension/src/features/type-only.ts')
  );
});

it('follows exact package exports and includes already reachable dynamic imports before interface use', () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/content/index.tsx',
    `
    import '@sniptale/platform/translation';
    export const module = () => import('../features/dynamic');
  `
  );
  write(root, 'apps/extension/src/features/dynamic.ts', "export const key = 'gallery.needed';");
  write(
    root,
    'packages/platform/package.json',
    JSON.stringify({
      name: '@sniptale/platform',
      exports: { './translation': './src/translation.ts' },
    })
  );
  write(root, 'packages/platform/src/translation.ts', "export const key = 'shared.package';");
  fs.mkdirSync(path.join(root, 'node_modules/@sniptale'), { recursive: true });
  fs.symlinkSync(
    path.join(root, 'packages/platform'),
    path.join(root, 'node_modules/@sniptale/platform')
  );
  const { selections } = createI18nProfileSelections(root, english);
  expect(selections.content).toContain('shared.package');
  expect(selections.content).toContain('gallery.needed');
  expect(selections.content).not.toContain('gallery.unrelated');
});

it('keeps initial popup and content shim data bounded despite their loader dependencies', () => {
  const root = fixture();
  write(root, 'apps/extension/src/popup/shell/app/index.tsx', "import '../../../gallery/index';");
  write(
    root,
    'apps/extension/src/content/runtime/shim/index.ts',
    "import '../../../editor/index';"
  );
  const { selections } = createI18nProfileSelections(root, english);
  expect(selections['popup-shell']).toEqual([
    'common.actions.retry',
    'common.bootstrap.errorBody',
    'common.bootstrap.errorTitle',
    'common.ready',
    'popup.tabs.video',
  ]);
  expect(selections['content-shim']).toEqual([
    'content.pageLauncher.open',
    'shared.defaults.label',
  ]);
});

async function buildFixture(root: string) {
  const result = await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [i18nCatalogs(root)],
    build: {
      write: false,
      rollupOptions: {
        input: path.join(root, 'apps/extension/src/content/index.tsx'),
        preserveEntrySignatures: 'strict',
      },
    },
  });
  if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one build output');
  return result.output;
}

it('ships ten locale resource sets without growing startup JavaScript or importing catalog JSON', async () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/content/index.tsx',
    `
    import { catalogs } from 'sniptale:i18n/bootstrap';
    export const failureMessages = catalogs.en;
  `
  );
  const initial = await buildFixture(root);
  writeCatalogs(root, ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ja', 'ko']);
  const expanded = await buildFixture(root);
  const chunks = (output: typeof initial) =>
    output
      .filter((item) => item.type === 'chunk')
      .map((chunk) => ({ code: chunk.code, modules: chunk.moduleIds }));
  expect(chunks(expanded)).toEqual(chunks(initial));
  expect(chunks(expanded).flatMap((chunk) => chunk.modules)).not.toContainEqual(
    expect.stringContaining('/platform/i18n/catalogs/')
  );
  const assets = expanded.filter((item) => item.type === 'asset');
  expect(assets).toHaveLength(I18N_PROFILE_NAMES.length * 10);
  expect(assets.find((item) => item.fileName === 'i18n/content/de.json')?.source).toContain(
    'UNLOADED-LOCALE-de'
  );
  expect(
    chunks(expanded)
      .map((chunk) => chunk.code)
      .join('\n')
  ).not.toContain('UNLOADED-LOCALE-');
  const startup = chunks(expanded)
    .map((chunk) => chunk.code)
    .join('\n');
  expect(startup).toContain('Start failed');
  expect(startup).toContain('Try again');
  expect(startup).toContain('Retry');
  expect(startup).not.toContain('Ready');
});

it.each(['', '?raw'])(
  'rejects accidental authored catalog imports %s in emitted JavaScript',
  async (query) => {
    const root = fixture();
    write(
      root,
      'apps/extension/src/content/index.tsx',
      `
    import catalog from '../platform/i18n/catalogs/en.json${query}';
    export const title = catalog;
  `
    );
    await expect(buildFixture(root)).rejects.toThrow(
      'must not import authored translation catalogs'
    );
  }
);

it('rejects legacy all-language virtual projections in production JavaScript', async () => {
  const root = fixture();
  write(
    root,
    'apps/extension/src/platform/i18n/catalog-subsets.ts',
    `
    const CATALOG_SUBSETS = { popup: ['common'] } as const;
  `
  );
  write(
    root,
    'apps/extension/src/content/index.tsx',
    `
    export { catalogs } from 'sniptale:i18n/popup';
  `
  );
  await expect(buildFixture(root)).rejects.toThrow('must use prepared translation data');
});

it('serves the same packaged data in development and refreshes watched translation values', async () => {
  const root = fixture();
  const plugin = i18nCatalogs(root);
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [plugin],
    server: { middlewareMode: true },
  });
  try {
    const middleware = server.middlewares.stack.find((item) => item.route === '/i18n');
    if (!middleware) throw new Error('Expected the packaged catalog middleware');
    function requestCatalog(url = '/content/ru.json') {
      let source = '';
      Reflect.apply(middleware.handle, undefined, [
        { url },
        {
          setHeader() {},
          end(value: string) {
            source = value;
          },
        },
        (error: unknown) => {
          throw error ?? new Error('Catalog not found');
        },
      ]);
      return JSON.parse(source);
    }
    expect(requestCatalog()).toMatchObject({ 'common.ready': 'UNLOADED-LOCALE-ru' });
    const changed = { ...english, common: { ...english.common, ready: 'Обновлено' } };
    write(root, `${catalogPath}/ru.json`, JSON.stringify(changed));
    if (typeof plugin.handleHotUpdate !== 'function')
      throw new Error('Expected a catalog HMR hook');
    await Reflect.apply(plugin.handleHotUpdate, undefined, [
      {
        file: path.join(root, catalogPath, 'ru.json'),
        server,
        modules: [],
      },
    ]);
    expect(requestCatalog()).toMatchObject({ 'common.ready': 'Обновлено' });
    const entry = 'apps/extension/src/content/index.tsx';
    write(root, entry, "export const key = 'gallery.needed';");
    await Reflect.apply(plugin.handleHotUpdate, undefined, [
      {
        file: path.join(root, entry),
        server,
        modules: [],
      },
    ]);
    expect(requestCatalog()).toMatchObject({ 'gallery.needed': 'Needed' });
    expect(() => requestCatalog('/../content/ru.json')).toThrow('Catalog not found');
    expect(() => requestCatalog('/content/unknown.json')).toThrow('Catalog not found');
  } finally {
    await server.close();
  }
});
