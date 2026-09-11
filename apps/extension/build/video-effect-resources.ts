import { resolve } from 'node:path';
import { tsImport } from 'tsx/esm/api';
import type { Plugin } from 'vite';

/** Node config loading needs TS resolution for the same public validators used by runtime imports. */
export function videoEffectResources(root: string): Plugin {
  const readIndex = async () => {
    const validator: typeof import('./video-effects') = await tsImport(
      resolve(root, '../../build/video-effects.ts'),
      import.meta.url
    );
    return validator.buildVideoEffectIndex(root);
  };
  return {
    name: 'sniptale:video-effect-resources',
    async buildStart() {
      const index = await readIndex();
      this.emitFile({
        type: 'asset',
        fileName: 'video-effects/index.json',
        source: JSON.stringify(index),
      });
    },
    configureServer(server) {
      server.middlewares.use('/video-effects/index.json', async (_req, res, next) => {
        try {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(await readIndex()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
