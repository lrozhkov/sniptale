import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import {
  buildContentRuntime,
  buildContentRuntimeShim,
  buildWebSnapshotInjectedRunner,
  getTraceWsUrlForMode,
  isTraceMessagesEnabledForMode,
} from './build/injected-build';
import { createContentRuntimeBuildId } from './build/content-runtime-build-id';
import { extensionHtmlInputs } from './build/extension-html-inputs';
import { createExtensionBuildLayout, extensionRollupInputs, layoutPolicy } from './build/layout';

const APP_ROOT = fileURLToPath(new URL('.', import.meta.url));
const BUILD_LAYOUT = createExtensionBuildLayout(APP_ROOT);
const REQUIRED_APP_HTML_OUTPUTS = [
  'apps/extension/src/camera-recorder/index.html',
  'apps/extension/src/design-system/index.html',
  'apps/extension/src/editor/index.html',
  'apps/extension/src/gallery/index.html',
  'apps/extension/src/offscreen/offscreen.html',
  'apps/extension/src/scenario-editor/index.html',
  'apps/extension/src/settings/index.html',
  'apps/extension/src/video-editor/index.html',
  'apps/extension/src/web-snapshot-viewer/index.html',
] as const;
const MANROPE_FONT_FILES = [
  'manrope-cyrillic-wght-normal.woff2',
  'manrope-latin-ext-wght-normal.woff2',
  'manrope-latin-wght-normal.woff2',
] as const;
const RELEASE_OXC_MINIFY_OPTIONS = {
  codegen: true,
  compress: {
    dropConsole: true,
    dropDebugger: true,
  },
  mangle: true,
} as const;
const BUILD_ALIASES = Object.entries(layoutPolicy.aliases).map(([find, replacement]) => ({
  find: find === 'zod' ? /^zod$/u : find,
  replacement: resolvePath(BUILD_LAYOUT.repositoryRoot, replacement),
}));

function assertRequiredAppHtmlOutputs(): void {
  const declaredOutputs = new Set(layoutPolicy.htmlInputs.map((input) => input.outputPath));
  const missingOutputs = REQUIRED_APP_HTML_OUTPUTS.filter((path) => !declaredOutputs.has(path));
  if (missingOutputs.length > 0) {
    throw new Error(`Extension build layout is missing HTML outputs: ${missingOutputs.join(', ')}`);
  }
}

assertRequiredAppHtmlOutputs();

function buildManifest() {
  return structuredClone(manifest);
}

function buildDefines(mode: string) {
  return {
    // Runtime tracing is opt-in because content-script websocket retries spam host-page consoles.
    __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__: JSON.stringify(
      createContentRuntimeBuildId(mode, manifest.version)
    ),
    __TRACE_MESSAGES__: JSON.stringify(isTraceMessagesEnabledForMode(mode)),
    __SNIPTALE_TRACE_WS_URL__: JSON.stringify(getTraceWsUrlForMode(mode)),
    'globalThis.__SNIPTALE_RELEASE_BUILD__': JSON.stringify(mode === 'release'),
    __ENABLE_DESIGN_SYSTEM__: JSON.stringify(mode !== 'release'),
    __ENABLE_PAGE_STYLE_RULES__: JSON.stringify(mode !== 'release'),
  };
}

async function copyManropeFontForCrxDev(outDir: string, fileName: string) {
  const sourcePath = join(
    BUILD_LAYOUT.repositoryRoot,
    'node_modules',
    '@fontsource-variable',
    'manrope',
    'files',
    fileName
  );
  const targetPath = join(
    outDir,
    'node_modules',
    '@fontsource-variable',
    'manrope',
    'files',
    fileName
  );

  await mkdir(dirname(targetPath), { recursive: true });
  await copyFile(sourcePath, targetPath);
}

function copyDevExtensionFonts(): Plugin {
  let copied = false;

  return {
    apply: 'serve',
    name: 'sniptale:copy-dev-extension-fonts',
    configureServer(server) {
      const copyFonts = async () => {
        if (copied) {
          return;
        }

        await Promise.all(
          MANROPE_FONT_FILES.map((fileName) =>
            copyManropeFontForCrxDev(server.config.build.outDir, fileName)
          )
        );
        copied = true;
      };

      server.httpServer?.once('listening', () => {
        void copyFonts().catch((error: unknown) => {
          server.config.logger.warn(
            `Failed to copy dev extension fonts: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
      });
    },
  };
}

function createRollupOptions(mode: string) {
  return {
    input: extensionRollupInputs(BUILD_LAYOUT, mode),
    output: {
      entryFileNames: 'assets/[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name].[ext]',
      ...(mode === 'release' ? { minify: RELEASE_OXC_MINIFY_OPTIONS } : {}),
    },
  };
}

export default defineConfig(({ mode }) => ({
  root: BUILD_LAYOUT.appRoot,
  cacheDir: resolvePath(BUILD_LAYOUT.repositoryRoot, '.tmp/vite-cache'),
  publicDir: resolvePath(BUILD_LAYOUT.appRoot, 'public'),
  base: './',
  plugins: [
    extensionHtmlInputs(BUILD_LAYOUT),
    copyDevExtensionFonts(),
    react(),
    crx({ manifest: buildManifest() }),
    buildContentRuntime(mode),
    buildContentRuntimeShim(mode),
    buildWebSnapshotInjectedRunner(mode),
  ],
  define: buildDefines(mode),
  build: {
    outDir: BUILD_LAYOUT.outputRoot,
    emptyOutDir: true,
    // Vite's preload helper resolves chunk URLs against the host page inside content scripts.
    modulePreload: false,
    target: 'chrome140',
    sourcemap: mode !== 'release',
    rollupOptions: createRollupOptions(mode),
  },
  worker: {
    format: 'iife',
  },
  resolve: {
    alias: BUILD_ALIASES,
  },
  // Dev server headers for FFmpeg SharedArrayBuffer support (local development only)
  server: {
    fs: {
      strict: true,
      allow: [BUILD_LAYOUT.appRoot, ...BUILD_LAYOUT.externalInputRoots],
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
}));
