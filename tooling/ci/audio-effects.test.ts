import { beforeAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { posix } from 'node:path';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  audioEffects,
  generateAudioEffectAssets,
  bundleAudioProcessingWorklet,
} from '../../apps/extension/build/audio-effects';

let generated: Awaited<ReturnType<typeof generateAudioEffectAssets>>;
beforeAll(async () => {
  generated = await generateAudioEffectAssets();
});
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

it('emits every pinned module and exact metadata identity', async () => {
  expect(generated.catalog.modules.map((module) => module.kind).sort()).toEqual([
    'compressor',
    'delay',
    'eq',
    'highpass',
    'limiter',
    'lowpass',
    'reverb',
    'saturation',
  ]);
  for (const module of generated.catalog.modules) {
    const bytes = generated.assets.get(`audio-effects/faust/${module.kind}.wasm`)!;
    expect(sha(bytes)).toBe(module.processor.sha256);
    expect(WebAssembly.validate(bytes)).toBe(true);
    expect(module.latencyFrames).toBe(module.kind === 'limiter' ? 480 : 0);
  }
  for (const asset of generated.catalog.assets) {
    const bytes = generated.assets.get(asset.path)!;
    expect(bytes.byteLength).toBe(asset.byteLength);
    expect(sha(bytes)).toBe(asset.sha256);
  }
});

it('excludes compiler and browser UI loaders from fixed runtime', () => {
  const runtime = new TextDecoder().decode(generated.assets.get('audio-effects/faust-runtime.mjs'));
  expect(runtime).not.toMatch(/libfaust|FaustCompiler|import\s*\(/u);
  expect([...generated.assets.keys()]).not.toContain('libfaust-wasm.data');
  const pitch = new TextDecoder().decode(
    generated.assets.get('audio-effects/signalsmith-runtime.mjs')
  );
  expect(pitch).not.toContain('function registerWorkletProcessor');
  expect(pitch).toContain('export default SignalsmithStretch');
});

it('keeps the current RNNoise sync model identity and its declared latency', () => {
  expect(generated.catalog.denoise.processor.version).toBe('rnnoise-wasm-0.2.1.sync');
  expect(generated.catalog.denoise.coreCommit).toBe('372f7b4b76cde4ca1ec4605353dd17898a99de38');
  expect(generated.catalog.denoise.latencyFrames).toBe(960);
  expect(generated.catalog.denoise.frameSize).toBe(480);
  expect(sha(generated.assets.get('audio-effects/rnnoise.wasm')!)).toBe(
    generated.catalog.denoise.processor.sha256
  );
  const runtime = new TextDecoder().decode(generated.assets.get('audio-effects/rnnoise.mjs'));
  expect(runtime).not.toMatch(/data:application\/(?:octet-stream|wasm);base64,[A-Za-z0-9+/=]{64}/u);
  expect(runtime).toContain('Module["instantiateWasm"]');
});

it('includes runtime, embedded model and function license notices', () => {
  for (const name of [
    'Faust-LGPL-2.1.txt',
    'Faust-library-notices.txt',
    'RNNoise-BSD-3-Clause.txt',
    'Jitsi-Apache-2.0.txt',
    'Signalsmith-MIT.txt',
    'STK.txt',
    'GPL-3.0.txt',
  ]) {
    expect(generated.assets.get(`audio-effects/LICENSES/${name}`)?.byteLength).toBeGreaterThan(100);
  }
  expect(
    new TextDecoder().decode(
      generated.assets.get('audio-effects/LICENSES/Faust-library-notices.txt')
    )
  ).toContain('EXCEPTION TO THE LGPL LICENSE');
});

it('rejects malformed or drifted input before emitting assets', async () => {
  const source: unknown = JSON.parse(
    await readFile(
      new URL('../../apps/extension/build/audio-effects/pins.json', import.meta.url),
      'utf8'
    )
  );
  await expect(generateAudioEffectAssets(null)).rejects.toThrow();
  await expect(generateAudioEffectAssets({ version: 2 })).rejects.toThrow();
  // The typed parse result is obtained through the same JSON boundary as the production call.
  const { z } = await import('zod');
  const record = z
    .object({ sources: z.record(z.string(), z.string()) })
    .passthrough()
    .parse(source);
  await expect(
    generateAudioEffectAssets({
      ...record,
      sources: { ...record.sources, 'eq.dsp': '0'.repeat(64) },
    })
  ).rejects.toThrow('digest differs');
});

it('keeps fixture access absent from production and runtime imports local', async () => {
  const plugin = audioEffects();
  if (typeof plugin.resolveId !== 'function' || typeof plugin.load !== 'function')
    throw new Error('Missing fixed audio plugin hooks.');
  const fixture: unknown = Reflect.apply(plugin.resolveId, undefined, [
    'sniptale:audio-test-assets',
  ]);
  expect(fixture).toBeNull();
  const direct: unknown = await Reflect.apply(plugin.load, undefined, [
    '\0fixed-audio-test-assets',
  ]);
  expect(direct).toBeNull();
  for (const [id, path] of [
    ['faust', 'faust-runtime.mjs'],
    ['rnnoise', 'rnnoise.mjs'],
    ['pitch', 'signalsmith-runtime.mjs'],
  ]) {
    const resolved: unknown = Reflect.apply(plugin.resolveId, undefined, [
      `sniptale:audio-runtime/${id}`,
    ]);
    expect(resolved).toEqual({ id: `/audio-effects/${path}`, external: true });
  }
});

it('bundles the fixed production Worklet with its complete watched source closure', async () => {
  const result = await bundleAudioProcessingWorklet();
  const source = new TextDecoder().decode(result.bytes);
  expect(source).toContain('sniptale-audio-processing-v1');
  expect(source).not.toMatch(/libfaust|FaustCompiler|new Function|eval\s*\(/u);
  for (const file of [
    'worklet.ts',
    'prepare.ts',
    'assets.ts',
    'kernel.ts',
    'catalog.generated.json',
  ])
    expect(result.inputs.some((input) => input.endsWith(`/effects/${file}`))).toBe(true);
  expect(source).toContain('/audio-effects/rnnoise.mjs');
});

it('keeps fixed audio runtime URLs outside Vite asset globs and filesystem URL rewriting', async () => {
  const { createServer } = await import('vite');
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    logLevel: 'silent',
    cacheDir: '.tmp/audio-effects-goal/vite-url-proof-cache',
    // This guard transforms three fixed modules; dependency discovery is outside its scope.
    optimizeDeps: { noDiscovery: true, entries: [] },
    plugins: [audioEffects({ prepareOnStart: false })],
    server: { middlewareMode: true, watch: null },
  });
  try {
    for (const path of [
      'apps/extension/src/features/video/audio/effects/worklet-node.ts',
      'apps/extension/src/workflows/video-review/audio-clip-processing.ts',
      'apps/extension/src/features/video/audio/effects/browser-assets.ts',
    ]) {
      const result = await server.transformRequest('/' + path);
      expect(result?.code, path).toBeTruthy();
      expect(result!.code, path).not.toContain('__vite_glob_');
      expect(result!.code, path).not.toContain('/@fs/audio-effects/');
    }
  } finally {
    await server.close();
  }
});

