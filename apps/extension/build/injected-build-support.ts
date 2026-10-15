import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve as resolvePath } from 'node:path';

import tailwindcss from '@tailwindcss/postcss';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import postcss from 'postcss';
import type { Plugin } from 'vite';

const ZOD_COMPILER_PATH = /\/node_modules\/zod\/v4\/core\/compile\.js$/;
const ZOD_COMPILER_SHA256 = '53fcf24821f50ecf42492ab7101abe8a50ead8286a53567d71648fe5ca346b99';

/** Keep Zod's typed runtime fallback without retaining an executable AOT constructor. */
export function transformZodCompiler(source: string, id: string): string | null {
  if (!ZOD_COMPILER_PATH.test(id.replaceAll('\\', '/'))) return null;
  const declaration = 'const F = Function;';
  if (
    createHash('sha256').update(source).digest('hex') !== ZOD_COMPILER_SHA256 ||
    source.split(declaration).length !== 2
  ) {
    throw new Error('Zod compiler source changed; review the extension runtime fallback.');
  }
  return source.replace(
    declaration,
    'const F = class { constructor() { ' +
      'throw new ZodCompileUnsupportedError("dynamic compilation in the extension"); } };'
  );
}

/** Apply the same dependency policy to main Vite modules and injected esbuild bundles. */
export function createZodRuntimeFallbackPlugin(): Plugin {
  return {
    name: 'sniptale:zod-runtime-fallback',
    enforce: 'pre',
    transform: transformZodCompiler,
  };
}

export function createReleaseSafeDependencyAliasPlugin(repositoryRoot: string): EsbuildPlugin {
  const aliases = new Map([
    ['jszip', join(repositoryRoot, 'node_modules/jszip/lib/index.js')],
    [
      'readable-stream',
      join(repositoryRoot, 'tooling/build/shims/readable-stream-browser-empty.cjs'),
    ],
    ['setimmediate', join(repositoryRoot, 'tooling/build/shims/set-immediate-function-only.cjs')],
    ['zod', join(repositoryRoot, 'tooling/build/shims/zod-jitless.ts')],
  ]);

  return {
    name: 'sniptale:release-safe-dependency-aliases',
    setup(build) {
      build.onLoad({ filter: /[\\/]zod[\\/]v4[\\/]core[\\/]compile\.js$/ }, async (args) => ({
        contents: transformZodCompiler(await readFile(args.path, 'utf8'), args.path) ?? undefined,
        loader: 'js',
      }));
      build.onResolve({ filter: /^(jszip|readable-stream|setimmediate|zod)$/ }, (args) => ({
        path: aliases.get(args.path) ?? args.path,
      }));
    },
  };
}

export function getReleaseDrop(mode: string): Array<'console' | 'debugger'> {
  return mode === 'release' ? ['console', 'debugger'] : [];
}

export function resolveOutDir(root: string, outDir: string): string {
  return resolvePath(root, outDir);
}

export function assertBundleHasNoImports(label: string, imports: Array<{ path: string }>): void {
  if (imports.length === 0) return;
  throw new Error(
    `${label} bundle must be self-contained; unresolved imports: ${imports
      .map((importEntry) => importEntry.path)
      .join(', ')}`
  );
}

async function inlineCssImports(filePath: string, visited = new Set<string>()): Promise<string> {
  if (visited.has(filePath)) return '';
  visited.add(filePath);
  const source = await readFile(filePath, 'utf8');
  const importPattern = /@import\s+(?:url\()?['"]([^'")]+)['"]\)?\s*;/g;
  let cursor = 0;
  let css = '';
  for (const match of source.matchAll(importPattern)) {
    css += source.slice(cursor, match.index);
    const importPath = match[1] ?? '';
    css += /^(?:https?:|data:)/u.test(importPath)
      ? match[0]
      : await inlineCssImports(resolvePath(dirname(filePath), importPath), visited);
    cursor = (match.index ?? 0) + match[0].length;
  }
  return css + source.slice(cursor);
}

async function buildInlineCssText(filePath: string): Promise<string> {
  return (
    await postcss([tailwindcss()]).process(await inlineCssImports(filePath), { from: filePath })
  ).css;
}

export function createInlineCssTextPlugin(appRoot: string): EsbuildPlugin {
  return {
    name: 'sniptale:inline-css-text',
    setup(build) {
      build.onResolve({ filter: /\?inline$/ }, async (args) => {
        const resolved = await build.resolve(args.path.replace(/\?inline$/u, ''), {
          kind: args.kind,
          resolveDir: args.resolveDir || appRoot,
        });
        if (resolved.errors.length > 0) return { errors: resolved.errors };
        return { namespace: 'sniptale-inline-css', path: resolved.path };
      });
      build.onLoad({ filter: /\.css$/, namespace: 'sniptale-inline-css' }, async (args) => ({
        contents: `export default ${JSON.stringify(await buildInlineCssText(args.path))};`,
        loader: 'js',
      }));
    },
  };
}
