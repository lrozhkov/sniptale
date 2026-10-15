import { build, type Plugin } from 'esbuild';
import { resolve } from 'node:path';

/** Mirrors Vite inline worker construction while retaining actual browser worker code. */
export function createInlineWorkerBundlePlugin(): Plugin {
  return {
    name: 'native-vite-inline-worker',
    setup(plugin) {
      plugin.onResolve({ filter: /\?worker&inline$/ }, (args) => ({
        path: resolve(args.resolveDir, args.path.replace(/\?worker&inline$/, '')),
        namespace: 'native-inline-worker',
      }));
      plugin.onLoad({ filter: /.*/, namespace: 'native-inline-worker' }, async (args) => {
        const worker = await build({
          entryPoints: [args.path],
          bundle: true,
          format: 'iife',
          platform: 'browser',
          write: false,
        });
        return {
          loader: 'js',
          contents: `const source = ${JSON.stringify(worker.outputFiles[0]!.text)};
          export default class InlineWorker {
            constructor(options) {
              const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
              try { return new Worker(url, options); } finally { URL.revokeObjectURL(url); }
            }
          }`,
        };
      });
    },
  };
}