it('ships the selected Faust corresponding source and reproduces the exact runtime without the compiler', async () => {
  const bytes = generated.assets.get('audio-effects/SOURCES/faust-runtime.json');
  expect(bytes).toBeDefined();
  const raw: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const source = z
    .strictObject({
      package: z.literal('@grame/faustwasm'),
      version: z.literal('0.20.2'),
      integrity: z.string().startsWith('sha512-'),
      esbuildVersion: z.string(),
      entry: z.string(),
      files: z.record(z.string(), z.string()),
    })
    .parse(raw);
  expect(source.files['FaustWebAudioDsp.ts']).toContain('FaustMonoWebAudioDsp');
  expect(source.files['FaustWasmInstantiator.ts']).toBeDefined();
  expect(Object.keys(source.files)).not.toContain('FaustCompiler.ts');
  expect(Object.keys(source.files)).not.toContain('LibFaust.ts');
  expect(
    Object.keys(source.files).every((file) =>
      file
        .split('/')
        .every((part) => /^[A-Za-z0-9_.-]+$/.test(part) && part !== '.' && part !== '..')
    )
  ).toBe(true);
  const rebuilt = await build({
    stdin: { contents: source.entry },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    write: false,
    plugins: [
      {
        name: 'fixed-faust-source',
        setup(context) {
          context.onResolve({ filter: /^faust-source:/ }, (args) => ({
            path: args.path.slice('faust-source:'.length),
            namespace: 'fixed-faust',
          }));
          context.onResolve({ filter: /^\./, namespace: 'fixed-faust' }, (args) => {
            const path = posix.join(posix.dirname(args.importer), args.path);
            return { path: path.endsWith('.ts') ? path : `${path}.ts`, namespace: 'fixed-faust' };
          });
          context.onLoad({ filter: /.*/, namespace: 'fixed-faust' }, (args) => {
            const contents = source.files[args.path];
            if (contents === undefined) throw new Error('Incomplete corresponding source.');
            return { contents, loader: 'ts' };
          });
        },
      },
    ],
  });
  expect(rebuilt.outputFiles[0]?.contents).toEqual(
    generated.assets.get('audio-effects/faust-runtime.mjs')
  );
  const recipe = new TextDecoder().decode(
    generated.assets.get('audio-effects/SOURCES/REBUILD.txt')
  );
  expect(recipe).toContain(source.esbuildVersion);
  expect(recipe).toContain('faust-runtime.json');
  expect(generated.assets.get('audio-effects/SOURCES/eq.dsp')).toBeDefined();
});
