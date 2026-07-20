import { readFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import type { Plugin } from 'vite';
import { build as buildEsbuild } from 'esbuild';
import {
  assertContentRuntimeShimInputsAreCompact,
  assertContentRuntimeShimOutputIsCompact,
} from './injected-build-shim-guard';
import {
  createContentRuntimeBuildId,
  readExtensionManifestVersion,
} from './content-runtime-build-id';
import {
  assertBundleHasNoImports,
  assertInjectedBundlesAreNotWebAccessible,
  collectWebAccessibleResources,
  createInlineCssTextPlugin,
  createReleaseSafeDependencyAliasPlugin,
  getReleaseDrop,
  resolveOutDir,
} from './injected-build-support';

const WEB_SNAPSHOT_INJECTED_RUNNER_ENTRY =
  'apps/extension/src/content/parser/web-snapshot/injected-runner.ts';
const WEB_SNAPSHOT_INJECTED_RUNNER_OUTPUT = 'assets/webSnapshotInjectedRunner.js';
const CONTENT_RUNTIME_ENTRY = 'apps/extension/src/content/index.tsx';
const CONTENT_RUNTIME_OUTPUT = 'assets/contentRuntime.js';
const CONTENT_RUNTIME_SHIM_ENTRY = 'apps/extension/src/content/runtime/shim/index.ts';
const CONTENT_RUNTIME_SHIM_OUTPUT = 'assets/contentRuntimeShim.js';
const TAILWIND_CONFIG_PATH = 'apps/extension/tailwind.config.js';

export function isTraceMessagesEnabledForMode(
  mode: string,
  env: Pick<NodeJS.ProcessEnv, 'VITE_TRACE_MESSAGES'> = process.env
): boolean {
  return mode !== 'release' && env.VITE_TRACE_MESSAGES === 'true';
}

export function getTraceWsUrlForMode(mode: string): string {
  return mode === 'release' ? 'about:blank' : 'ws://localhost';
}

function contentRuntimeDefines(mode: string, buildId: string) {
  return {
    __ENABLE_DESIGN_SYSTEM__: JSON.stringify(mode !== 'release'),
    __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__: JSON.stringify(buildId),
    __SNIPTALE_TRACE_WS_URL__: JSON.stringify(getTraceWsUrlForMode(mode)),
    __TRACE_MESSAGES__: JSON.stringify(isTraceMessagesEnabledForMode(mode)),
    'globalThis.__SNIPTALE_RELEASE_BUILD__': JSON.stringify(mode === 'release'),
    'process.env.NODE_ENV': JSON.stringify(mode === 'release' ? 'production' : 'development'),
  };
}

export function buildContentRuntime(mode: string): Plugin {
  let appRoot = process.cwd();
  let repositoryRoot = resolvePath(appRoot, '../..');
  let outDir = resolveOutDir(appRoot, 'dist');

  return {
    apply: 'build',
    name: 'sniptale:content-runtime-injected-bundle',
    configResolved(config) {
      appRoot = config.root;
      repositoryRoot = resolvePath(appRoot, '../..');
      outDir = resolveOutDir(config.root, config.build.outDir);
    },
    async writeBundle() {
      const contentRuntimeBuildId = createContentRuntimeBuildId(
        mode,
        readExtensionManifestVersion(repositoryRoot)
      );
      const runtimeOutputPath = join(outDir, CONTENT_RUNTIME_OUTPUT);
      const result = await buildEsbuild({
        absWorkingDir: appRoot,
        bundle: true,
        define: contentRuntimeDefines(mode, contentRuntimeBuildId),
        drop: getReleaseDrop(mode),
        entryPoints: [join(repositoryRoot, CONTENT_RUNTIME_ENTRY)],
        format: 'iife',
        jsx: 'automatic',
        legalComments: 'eof',
        logLevel: 'silent',
        metafile: true,
        minify: mode === 'release',
        outfile: runtimeOutputPath,
        platform: 'browser',
        plugins: [
          createReleaseSafeDependencyAliasPlugin(repositoryRoot),
          createInlineCssTextPlugin(appRoot, join(repositoryRoot, TAILWIND_CONFIG_PATH)),
        ],
        sourcemap: mode !== 'release',
        target: ['chrome140'],
      });
      const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
      assertBundleHasNoImports('Injected content runtime', imports);
    },
  };
}

export function buildContentRuntimeShim(mode: string): Plugin {
  let appRoot = process.cwd();
  let repositoryRoot = resolvePath(appRoot, '../..');
  let outDir = resolveOutDir(appRoot, 'dist');

  return {
    apply: 'build',
    name: 'sniptale:content-runtime-shim-injected-bundle',
    configResolved(config) {
      appRoot = config.root;
      repositoryRoot = resolvePath(appRoot, '../..');
      outDir = resolveOutDir(config.root, config.build.outDir);
    },
    async writeBundle() {
      const shimOutputPath = join(outDir, CONTENT_RUNTIME_SHIM_OUTPUT);
      const result = await buildEsbuild({
        absWorkingDir: appRoot,
        bundle: true,
        define: {
          __ENABLE_DESIGN_SYSTEM__: JSON.stringify(mode !== 'release'),
          __SNIPTALE_TRACE_WS_URL__: JSON.stringify(getTraceWsUrlForMode(mode)),
          __TRACE_MESSAGES__: JSON.stringify(isTraceMessagesEnabledForMode(mode)),
          'globalThis.__SNIPTALE_RELEASE_BUILD__': JSON.stringify(mode === 'release'),
        },
        drop: getReleaseDrop(mode),
        entryPoints: [join(repositoryRoot, CONTENT_RUNTIME_SHIM_ENTRY)],
        format: 'iife',
        legalComments: 'eof',
        logLevel: 'silent',
        metafile: true,
        minify: mode === 'release',
        outfile: shimOutputPath,
        platform: 'browser',
        plugins: [createReleaseSafeDependencyAliasPlugin(repositoryRoot)],
        sourcemap: mode !== 'release',
        target: ['chrome140'],
      });
      const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
      assertBundleHasNoImports('Injected content runtime shim', imports);
      assertContentRuntimeShimInputsAreCompact(result.metafile.inputs);
      assertContentRuntimeShimOutputIsCompact(await readFile(shimOutputPath, 'utf8'));
    },
  };
}

export function buildWebSnapshotInjectedRunner(mode: string): Plugin {
  let appRoot = process.cwd();
  let repositoryRoot = resolvePath(appRoot, '../..');
  let outDir = resolveOutDir(appRoot, 'dist');

  return {
    apply: 'build',
    name: 'sniptale:web-snapshot-injected-runner',
    configResolved(config) {
      appRoot = config.root;
      repositoryRoot = resolvePath(appRoot, '../..');
      outDir = resolveOutDir(config.root, config.build.outDir);
    },
    async writeBundle() {
      const runnerOutputPath = join(outDir, WEB_SNAPSHOT_INJECTED_RUNNER_OUTPUT);
      const result = await buildEsbuild({
        absWorkingDir: appRoot,
        bundle: true,
        define: {
          __ENABLE_DESIGN_SYSTEM__: JSON.stringify(mode !== 'release'),
          __SNIPTALE_TRACE_WS_URL__: JSON.stringify(getTraceWsUrlForMode(mode)),
          __TRACE_MESSAGES__: JSON.stringify(isTraceMessagesEnabledForMode(mode)),
          'globalThis.__SNIPTALE_RELEASE_BUILD__': JSON.stringify(mode === 'release'),
        },
        drop: getReleaseDrop(mode),
        entryPoints: [join(repositoryRoot, WEB_SNAPSHOT_INJECTED_RUNNER_ENTRY)],
        format: 'iife',
        legalComments: 'eof',
        logLevel: 'silent',
        metafile: true,
        minify: mode === 'release',
        outfile: runnerOutputPath,
        platform: 'browser',
        plugins: [createReleaseSafeDependencyAliasPlugin(repositoryRoot)],
        sourcemap: mode !== 'release',
        target: ['chrome140'],
      });
      const imports = Object.values(result.metafile.outputs).flatMap((output) => output.imports);
      assertBundleHasNoImports('Injected web snapshot runner', imports);

      const builtManifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'));
      assertInjectedBundlesAreNotWebAccessible(collectWebAccessibleResources(builtManifest));
    },
  };
}
