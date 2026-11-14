import { createReleaseSafeDependencyAliasPlugin } from './injected-build-support.ts';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import { z } from 'zod';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);
const INPUT = fileURLToPath(new URL('./audio-effects/', import.meta.url));
const CATALOG = fileURLToPath(
  new URL(
    '../../../apps/extension/src/features/video/audio/effects/catalog.generated.json',
    import.meta.url
  )
);
const KINDS = [
  'eq',
  'highpass',
  'lowpass',
  'compressor',
  'limiter',
  'delay',
  'reverb',
  'saturation',
] as const;
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const packagePin = z.strictObject({
  version: z.string(),
  integrity: z.string().startsWith('sha512-'),
  files: z.record(z.string(), sha),
  wasmSha256: sha.optional(),
});
const pinSchema = z.strictObject({
  version: z.literal(1),
  compiler: z.literal('2.90.19'),
  compileArgs: z.literal('-I libraries/ -ftz 2'),
  packages: z.strictObject({
    '@grame/faustwasm': packagePin.extend({ version: z.literal('0.20.2') }),
    'signalsmith-stretch': packagePin.extend({ version: z.literal('1.3.2') }),
    '@jitsi/rnnoise-wasm': packagePin.extend({ version: z.literal('0.2.1') }),
  }),
  sources: z.record(z.string(), sha),
  licenses: z.record(z.string(), sha),
});
const sourceMapSchema = z.object({
  sources: z.array(z.string()),
  sourcesContent: z.array(z.string().nullable()),
});
const metadataSchema = z.object({
  inputs: z.literal(2),
  outputs: z.literal(2),
  size: z.number().int().nonnegative(),
  ui: z.array(z.unknown()),
  meta: z.array(z.record(z.string(), z.string())),
});

function containedName(name: string): void {
  if (
    name
      .split('/')
      .some((part) => !/^[A-Za-z0-9_.-]+$/u.test(part) || part === '..' || part === '.')
  )
    throw new Error('Invalid fixed audio input path.');
}
async function readPinned(root: string, name: string, expected: string) {
  containedName(name);
  const bytes = await readFile(join(root, name));
  if (hash(bytes) !== expected) throw new Error(`Fixed audio input digest differs: ${name}`);
  return bytes;
}
function embeddedWasm(source: string, expected: string | undefined) {
  const matches = [
    ...source.matchAll(/data:application\/(?:octet-stream|wasm);base64,([A-Za-z0-9+/=]+)/gu),
  ];
  if (matches.length !== 1 || !expected) throw new Error('Fixed audio WASM identity is missing.');
  const bytes = Buffer.from(matches[0]![1]!, 'base64');
  if (hash(bytes) !== expected) throw new Error('Fixed audio WASM digest differs.');
  return expected;
}

async function faustRuntime(sourceMap: string) {
  const raw: unknown = JSON.parse(sourceMap);
  const map = sourceMapSchema.parse(raw);
  const sources = new Map<string, string>();
  for (let i = 0; i < map.sources.length; i++) {
    const path = map.sources[i]!,
      content = map.sourcesContent[i];
    if (path.startsWith('../../src/') && typeof content === 'string')
      sources.set(path.slice('../../src/'.length), content);
  }
  const selectedSources = new Map<string, string>();
  const entry = [
    "export {default as FaustWasmInstantiator} from 'faust-source:FaustWasmInstantiator.ts';",
    "export {FaustMonoWebAudioDsp} from 'faust-source:FaustWebAudioDsp.ts';",
  ].join('\n');
  const result = await build({
    stdin: { contents: entry },
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
            const contents = sources.get(args.path);
            if (contents === undefined)
              throw new Error(`Missing pinned Faust runtime source: ${args.path}`);
            containedName(args.path);
            selectedSources.set(args.path, contents);
            return { contents, loader: 'ts' };
          });
        },
      },
    ],
  });
  const bytes = result.outputFiles[0]?.contents;
  if (!bytes || /libfaust|FaustCompiler|import\s*\(/u.test(new TextDecoder().decode(bytes)))
    throw new Error('Compiler code entered the fixed Faust runtime.');
  return {
    bytes,
    entry,
    files: Object.fromEntries(
      [...selectedSources].sort(([left], [right]) => left.localeCompare(right))
    ),
  };
}

