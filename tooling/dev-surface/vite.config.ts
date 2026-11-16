import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { audioEffects } from '../../apps/extension/build/audio-effects.ts';
import { glTransitions } from '../../apps/extension/build/gl-transitions.ts';
import { lottieSchema } from '../../apps/extension/build/lottie-schema.ts';
import { i18nCatalogs } from '../../apps/extension/build/i18n-catalogs.ts';
import { tourPlayerScript } from '../../apps/extension/build/tour-player-script.ts';
import { videoEffectResources } from '../../apps/extension/build/video-effect-resources.ts';
import { createZodRuntimeFallbackPlugin } from '../../apps/extension/build/injected-build-support.ts';
import { layoutPolicy } from '../../apps/extension/build/layout.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sandboxPage = '/apps/extension/src/effect-runtime-sandbox/index.html';
const aliases = Object.entries(layoutPolicy.aliases).map(([find, replacement]) => ({
  find: find === 'zod' ? /^zod$/u : find,
  replacement: resolve(root, replacement),
}));

function isolatedSandbox(): Plugin {
  let closeWatcher: (() => Promise<void>) | undefined;
  return {
    name: 'sniptale:dev-surface-sandbox',
    enforce: 'pre',
    closeBundle() {
      return closeWatcher?.();
    },
    async configureServer(server) {
      const assetsDir = `dev-surface-sandbox-${server.config.server.port ?? 4188}`;
      const output = resolve(root, '.tmp/dev-surface', assetsDir);
      const watcher = await build({
        configFile: false,
        root,
        publicDir: false,
        base: '/',
        resolve: { alias: aliases },
        plugins: [createZodRuntimeFallbackPlugin()],
        build: {
          outDir: output,
          emptyOutDir: true,
          assetsDir,
          target: 'chrome120',
          minify: false,
          watch: {},
          rollupOptions: { input: resolve(root, sandboxPage.slice(1)) },
        },
        worker: { format: 'iife' },
      });
      if (!('on' in watcher) || !('close' in watcher))
        throw new Error('Annotation sandbox watcher is unavailable.');
      let closing: Promise<void> | undefined;
      closeWatcher = () => (closing ??= watcher.close());
      let publicAssets = new Set<string>();
      server.httpServer?.once('close', () => {
        void closeWatcher?.();
      });
      try {
        await new Promise<void>((done, reject) => {
          watcher.on('event', (event) => {
            if (event.code === 'END') {
              void readdir(resolve(output, assetsDir), { withFileTypes: true }).then((entries) => {
                publicAssets = new Set(
                  entries
                    .filter(
                      (entry) =>
                        entry.isFile() &&
                        (entry.name.endsWith('.js') || entry.name.endsWith('.wasm'))
                    )
                    .map((entry) => `/${assetsDir}/${entry.name}`)
                );
                server.ws.send({ type: 'full-reload' });
                done();
              }, reject);
            } else if (event.code === 'ERROR') reject(event.error);
          });
        });
      } catch (error) {
        await closeWatcher();
        throw error;
      }
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
        if (path !== sandboxPage && !publicAssets.has(path)) {
          next();
          return;
        }
        let decoded;
        try {
          decoded = decodeURIComponent(path);
        } catch {
          response.writeHead(400).end();
          return;
        }
        if (decoded.includes('..') || decoded.includes('\\')) {
          response.writeHead(403).end();
          return;
        }
        void readFile(resolve(output, decoded.slice(1))).then(
          (bytes) => {
            response.writeHead(200, {
              'content-type': path.endsWith('.html')
                ? 'text/html; charset=utf-8'
                : path.endsWith('.wasm')
                  ? 'application/wasm'
                  : 'text/javascript',
              ...(request.headers.origin === 'null'
                ? { 'Access-Control-Allow-Origin': 'null' }
                : {}),
              Vary: 'Origin',
              'Cross-Origin-Embedder-Policy': 'require-corp',
              'Cross-Origin-Opener-Policy': 'same-origin',
              'Cross-Origin-Resource-Policy': 'cross-origin',
            });
            response.end(bytes);
          },
          () => {
            response.writeHead(404).end('Sandbox resource not found');
          }
        );
      });
    },
  };
}

/** Editor hooks and preparation are one runtime; reload a settled source batch together. */
function settledSourceReload(): Plugin {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: 'sniptale:dev-surface-settled-reload',
    apply: 'serve',
    enforce: 'pre',
    handleHotUpdate(context) {
      if (
        !['apps/extension/src', 'packages', 'tooling/test/harness'].some((directory) =>
          context.file.startsWith(`${resolve(root, directory)}/`)
        )
      )
        return;
      if (/\.(?:css|scss)$/u.test(context.file)) return;
      if (timer) clearTimeout(timer);
      context.server.moduleGraph.invalidateAll();
      timer = setTimeout(() => {
        timer = undefined;
        context.server.ws.send({ type: 'full-reload' });
      }, 900);
      return [];
    },
    closeBundle() {
      if (timer) clearTimeout(timer);
    },
  };
}

export default defineConfig({
  root,
  cacheDir: resolve(root, '.tmp/dev-surface/vite-cache'),
  publicDir: resolve(root, 'apps/extension/public'),
  optimizeDeps: {
    entries: ['tooling/test/harness/dev-surface.html'],
    exclude: [
      'sniptale:audio-runtime/faust',
      'sniptale:audio-runtime/rnnoise',
      'sniptale:audio-runtime/pitch',
      'sniptale:audio-test-assets',
    ],
  },
  plugins: [
    settledSourceReload(),
    {
      name: 'sniptale:dev-surface-entry',
      apply: 'serve',
      transformIndexHtml: {
        order: 'pre',
        handler(html, context) {
          if (context.filename !== resolve(root, 'tooling/test/harness/dev-surface.html'))
            return html;
          return html.replace(
            'src="./dev-surface.ts"',
            'src="/tooling/test/harness/dev-surface.ts"'
          );
        },
      },
    },
    audioEffects({ inlineRuntime: true }),
    glTransitions(),
    lottieSchema(),
    i18nCatalogs(root),
    createZodRuntimeFallbackPlugin(),
    tourPlayerScript(),
    {
      name: 'sniptale:dev-surface-effect-index',
      configureServer: videoEffectResources(resolve(root, 'apps/extension/public/video-effects'))
        .configureServer,
    },
    tailwindcss(),
    react(),
    isolatedSandbox(),
  ],
  resolve: { alias: aliases, dedupe: ['react', 'react-dom'] },
  define: {
    __TRACE_MESSAGES__: 'false',
    __SNIPTALE_SECURITY_E2E__: 'false',
    __SNIPTALE_TRACE_WS_URL__: '""',
    __ENABLE_DESIGN_SYSTEM__: 'true',
    'globalThis.__SNIPTALE_RELEASE_BUILD__': 'false',
    __SNIPTALE_CONTENT_RUNTIME_BUILD_ID__: '"dev-surface"',
  },
  worker: { format: 'es' },
  server: {
    host: '127.0.0.1',
    strictPort: true,
    cors: false,
    fs: {
      strict: true,
      allow: [root],
      deny: ['**/.git/**', '**/.env*', '**/.secrets/**', '**/*.key'],
    },
    watch: { ignored: ['**/.tmp/**', '**/dist/**', '**/build/ci-artifacts/**'] },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
});
