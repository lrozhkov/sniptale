import { readFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';

import autoprefixer from 'autoprefixer';
import type { Plugin as EsbuildPlugin } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

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

export function collectWebAccessibleResources(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('web_accessible_resources' in value)) {
    return [];
  }
  const entries = (value as { web_accessible_resources?: Array<{ resources?: unknown }> })
    .web_accessible_resources;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry) =>
    Array.isArray(entry.resources)
      ? entry.resources.filter((resource): resource is string => typeof resource === 'string')
      : []
  );
}

export function assertInjectedBundlesAreNotWebAccessible(resources: string[]): void {
  const forbiddenResources = resources.filter(
    (resource) =>
      resource.includes('contentRuntime') ||
      resource.includes('contentRuntimeShim') ||
      resource.includes('webSnapshotInjectedRunner') ||
      resource.includes('webSnapshotInjectedLoader')
  );
  if (forbiddenResources.length > 0) {
    throw new Error(
      `Injected runtime bundles must stay out of web_accessible_resources: ${forbiddenResources.join(
        ', '
      )}`
    );
  }
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

async function buildInlineCssText(filePath: string, tailwindConfigPath: string): Promise<string> {
  return (
    await postcss([tailwindcss(tailwindConfigPath), autoprefixer()]).process(
      await inlineCssImports(filePath),
      { from: filePath }
    )
  ).css;
}

export function createInlineCssTextPlugin(
  appRoot: string,
  tailwindConfigPath: string
): EsbuildPlugin {
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
        contents: `export default ${JSON.stringify(
          await buildInlineCssText(args.path, tailwindConfigPath)
        )};`,
        loader: 'js',
      }));
    },
  };
}