/** Generates local immutable assets. The compiler is a build input only. */
export async function generateAudioEffectAssets(pinsSource?: unknown) {
  const raw: unknown =
    pinsSource === undefined
      ? JSON.parse(await readFile(join(INPUT, 'pins.json'), 'utf8'))
      : pinsSource;
  const pins = pinSchema.parse(raw);
  if (
    Object.keys(pins.sources).sort().join(',') !==
    KINDS.map((kind) => `${kind}.dsp`)
      .sort()
      .join(',')
  )
    throw new Error('Fixed Faust module inventory differs.');
  const roots = new Map<string, string>();
  for (const [name, pin] of Object.entries(pins.packages)) {
    const root = dirname(
      require.resolve(name === 'signalsmith-stretch' ? name : `${name}/package.json`)
    );
    roots.set(name, root);
    for (const [file, expected] of Object.entries(pin.files))
      await readPinned(root, file, expected);
  }
  const sources = new Map<string, string>();
  for (const [file, expected] of Object.entries(pins.sources))
    sources.set(file, (await readPinned(INPUT, file, expected)).toString('utf8'));
  const assets = new Map<string, Uint8Array>();
  for (const [file, expected] of Object.entries(pins.licenses))
    assets.set(
      `audio-effects/LICENSES/${file}`,
      await readPinned(join(INPUT, 'licenses'), file, expected)
    );
  const faustRoot = roots.get('@grame/faustwasm')!;
  const runtime = await faustRuntime(
    await readFile(join(faustRoot, 'dist/esm/index.js.map'), 'utf8')
  );
  assets.set('audio-effects/faust-runtime.mjs', runtime.bytes);
  assets.set(
    'audio-effects/SOURCES/faust-runtime.json',
    new TextEncoder().encode(
      JSON.stringify(
        {
          package: '@grame/faustwasm',
          version: pins.packages['@grame/faustwasm'].version,
          integrity: pins.packages['@grame/faustwasm'].integrity,
          esbuildVersion,
          entry: runtime.entry,
          files: runtime.files,
        },
        null,
        2
      ) + '\n'
    )
  );
  for (const [file, source] of sources)
    assets.set(`audio-effects/SOURCES/${file}`, new TextEncoder().encode(source));
  assets.set(
    'audio-effects/SOURCES/REBUILD.txt',
    new TextEncoder().encode(
      [
        'Faust runtime corresponding source',
        '',
        'The JSON file contains the selected unmodified runtime source files and entry.',
        'The package version and integrity identify the pinned upstream archive.',
        'The sibling LICENSES directory contains the runtime license and DSP notices.',
        'The DSP files are the authored inputs. The compiler remains a build dependency.',
        'The Sniptale repository generator builds DSP modules with the pinned compiler.',
        '',
        'To rebuild the selected JavaScript runtime:',
        `1. Install Node.js and esbuild@${esbuildVersion} in a separate directory.`,
        '2. Copy faust-runtime.json into that directory.',
        '3. Save the following code as rebuild.mjs and run node rebuild.mjs.',
        '',
        "import { readFile, writeFile } from 'node:fs/promises';",
        "import { posix } from 'node:path';",
        "import { build } from 'esbuild';",
        "const source = JSON.parse(await readFile('faust-runtime.json', 'utf8'));",
        'const result = await build({',
        "  stdin: { contents: source.entry }, bundle: true, format: 'esm',",
        "  platform: 'browser', minify: true, write: false,",
        "  plugins: [{ name: 'fixed-faust-source', setup(context) {",
        '    context.onResolve({ filter: /^faust-source:/ }, args => ({',
        "      path: args.path.slice('faust-source:'.length), namespace: 'fixed-faust' }));",
        "    context.onResolve({ filter: /^\\./, namespace: 'fixed-faust' }, args => {",
        '      const path = posix.join(posix.dirname(args.importer), args.path);',
        "      return { path: path.endsWith('.ts') ? path : path + '.ts', namespace: 'fixed-faust' };",
        '    });',

        "    context.onLoad({ filter: /.*/, namespace: 'fixed-faust' }, args => {",
        '      const contents = source.files[args.path];',
        "      if (contents === undefined) throw new Error('Incomplete source.');",
        "      return { contents, loader: 'ts' };",
        '    });',

        '  } }] });',
        "await writeFile('faust-runtime.mjs', result.outputFiles[0].contents);",
        '',
      ].join('\n')
    )
  );

  assets.set(
    'audio-effects/LICENSES/Faust-LGPL-2.1.txt',
    await readFile(join(faustRoot, 'COPYING.txt'))
  );
  const rnnoise = await readFile(
    join(roots.get('@jitsi/rnnoise-wasm')!, 'dist/rnnoise-sync.js'),
    'utf8'
  );
  const rnnoiseHash = embeddedWasm(rnnoise, pins.packages['@jitsi/rnnoise-wasm'].wasmSha256);
  // The pinned sync factory supports instantiateWasm. Keep its exact binary separate so
  // preparation can compile asynchronously before an AudioWorklet starts processing.
  const embedded = [
    ...rnnoise.matchAll(/data:application\/(?:octet-stream|wasm);base64,([A-Za-z0-9+/=]+)/gu),
  ];
  if (embedded.length !== 1) throw new Error('Fixed RNNoise model boundary differs.');
  assets.set('audio-effects/rnnoise.wasm', Buffer.from(embedded[0]![1]!, 'base64'));
  assets.set(
    'audio-effects/rnnoise.mjs',
    new TextEncoder().encode(rnnoise.replace(embedded[0]![0], 'rnnoise.wasm'))
  );
  assets.set(
    'audio-effects/LICENSES/Jitsi-Apache-2.0.txt',
    await readFile(join(roots.get('@jitsi/rnnoise-wasm')!, 'LICENSE'))
  );
  const signalSource = await readFile(
    join(roots.get('signalsmith-stretch')!, 'SignalsmithStretch.mjs'),
    'utf8'
  );
  const pitchHash = embeddedWasm(signalSource, pins.packages['signalsmith-stretch'].wasmSha256);
  const marker = '\nfunction registerWorkletProcessor(Module, audioNodeKey) {';
  if (signalSource.split(marker).length !== 2)
    throw new Error('Fixed Signalsmith factory boundary differs.');
  assets.set(
    'audio-effects/signalsmith-runtime.mjs',
    new TextEncoder().encode(
      `${signalSource.split(marker)[0]}\nexport default SignalsmithStretch;\n`
    )
  );
  const { instantiateFaustModuleFromFile, LibFaust, FaustCompiler, FaustMonoDspGenerator } =
    await import('@grame/faustwasm/dist/esm/index.js');
  const compiled = await instantiateFaustModuleFromFile(
    join(faustRoot, 'libfaust-wasm/libfaust-wasm.js')
  );
  const library = new LibFaust(compiled);
  if (library.version() !== pins.compiler)
    throw new Error('Pinned Faust compiler version differs.');
  const compiler = new FaustCompiler(library);
  const modules = [];
  for (const kind of KINDS) {
    const generator = new FaustMonoDspGenerator();
    const source = sources.get(`${kind}.dsp`)!;
    if (!(await generator.compile(compiler, `sniptale_${kind}`, source, pins.compileArgs)))
      throw new Error(`Fixed Faust compilation failed: ${kind}`);
    const factory = generator.factory;
    if (!factory?.code || !factory.json) throw new Error(`Fixed Faust output is missing: ${kind}`);
    const parsed: unknown = JSON.parse(factory.json);
    const metadata = metadataSchema.parse(parsed);
    assets.set(`audio-effects/faust/${kind}.wasm`, factory.code);
    assets.set(`audio-effects/faust/${kind}.json`, new TextEncoder().encode(factory.json));
    modules.push({
      kind,
      processor: {
        engine: 'faust',
        version: `faustwasm-${pins.packages['@grame/faustwasm'].version}.faust-${pins.compiler}`,
        sha256: hash(factory.code),
      },
      latencyFrames: kind === 'limiter' ? 480 : 0,
      metadata,
    });
  }
  const mathLibrary = compiled.FS.readFile('/usr/share/faust/maths.lib', { encoding: 'utf8' });
  const exceptionStart = mathLibrary.indexOf('EXCEPTION TO THE LGPL LICENSE');
  const exceptionEnd = mathLibrary.indexOf('*/', exceptionStart);
  if (exceptionStart < 0 || exceptionEnd < 0)
    throw new Error('Pinned Faust library exception is missing.');
  const notices = JSON.stringify(
    modules.map((module) => ({ kind: module.kind, metadata: module.metadata.meta })),
    null,
    2
  );
  assets.set(
    'audio-effects/LICENSES/Faust-library-notices.txt',
    new TextEncoder().encode(`${notices}\n\n${mathLibrary.slice(exceptionStart, exceptionEnd)}\n`)
  );
  const catalog = {
    version: 1,
    sampleRate: 48000,
    quantum: 128,
    modules,
    denoise: {
      processor: { engine: 'rnnoise', version: 'rnnoise-wasm-0.2.1.sync', sha256: rnnoiseHash },
      frameSize: 480,
      latencyFrames: 960,
      coreCommit: '372f7b4b76cde4ca1ec4605353dd17898a99de38',
    },
    pitch: {
      processor: { engine: 'signalsmith', version: 'signalsmith-stretch-1.3.2', sha256: pitchHash },
      inputLatencyFrames: 2880,
      outputLatencyFrames: 2880,
    },
    assets: [...assets].map(([path, bytes]) => ({
      path,
      byteLength: bytes.byteLength,
      sha256: hash(bytes),
    })),
  };
  assets.set(
    'audio-effects/manifest.json',
    new TextEncoder().encode(`${JSON.stringify(catalog, null, 2)}\n`)
  );
  return { catalog, assets };
}

