import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { colornames } from 'color-name-list';
import { build as buildEsbuild } from 'esbuild';
import { build as buildVite } from 'vite';

import { expect, it, vi } from 'vitest';

import {
  compactColorCatalog,
  createCompactColorCatalogSource,
  esbuildCompactColorCatalog,
} from '../../../apps/extension/build/color-catalog';
import { createContentRuntimeBuildId } from '../../../apps/extension/build/content-runtime-build-id';
import { createNamedCatalog } from '../../../apps/extension/src/ui/color-selector/catalog-model';
import {
  CONTENT_RUNTIME_EXECUTION_FOOTER,
  CONTENT_RUNTIME_GLOBAL_NAME,
  contentRuntimeDefines,
  getTraceWsUrlForMode,
  isTraceMessagesEnabledForMode,
  shouldEmitBuildSourcemaps,
} from '../../../apps/extension/build/injected-build';
import { CHROME_BUILD_TARGET, getChromeBuildTarget } from '../../../apps/extension/build/manifest';

const catalogBundles = new Map<string, Promise<string>>();
function injectedCatalogBundle(mode: string): Promise<string> {
  const previous = catalogBundles.get(mode);
  if (previous) return previous;
  const built = buildEsbuild({
    entryPoints: ['apps/extension/src/platform/i18n/catalog-transport.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'injectedCatalogProof',
    target: CHROME_BUILD_TARGET,
    minify: mode === 'release',
    logLevel: 'silent',
    define: contentRuntimeDefines(mode, 'catalog-proof'),
  }).then((result) => result.outputFiles[0]!.text);
  catalogBundles.set(mode, built);
  return built;
}

async function injectedCatalogClient(mode: string) {
  const replies = new Set<(value: unknown) => void>();
  const disconnects = new Set<() => void>();
  const deadlines = new Map<number, { callback(): void; delay: number }>();
  let sequence = 0;
  const port = {
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: {
      addListener: (listener: (value: unknown) => void) => replies.add(listener),
      removeListener: (listener: (value: unknown) => void) => replies.delete(listener),
    },
    onDisconnect: {
      addListener: (listener: () => void) => disconnects.add(listener),
      removeListener: (listener: () => void) => disconnects.delete(listener),
    },
  };
  const connect = vi.fn(() => port);
  const fetch = vi.fn(() => {
    throw new Error('Content catalogs must use the checked Port');
  });
  const context = {
    URL,
    TextEncoder,
    TextDecoder,
    fetch,
    location: { protocol: 'https:', host: 'host.test' },
    chrome: {
      runtime: { getURL: (value: string) => `chrome-extension://fixture/${value}`, connect },
    },
    setTimeout(callback: () => void, delay: number) {
      const id = ++sequence;
      deadlines.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id: number) {
      deadlines.delete(id);
    },
  };
  const api: unknown = runInNewContext(
    `${await injectedCatalogBundle(mode)}; injectedCatalogProof;`,
    context
  );
  const load = api && typeof api === 'object' ? Reflect.get(api, 'loadCatalogMessages') : undefined;
  if (typeof load !== 'function') throw new Error('Missing real injected catalog loader');
  return {
    port,
    connect,
    fetch,
    replies,
    disconnects,
    deadlines,
    load(profile: 'content' | 'content-shim'): Promise<unknown> {
      const pending = Promise.resolve().then(() => Reflect.apply(load, undefined, ['en', profile]));
      void pending.catch(() => {});
      return pending;
    },
  };
}

it.each(['production', 'test-e2e', 'release'])(
  'loads real content and shim catalogs through the injected %s IIFE',
  async (mode) => {
    const shimDefines = contentRuntimeDefines(mode);
    expect(shimDefines['import.meta.env.DEV']).toBe('false');
    expect(shimDefines['process.env.NODE_ENV']).toBe(
      JSON.stringify(mode === 'release' ? 'production' : 'development')
    );
    expect(shimDefines).not.toHaveProperty('__SNIPTALE_CONTENT_RUNTIME_BUILD_ID__');
    expect(contentRuntimeDefines(mode, 'catalog-proof').__SNIPTALE_CONTENT_RUNTIME_BUILD_ID__).toBe(
      '"catalog-proof"'
    );
    for (const profile of ['content', 'content-shim'] as const) {
      const client = await injectedCatalogClient(mode);
      const pending = client.load(profile);
      await Promise.resolve();
      for (const reply of client.replies)
        reply({ locale: 'en', profile, messages: { 'content.ready': 'Ready' } });
      await expect(pending).resolves.toEqual({ 'content.ready': 'Ready' });
      expect(client.connect).toHaveBeenCalledExactlyOnceWith({ name: 'sniptale:i18n-catalog:v1' });
      expect(client.port.postMessage).toHaveBeenCalledExactlyOnceWith({ locale: 'en', profile });
      expect(client.fetch).not.toHaveBeenCalled();
      expect(client.port.disconnect).toHaveBeenCalledOnce();
      expect(client.replies.size).toBe(0);
      expect(client.disconnects.size).toBe(0);
      expect(client.deadlines.size).toBe(0);
    }
  }
);

it.each(['reply', 'timeout'] as const)(
  'retains packaged catalog %s refusal and the ten-second request budget',
  async (failure) => {
    const client = await injectedCatalogClient('test-e2e');
    const pending = client.load('content');
    await Promise.resolve();
    expect([...client.deadlines.values()].map((deadline) => deadline.delay)).toEqual([10_000]);
    const rejected = expect(pending).rejects.toThrow(
      failure === 'reply'
        ? 'Invalid translation catalog reply'
        : 'Translation catalog request timed out'
    );
    if (failure === 'reply')
      for (const reply of client.replies) reply({ error: 'catalog-unavailable' });
    else for (const deadline of [...client.deadlines.values()]) deadline.callback();
    await rejected;
    expect(client.port.disconnect).toHaveBeenCalledOnce();
    expect(client.replies.size).toBe(0);
    expect(client.deadlines.size).toBe(0);
  }
);

it('derives every extension build target from the manifest Chrome baseline', () => {
  expect(getChromeBuildTarget({ minimum_chrome_version: '148' })).toBe('chrome148');
  expect(CHROME_BUILD_TARGET).toBe('chrome148');

  const viteSource = fs.readFileSync('apps/extension/vite.config.ts', 'utf8');
  const injectedSource = fs.readFileSync('apps/extension/build/injected-build.ts', 'utf8');
  expect(viteSource).toContain('target: CHROME_BUILD_TARGET');
  expect(injectedSource.match(/target: \[CHROME_BUILD_TARGET\]/gu)).toHaveLength(2);
  expect(`${viteSource}\n${injectedSource}`).not.toMatch(/target:\s*\[?['"]chrome\d+/u);
});

it.each([undefined, 148, '', '148.0', 'chrome148'])(
  'rejects invalid manifest Chrome baseline %j',
  (minimumChromeVersion) => {
    expect(() => getChromeBuildTarget({ minimum_chrome_version: minimumChromeVersion })).toThrow(
      'minimum_chrome_version must be an integer'
    );
  }
);

it('forces tracing off for release builds even when the environment requests tracing', () => {
  expect(isTraceMessagesEnabledForMode('release', { VITE_TRACE_MESSAGES: 'true' })).toBe(false);
  expect(getTraceWsUrlForMode('release')).toBe('about:blank');
});

it('keeps tracing opt-in for non-release builds', () => {
  expect(isTraceMessagesEnabledForMode('development', { VITE_TRACE_MESSAGES: 'true' })).toBe(true);
  expect(isTraceMessagesEnabledForMode('development', { VITE_TRACE_MESSAGES: 'false' })).toBe(
    false
  );
  expect(getTraceWsUrlForMode('development')).toBe('ws://localhost');
});

it('emits build sourcemaps only for explicit diagnostic modes', () => {
  expect(shouldEmitBuildSourcemaps('production')).toBe(false);
  expect(shouldEmitBuildSourcemaps('release')).toBe(false);
  expect(shouldEmitBuildSourcemaps('test-e2e')).toBe(true);
  expect(shouldEmitBuildSourcemaps('security-e2e')).toBe(true);
  expect(shouldEmitBuildSourcemaps('development')).toBe(true);
});

it('uses a deterministic content runtime build id for release bundles', () => {
  expect(createContentRuntimeBuildId('release', '0.1.0')).toBe('release-0.1.0');
  expect(createContentRuntimeBuildId('release', '0.1.0')).toBe(
    createContentRuntimeBuildId('release', '0.1.0')
  );
  expect(createContentRuntimeBuildId('release', '0.7.1')).toBe('release-0.7.1');
  expect(createContentRuntimeBuildId('development')).toMatch(/^development-[a-z0-9]+$/u);
});

it('requires the extension version for release content runtime build ids', () => {
  expect(() => createContentRuntimeBuildId('release')).toThrow(/requires an extension version/u);
});

it('preserves every named color, its order, and the searchable catalog projection', () => {
  const colors = runInNewContext(
    `${createCompactColorCatalogSource().replace('export const ', 'const ')}; colornames;`
  );
  expect(colors).toEqual(colornames);
  expect(createNamedCatalog(colors)).toEqual(createNamedCatalog(colornames));
});

it('reduces injected catalog bytes without additional imports or lost Unicode', async () => {
  const options = {
    stdin: {
      contents: "export { colornames } from 'color-name-list';",
      resolveDir: process.cwd(),
    },
    write: false,
    bundle: true,
    charset: 'utf8' as const,
    format: 'iife' as const,
    globalName: 'catalogProof',
    minify: true,
    metafile: true,
    target: CHROME_BUILD_TARGET,
  };
  const [original, compact] = await Promise.all([
    buildEsbuild(options),
    buildEsbuild({ ...options, plugins: [esbuildCompactColorCatalog()] }),
  ]);
  expect(compact.outputFiles[0].contents.length).toBeLessThan(
    original.outputFiles[0].contents.length * 0.8
  );
  expect(runInNewContext(`${compact.outputFiles[0].text}; catalogProof.colornames;`)).toEqual(
    colornames
  );
  expect(compact.outputFiles[0].text).toContain('À l’Orange');
  expect(Object.values(compact.metafile.outputs).flatMap((output) => output.imports)).toEqual([]);
});

it('uses the same compact catalog and UTF-8 in page bundles', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sniptale-color-catalog-'));
  try {
    const entry = path.join(directory, 'entry.js');
    fs.writeFileSync(
      entry,
      `export { colornames } from ${JSON.stringify(path.resolve('node_modules/color-name-list/dist/colornames.esm.js'))};`
    );
    const result = await buildVite({
      configFile: false,
      logLevel: 'silent',
      plugins: [compactColorCatalog()],
      build: {
        write: false,
        rollupOptions: {
          input: entry,
          preserveEntrySignatures: 'strict',
          output: {
            charset: 'utf8',
            format: 'iife',
            name: 'catalogProof',
          },
        },
      },
    });
    if (Array.isArray(result) || !('output' in result)) throw new Error('Expected one bundle');
    const chunk = result.output.find((output) => output.type === 'chunk');
    if (!chunk) throw new Error('Expected the catalog chunk');
    expect(runInNewContext(`${chunk.code}; catalogProof.colornames;`)).toEqual(colornames);
    expect(chunk.code).toContain('À l’Orange');
    expect(chunk.imports).toEqual([]);
    expect(chunk.dynamicImports).toEqual([]);
    expect(Buffer.byteLength(chunk.code)).toBeLessThan(
      fs.statSync(path.resolve('node_modules/color-name-list/dist/colornames.esm.js')).size * 0.8
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('limits the color transform to its installed dependency module', () => {
  const plugin = compactColorCatalog();
  if (typeof plugin.transform !== 'function') throw new Error('Expected the transform hook');
  const id = path.resolve('node_modules/color-name-list/dist/colornames.esm.js');
  const transform = (moduleId: string) =>
    Reflect.apply(plugin.transform, undefined, ['', moduleId]);
  expect(transform(id)).toBe(createCompactColorCatalogSource());
  expect(transform(id.replaceAll('/', '\\'))).toBe(createCompactColorCatalogSource());
  expect(transform(path.resolve('apps/extension/src/unrelated.js'))).toBeUndefined();
});

it('keeps UTF-8 explicit in the page and injected build configurations', () => {
  const viteSource = fs.readFileSync('apps/extension/vite.config.ts', 'utf8');
  const injectedSource = fs.readFileSync('apps/extension/build/injected-build.ts', 'utf8');
  expect(viteSource).toContain("charset: 'utf8'");
  expect(viteSource).toContain('asciiOnly: false');
  expect(injectedSource.match(/charset: 'utf8'/gu)).toHaveLength(2);
});

it('returns eager initialization completion from the injected script evaluation', async () => {
  const result = await buildEsbuild({
    stdin: {
      contents:
        'export const contentRuntimePreparation = new Promise(resolve => {' +
        'globalThis.finishPreparation = resolve; });',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: CONTENT_RUNTIME_GLOBAL_NAME,
    footer: { js: CONTENT_RUNTIME_EXECUTION_FOOTER },
    target: CHROME_BUILD_TARGET,
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('Expected the injected script');
  const context = {};
  const completion = runInNewContext(output.text, context);
  expect(typeof completion.then).toBe('function');
  let settled = false;
  void completion.then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  const finish = Reflect.get(context, 'finishPreparation');
  if (typeof finish !== 'function') throw new Error('Expected the preparation control');
  finish();
  await completion;
  expect(settled).toBe(true);
});
