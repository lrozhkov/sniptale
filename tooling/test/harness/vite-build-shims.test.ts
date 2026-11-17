import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import { build as buildVite } from 'vite';
import {
  createBlobOnlyInlineWorkerPlugin,
  createReleaseSafeDependencyAliasPlugin,
  createZodRuntimeFallbackPlugin,
  transformZodCompiler,
} from '../../../apps/extension/build/injected-build-support';
import { verifyDynamicCodeUsage } from '../../release/artifact-security/artifact-security-dynamic.mjs';

import { expect, it, vi } from 'vitest';

// These dependency-shim proofs do not compile CSS; the production build checks that compiler.
vi.mock('@tailwindcss/postcss', () => ({
  default() {
    throw new Error('Dependency-shim proof must not compile CSS.');
  },
}));

const RELEASE_BUILD_SHIMS = [
  'tooling/build/shims/readable-stream-browser-empty.cjs',
  'tooling/build/shims/set-immediate-function-only.cjs',
  'tooling/build/shims/zod-jitless.ts',
];

let workerLauncher: Promise<string> | undefined;
const workerBuildWarnings: string[] = [];
function buildWorkerLauncher(): Promise<string> {
  return (workerLauncher ??= (async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sniptale-blob-worker-'));
    const workerPath = 'apps/extension/src/effect-runtime-sandbox/worker/index.ts';
    mkdirSync(path.dirname(path.join(root, workerPath)), { recursive: true });
    writeFileSync(path.join(root, workerPath), 'self.onmessage = () => self.postMessage("ready");');
    writeFileSync(
      path.join(root, 'entry.ts'),
      `import WorkerFactory from './${workerPath}?worker&inline'; globalThis.WorkerFactory = WorkerFactory;`
    );
    try {
      const result = await buildVite({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: [createBlobOnlyInlineWorkerPlugin()],
        worker: { format: 'iife' },
        build: {
          sourcemap: true,
          rollupOptions: {
            onwarn(warning) {
              workerBuildWarnings.push(`${warning.code}:${warning.message}`);
            },
          },
          write: false,
          minify: false,
          lib: { entry: path.join(root, 'entry.ts'), formats: ['iife'], name: 'WorkerProof' },
        },
      });
      const output = Array.isArray(result) ? result[0] : result;
      if (!output || !('output' in output))
        throw new Error('Worker proof build output is unavailable.');
      const chunk = output.output.find((file) => file.type === 'chunk');
      if (!chunk || chunk.type !== 'chunk') throw new Error('Worker proof bundle is unavailable.');
      return chunk.code;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  })());
}

it('declares generated worker-wrapper mappings when the build emits sourcemaps', async () => {
  await buildWorkerLauncher();
  expect(
    workerBuildWarnings.filter(
      (warning) =>
        warning.includes('SOURCEMAP_BROKEN') && warning.includes('blob-only-effect-worker')
    )
  ).toEqual([]);
});

it.each([false, true])(
  'keeps the bundled worker on blob URLs and releases the URL when constructor failure is %s',
  async (failure) => {
    const original = new DOMException('Worker resources are unavailable.', 'InvalidStateError');
    const urls: string[] = [];
    const revokeObjectURL = vi.fn();
    const scope = {
      Blob,
      URL: { createObjectURL: vi.fn(() => 'blob:worker-proof'), revokeObjectURL },
      Worker: class {
        addEventListener = vi.fn();
        constructor(url: string) {
          urls.push(url);
          if (failure) throw original;
        }
      },
    };
    const context = vm.createContext({ ...scope, self: scope });
    vm.runInContext(await buildWorkerLauncher(), context);
    if (failure) expect(() => vm.runInContext('new WorkerFactory()', context)).toThrow(original);
    else expect(() => vm.runInContext('new WorkerFactory()', context)).not.toThrow();
    expect(urls).toEqual(['blob:worker-proof']);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:worker-proof');
  }
);

function collectGitVisibleFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', ...RELEASE_BUILD_SHIMS],
    {
      encoding: 'utf8',
    }
  )
    .split(/\r?\n/u)
    .filter(Boolean);
}

it('keeps release build shim inputs visible to git review', () => {
  const gitVisibleFiles = new Set(collectGitVisibleFiles());

  for (const shimPath of RELEASE_BUILD_SHIMS) {
    expect(existsSync(shimPath)).toBe(true);
    expect(gitVisibleFiles.has(shimPath)).toBe(true);
  }
});

it.each(['compile', 'doc'])(
  'pins the Zod %s rewrite for both build adapters and rejects source drift',
  (moduleName) => {
    const id = path.resolve(`node_modules/zod/v4/core/${moduleName}.js`);
    const source = readFileSync(id, 'utf8');
    const plugin = createZodRuntimeFallbackPlugin();
    if (typeof plugin.transform !== 'function') throw new Error('Expected a transform hook');
    expect(Reflect.apply(plugin.transform, undefined, [source, id])).toBe(
      transformZodCompiler(source, id)
    );
    expect(() => transformZodCompiler(`${source}\n`, id)).toThrow('Zod compiler source changed');
    expect(transformZodCompiler(source, '/unrelated/compile.js')).toBeNull();
    expect(transformZodCompiler(source, id.replaceAll('/', '\\'))).toBe(
      transformZodCompiler(source, id)
    );
    expect(() =>
      verifyDynamicCodeUsage('upstream.js', `z.config({jitless:true});${source}`)
    ).toThrow('aliased dynamic code execution');
  }
);

it('bundles Zod parsing and typed compilation fallback without dynamic execution', async () => {
  const result = await build({
    stdin: {
      contents: `import { z } from 'zod';
        const schema = z.string();
        const object = z.object({ name: z.string(), values: z.array(z.number()) });
        let strictRefused = false;
        try { z.compile(schema, { strict: true }); }
        catch (error) { strictRefused = error instanceof z.ZodCompileUnsupportedError; }
        globalThis.result = { valid: schema.safeParse('ok').success,
          invalid: schema.safeParse(3).success, fallback: z.compile(schema) === schema,
          objectValid: object.safeParse({ name: 'ok', values: [1, 2] }).success,
          objectInvalid: object.safeParse({ name: 'ok', values: ['invalid'] }).success,
          strictRefused, withParser: typeof z.withParser };`,
      resolveDir: process.cwd(),
    },
    plugins: [createReleaseSafeDependencyAliasPlugin(process.cwd())],
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
  });
  const output = result.outputFiles[0]!.text;
  expect(() => verifyDynamicCodeUsage('bundle.js', output)).not.toThrow();
  const context = {
    result: undefined,
    Function: () => {
      throw new Error('Dynamic execution attempted');
    },
  };
  vm.runInNewContext(output, context);
  expect(context.result).toEqual({
    valid: true,
    invalid: false,
    objectValid: true,
    objectInvalid: false,
    fallback: true,
    strictRefused: true,
    withParser: 'function',
  });
});

it('refuses direct Zod document compilation before the ambient constructor runs', async () => {
  const result = await build({
    stdin: {
      contents: `import { Doc } from './node_modules/zod/v4/core/doc.js';
        const doc = new Doc(['input']);
        doc.write('return input;');
        try { doc.compile(); }
        catch (error) { globalThis.result = error.message; }`,
      resolveDir: process.cwd(),
    },
    plugins: [createReleaseSafeDependencyAliasPlugin(process.cwd())],
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
  });
  let attempts = 0;
  const context = {
    result: '',
    Function: function blockedDynamicCode() {
      attempts += 1;
      throw new Error('Ambient constructor reached');
    },
  };
  vm.runInNewContext(result.outputFiles[0]!.text, context);
  expect(attempts).toBe(0);
  expect(context.result).toBe('The extension does not compile Zod documents.');
});