/** The fixed application entry is separate from the manifest it embeds. */
export async function bundleAudioProcessingWorklet() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const entry = fileURLToPath(
    new URL('../../../apps/extension/src/features/video/audio/effects/worklet.ts', import.meta.url)
  );
  const runtimePaths: Record<string, string> = {
    'sniptale:audio-runtime/faust': '/audio-effects/faust-runtime.mjs',
    'sniptale:audio-runtime/rnnoise': '/audio-effects/rnnoise.mjs',
    'sniptale:audio-runtime/pitch': '/audio-effects/signalsmith-runtime.mjs',
  };
  const bundled = await build({
    absWorkingDir: root,
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    metafile: true,
    legalComments: 'none',
    plugins: [
      {
        name: 'fixed-audio-worklet-runtime',
        setup(context) {
          context.onResolve({ filter: /^sniptale:audio-runtime\// }, (args) => {
            const path = runtimePaths[args.path];
            if (!path) throw new Error('Unexpected audio Worklet runtime.');
            return { path, external: true };
          });
        },
      },
      createReleaseSafeDependencyAliasPlugin(root),
    ],
  });
  if (bundled.outputFiles.length !== 1 || !bundled.outputFiles[0])
    throw new Error('Fixed audio Worklet output is missing.');
  const allowed = new Set(Object.values(runtimePaths));
  if (
    Object.values(bundled.metafile.outputs).some((output) =>
      output.imports.some((dependency) => !dependency.external || !allowed.has(dependency.path))
    )
  )
    throw new Error('Unexpected audio Worklet dependency.');
  return {
    bytes: bundled.outputFiles[0].contents,
    inputs: Object.keys(bundled.metafile.inputs).map((path) => resolve(root, path)),
  };
}

