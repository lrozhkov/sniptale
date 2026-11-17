import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve as resolvePath } from 'node:path';

import type { Plugin as EsbuildPlugin } from 'esbuild';
import postcss from 'postcss';
import type { Plugin } from 'vite';

const ZOD_COMPILER_PATH = /\/node_modules\/zod\/v4\/core\/(?:compile|doc)\.js$/;
const ZOD_COMPILER_SHA256 = '53fcf24821f50ecf42492ab7101abe8a50ead8286a53567d71648fe5ca346b99';
const ZOD_DOCUMENT_SHA256 = 'be4c1b1a1ad247cc70f360a572060edd7e0cea24252c3a319f33d247899c5643';

/** Keep Zod's typed runtime fallback without retaining an executable AOT constructor. */
export function transformZodCompiler(source: string, id: string): string | null {
  if (!ZOD_COMPILER_PATH.test(id.replaceAll('\\', '/'))) return null;
  const isDocument = id.replaceAll('\\', '/').endsWith('/doc.js');
  const declaration = 'const F = Function;';
  if (
    createHash('sha256').update(source).digest('hex') !==
      (isDocument ? ZOD_DOCUMENT_SHA256 : ZOD_COMPILER_SHA256) ||
    source.split(declaration).length !== 2
  ) {
    throw new Error('Zod compiler source changed; review the extension runtime fallback.');
  }
  return source.replace(
    declaration,
    isDocument
      ? 'const F = class { constructor() { ' +
          'throw new Error("The extension does not compile Zod documents."); } };'
      : 'const F = class { constructor() { ' +
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

/** Keep the fixed effect sandbox worker inside its blob-only CSP. */
export function createBlobOnlyInlineWorkerPlugin(): Plugin {
  return {
    name: 'sniptale:blob-only-effect-worker',
    apply: 'build',
    enforce: 'post',
    transform(source, id) {
      if (
        !id
          .replaceAll('\\', '/')
          .endsWith('/apps/extension/src/effect-runtime-sandbox/worker/index.ts?worker&inline')
      )
        return null;
      const firstLineEnd = source.indexOf('\n');
      const declaration = source.slice(0, firstLineEnd).trimEnd();
      const wrapper = source.slice(firstLineEnd);
      if (
        !declaration.startsWith('const jsContent = ') ||
        !declaration.endsWith(';') ||
        !wrapper.includes('export default function WorkerWrapper(options)') ||
        wrapper.includes('type: "module"')
      )
        throw new Error('Fixed effect worker wrapper changed; review its blob-only build adapter.');
      // Worker construction captures the local script before the URL is revoked. There is
      // no data-URL retry: preserve the original failure under the existing sandbox CSP.
      return {
        code: `${declaration}
        const blob = new Blob([jsContent], { type: 'text/javascript;charset=utf-8' });
        export default function WorkerWrapper(options) {
          const url = URL.createObjectURL(blob);
          try { return new Worker(url, { name: options?.name }); }
          finally { URL.revokeObjectURL(url); }
        }`,
        map: { mappings: '' },
      };
    },
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
      build.onLoad(
        { filter: /[\\/]zod[\\/]v4[\\/]core[\\/](?:compile|doc)\.js$/ },
        async (args) => ({
          contents: transformZodCompiler(await readFile(args.path, 'utf8'), args.path) ?? undefined,
          loader: 'js',
        })
      );
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

/** Reject full project admission dependencies from the page content runtime. */
export function assertContentRuntimeMessagingInputsAreCompact(
  inputs: Record<string, unknown>
): void {
  const forbiddenInputs = Object.keys(inputs).filter((input) => {
    const path = input.replaceAll('\\', '/');
    return (
      /(?:^|\/)features\/video\/project\/validation\/(?:index|root)\.ts$/u.test(path) ||
      path.endsWith('/transition/gl-catalog.generated.json') ||
      path.endsWith('/animation-template/lottie-schema.generated.js')
    );
  });
  if (forbiddenInputs.length === 0) return;
  throw new Error(
    `Content runtime must not include full video project admission dependencies: ${forbiddenInputs.join(', ')}`
  );
}

/** Keep authored catalogs and all-language projections out of injected startup JavaScript. */
export function assertInjectedI18nInputsAreScoped(inputs: Record<string, unknown>): void {
  const forbiddenInputs = Object.keys(inputs).filter((input) => {
    const path = input.replaceAll('\\', '/');
    return (
      isAuthoredI18nCatalogInput(path) ||
      ['sniptale-i18n:popup', 'sniptale-i18n:popup-shell', 'sniptale-i18n:content-shim'].includes(
        path
      )
    );
  });
  if (forbiddenInputs.length === 0) return;
  const description =
    'Injected startup JavaScript must not import authored catalogs or all-language projections';
  throw new Error(`${description}: ${forbiddenInputs.join(', ')}`);
}

/** Identify authored catalog modules in either bundler's normalized input paths. */
export function isAuthoredI18nCatalogInput(input: string): boolean {
  const path = input.replaceAll('\\', '/').split('?')[0] ?? '';
  const [source, platform, i18n, catalogs, fileName] = path.split('/').slice(-5);
  return (
    source === 'src' &&
    platform === 'platform' &&
    i18n === 'i18n' &&
    catalogs === 'catalogs' &&
    fileName?.endsWith('.json') === true
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
  const { default: tailwindcss } = await import('@tailwindcss/postcss');
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
