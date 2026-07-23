import { expect, it } from 'vitest';

import { collectModuleImportGraph } from './module-import-graph.mjs';

it('resolves bounded relative, package, dynamic, resource, and unresolved imports', () => {
  const sources: Record<string, string> = {
    'apps/extension/src/content/example/main.ts': [
      "import './leaf';",
      "export { shared } from '@sniptale/example/shared';",
      "import('./dynamic');",
      "import data from './fixture.json?raw';",
      "import('./missing');",
    ].join('\n'),
    'apps/extension/src/content/example/leaf.ts': 'export const leaf = true;',
    'apps/extension/src/content/example/dynamic.ts': 'export const dynamic = true;',
    'apps/extension/src/content/example/fixture.json': '{}',
    'packages/example/src/shared.ts': 'export const shared = true;',
    'packages/example/package.json': JSON.stringify({
      exports: { './shared': './src/shared.ts' },
    }),
  };
  const files = Object.keys(sources).filter((file) => /\.[cm]?[jt]sx?$/u.test(file));
  const graph = collectModuleImportGraph({
    files,
    root: '/missing-root-is-safe-with-injected-reader',
    readFile(file) {
      if (!(file in sources)) throw new Error(`Missing fixture ${file}`);
      return sources[file];
    },
  });

  expect(graph.codeEdges.map((edge) => [edge.edgeKind, edge.target])).toEqual([
    ['dynamic-import', 'apps/extension/src/content/example/dynamic.ts'],
    ['import', 'apps/extension/src/content/example/leaf.ts'],
    ['re-export', 'packages/example/src/shared.ts'],
  ]);
  expect(graph.resourceEdges).toEqual([
    expect.objectContaining({ target: 'apps/extension/src/content/example/fixture.json' }),
  ]);
  expect(graph.unresolvedEdges).toEqual([
    expect.objectContaining({ specifier: './missing', edgeKind: 'dynamic-import' }),
  ]);
});