/** Production and local preview serve the same generated, pinned bytes. */
export function audioEffects(
  options: { inlineRuntime?: boolean; prepareOnStart?: boolean } = {}
): Plugin {
  let prepared: ReturnType<typeof generateAudioEffectAssets> | undefined;
  const get = () => (prepared ??= generateAudioEffectAssets());
  let worklet: ReturnType<typeof bundleAudioProcessingWorklet> | undefined;
  const workletInputs = new Set<string>();
  const getWorklet = () =>
    (worklet ??= bundleAudioProcessingWorklet().then((result) => {
      for (const input of result.inputs) workletInputs.add(input);
      return result;
    }));
  return {
    name: 'sniptale:audio-effects',
    resolveId(id) {
      if (id === 'sniptale:audio-test-assets' && options.inlineRuntime)
        return '\0fixed-audio-test-assets';
      const paths: Record<string, string> = {
        'sniptale:audio-runtime/faust': 'audio-effects/faust-runtime.mjs',
        'sniptale:audio-runtime/rnnoise': 'audio-effects/rnnoise.mjs',
        'sniptale:audio-runtime/pitch': 'audio-effects/signalsmith-runtime.mjs',
      };
      const path = paths[id];
      if (!path) return null;
      return options.inlineRuntime ? `\0fixed-audio:${path}` : { id: `/${path}`, external: true };
    },
    async load(id) {
      if (id === '\0fixed-audio-test-assets' && options.inlineRuntime) {
        const entries = [...(await get()).assets]
          .filter(([path]) => path.endsWith('.wasm'))
          .map(([path, bytes]) => [path, Buffer.from(bytes).toString('base64')]);
        return [
          `const assets = new Map(${JSON.stringify(entries)});`,
          'export function readAudioFixtureAsset(path) {',
          '  const bytes = assets.get(path);',
          "  if (!bytes) throw new Error('Fixed audio test asset is missing.');",
          "  return Uint8Array.from(Buffer.from(bytes, 'base64'));",
          '}',
        ].join('\n');
      }
      if (!id.startsWith('\0fixed-audio:')) return null;
      const bytes = (await get()).assets.get(id.slice('\0fixed-audio:'.length));
      if (!bytes) throw new Error('Fixed audio runtime asset is missing.');
      return new TextDecoder().decode(bytes);
    },
    async buildStart() {
      if (options.prepareOnStart === false) return;
      const { catalog } = await get();
      const source = `${JSON.stringify(catalog, null, 2)}\n`;
      const current = await readFile(CATALOG, 'utf8').catch(() => null);
      if (source !== current) await writeFile(CATALOG, source);
    },
    async generateBundle() {
      const { assets } = await get();
      const compiled = await getWorklet();
      for (const input of compiled.inputs) this.addWatchFile(input);
      this.emitFile({
        type: 'asset',
        fileName: 'audio-effects/worklet.mjs',
        source: compiled.bytes,
      });
      for (const [fileName, source] of assets) this.emitFile({ type: 'asset', fileName, source });
    },
    handleHotUpdate(context) {
      if (!workletInputs.has(context.file)) return;
      worklet = undefined;
      context.server.ws.send({ type: 'full-reload' });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
        if (!path.startsWith('audio-effects/')) {
          next();
          return;
        }
        try {
          const compiled = path === 'audio-effects/worklet.mjs' ? await getWorklet() : undefined;
          if (compiled) server.watcher.add(compiled.inputs);
          const bytes = compiled?.bytes ?? (await get()).assets.get(path);
          if (!bytes) {
            response.statusCode = 404;
            response.end();
            return;
          }
          response.setHeader(
            'Content-Type',
            path.endsWith('.mjs')
              ? 'text/javascript'
              : path.endsWith('.wasm')
                ? 'application/wasm'
                : path.endsWith('.json')
                  ? 'application/json'
                  : 'text/plain'
          );
          response.end(bytes);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
