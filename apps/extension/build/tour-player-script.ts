import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import type { Plugin } from 'vite';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const entry = resolve(
  repositoryRoot,
  'apps/extension/src/features/scenario/tour-player/runtime.js'
);
const query = '?tour-player-script';

/** Bundle only the fixed player entry, identically in product builds and artifact tests. */
export function tourPlayerScript(): Plugin {
  return {
    name: 'sniptale:tour-player-script',
    enforce: 'pre',
    async load(id) {
      if (!id.endsWith(query)) return null;
      if (resolve(id.slice(0, -query.length)) !== entry)
        throw new Error('Unexpected tour player entry');
      const result = await build({
        absWorkingDir: repositoryRoot,
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        metafile: true,
        legalComments: 'none',
      });
      if (Object.values(result.metafile.outputs).some((output) => output.imports.length))
        throw new Error('Tour player must be self-contained');
      for (const path of Object.keys(result.metafile.inputs))
        this.addWatchFile(resolve(repositoryRoot, path));
      const script = result.outputFiles[0]?.text;
      if (!script || result.outputFiles.length !== 1) throw new Error('Missing tour player bundle');
      return `export default ${JSON.stringify(script)}`;
    },
  };
}
