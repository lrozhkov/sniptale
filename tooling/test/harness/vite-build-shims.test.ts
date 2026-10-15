import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { build } from 'esbuild';
import {
  createReleaseSafeDependencyAliasPlugin,
  createZodRuntimeFallbackPlugin,
  transformZodCompiler,
} from '../../../apps/extension/build/injected-build-support';
import { verifyDynamicCodeUsage } from '../../release/artifact-security/artifact-security-dynamic.mjs';

import { expect, it } from 'vitest';

const RELEASE_BUILD_SHIMS = [
  'tooling/build/shims/readable-stream-browser-empty.cjs',
  'tooling/build/shims/set-immediate-function-only.cjs',
  'tooling/build/shims/zod-jitless.ts',
];

function collectGitVisibleFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
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

it('pins the Zod compiler rewrite for both build adapters and rejects source drift', () => {
  const id = path.resolve('node_modules/zod/v4/core/compile.js');
  const source = readFileSync(id, 'utf8');
  const plugin = createZodRuntimeFallbackPlugin();
  if (typeof plugin.transform !== 'function') throw new Error('Expected a transform hook');
  expect(Reflect.apply(plugin.transform, undefined, [source, id])).toBe(
    transformZodCompiler(source, id)
  );
  expect(() => transformZodCompiler(`${source}\n`, id)).toThrow('Zod compiler source changed');
  expect(transformZodCompiler(source, '/unrelated/compile.js')).toBeNull();
  expect(() => verifyDynamicCodeUsage('upstream.js', `z.config({jitless:true});${source}`)).toThrow(
    'aliased dynamic code execution'
  );
});

it('bundles Zod parsing and typed compilation fallback without dynamic execution', async () => {
  const result = await build({
    stdin: {
      contents: `import { z } from 'zod';
        const schema = z.string();
        let strictRefused = false;
        try { z.compile(schema, { strict: true }); }
        catch (error) { strictRefused = error instanceof z.ZodCompileUnsupportedError; }
        globalThis.result = { valid: schema.safeParse('ok').success,
          invalid: schema.safeParse(3).success, fallback: z.compile(schema) === schema,
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
    fallback: true,
    strictRefused: true,
    withParser: 'function',
  });
});
