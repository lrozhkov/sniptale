import { expect, it } from 'vitest';

import { collectModuleImportGraph } from './module-import-graph.mjs';

it('resolves bounded relative, package, dynamic, resource, and unresolved imports', () => {
  const sources: Record<string, string> = {
    'apps/extension/src/content/example/main.ts': [
      "import './leaf';",
      "import './events.helpers';",
      "export { shared } from '@sniptale/example/shared';",
      "import '@sniptale/example/helpers';",
      "import packageData from '@sniptale/example/data';",
      "import('./dynamic');",
      "import data from './fixture.json?raw';",
      "import('./missing');",
      "const required = require('./required');",
      "vi.mock('./mocked');",
    ].join('\n'),
    'apps/extension/src/content/example/leaf.ts': 'export const leaf = true;',
    'apps/extension/src/content/example/events.helpers.ts': 'export const helper = true;',
    'apps/extension/src/content/example/dynamic.ts': 'export const dynamic = true;',
    'apps/extension/src/content/example/required.ts': 'export const required = true;',
    'apps/extension/src/content/example/mocked.ts': 'export const mocked = true;',
    'apps/extension/src/content/example/styles.css': "@import '@sniptale/example/styles';",
    'apps/extension/src/content/example/fixture.json': '{}',
    'apps/extension/src/content/example/fixture.json.ts': 'export default {};',
    'packages/example/src/events.helpers.ts': 'export const packageHelper = true;',
    'packages/example/src/fixture.json': '{}',
    'packages/example/src/fixture.json.ts': 'export default {};',
    'packages/example/src/shared.ts': 'export const shared = true;',
    'packages/example/package.json': JSON.stringify({
      exports: {
        './data': './src/fixture.json',
        './helpers': './src/events.helpers',
        './shared': './src/shared.ts',
        './styles': './src/styles.css',
      },
    }),
  };
  sources['packages/example/src/styles.css'] = '.example {}';
  const files = Object.keys(sources).filter((file) => /(?:\.[cm]?[jt]sx?|\.css)$/u.test(file));
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
    ['import', 'apps/extension/src/content/example/events.helpers.ts'],
    ['import', 'apps/extension/src/content/example/leaf.ts'],
    ['mock', 'apps/extension/src/content/example/mocked.ts'],
    ['require', 'apps/extension/src/content/example/required.ts'],
    ['import', 'packages/example/src/events.helpers.ts'],
    ['re-export', 'packages/example/src/shared.ts'],
  ]);
  expect(graph.resourceEdges).toEqual([
    expect.objectContaining({ target: 'apps/extension/src/content/example/fixture.json' }),
    expect.objectContaining({ target: 'packages/example/src/fixture.json' }),
    expect.objectContaining({ target: 'packages/example/src/styles.css', edgeKind: 'css-import' }),
  ]);
  expect(graph.unresolvedEdges).toEqual([
    expect.objectContaining({ specifier: './missing', edgeKind: 'dynamic-import' }),
  ]);
});
