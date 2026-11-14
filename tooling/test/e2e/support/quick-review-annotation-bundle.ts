import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

/** Browser probes use the same built DSP modules and exact retained source as the application. */
export function bundleQuickReviewAnnotationProbe(origin: string) {
  const runtimes: Record<string, string> = {
    'sniptale:audio-runtime/faust': '/audio-effects/faust-runtime.mjs',
    'sniptale:audio-runtime/rnnoise': '/audio-effects/rnnoise.mjs',
    'sniptale:audio-runtime/pitch': '/audio-effects/signalsmith-runtime.mjs',
  };
  return build({
    entryPoints: ['tooling/test/e2e/support/quick-review-annotation-render-probe.ts'],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    loader: { '.svg': 'text', '.woff2': 'dataurl', '.bin': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [
      {
        name: 'quick-review-built-assets',
        setup(plugin) {
          plugin.onResolve({ filter: /^sniptale:audio-runtime\// }, ({ path }) => {
            const runtime = runtimes[path];
            if (!runtime) throw new Error('Unexpected probe audio runtime.');
            return { path: new URL(runtime, origin).href, external: true };
          });
          plugin.onLoad({ filter: /callout\.sniptale-animation\.json$/ }, async ({ path }) => ({
            contents: await readFile(path, 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
  });
}
