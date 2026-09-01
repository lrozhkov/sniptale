import { expect, it } from 'vitest';

import { collectTopologyModuleGraph, collectTopologySyntaxSignals } from './graph.mjs';

function createReader(sources: Record<string, string>) {
  return (file: string) => {
    if (!(file in sources)) throw new Error(`Missing fixture ${file}`);
    return sources[file];
  };
}

it('resolves bounded code, package, resource, dynamic, and unresolved edges', () => {
  const sources = {
    'apps/extension/src/content/feature/main.ts': [
      "import './exact.ts';",
      "import './extensionless';",
      "import './folder';",
      "import data from './fixture.json?raw';",
      "import image from './image.png?asset#v1';",
      "import './missing.css';",
      "import './missing.woff2';",
      "import '@vendor/external';",
      "export { conditional } from '@sniptale/demo/conditional';",
      "import('@sniptale/demo/styles');",
      "import('@sniptale/demo/missing-styles');",
      "import('@sniptale/demo/missing-media');",
      "import('@sniptale/missing-package/path');",
      "import('./missing');",
      'export const value = data;',
    ].join('\n'),
    'apps/extension/src/content/feature/exact.ts': 'export const exact = true;',
    'apps/extension/src/content/feature/extensionless.ts': 'export const extensionless = true;',
    'apps/extension/src/content/feature/folder/index.ts': 'export const folder = true;',
    'apps/extension/src/content/feature/fixture.json': '{}',
    'apps/extension/src/content/feature/image.png': 'fixture-image',
    'packages/demo/src/conditional.ts': 'export const conditional = true;',
    'packages/demo/src/styles.css': '.root {}',
    'packages/demo/package.json': JSON.stringify({
      exports: {
        './conditional': { browser: ['./missing.ts', './src/conditional.ts'] },
        './styles': './src/styles.css',
        './missing-styles': './src/missing.css',
        './missing-media': './src/missing.mp4',
      },
    }),
  };
  const files = Object.keys(sources).filter((file) => /\.[cm]?[jt]sx?$/u.test(file));
  const graph = collectTopologyModuleGraph({
    files,
    root: '/missing-root-is-safe-with-injected-reader',
    readFile: createReader(sources),
  });

  expect(graph.codeEdges.map((edge) => [edge.edgeKind, edge.target])).toEqual([
    ['import', 'apps/extension/src/content/feature/exact.ts'],
    ['import', 'apps/extension/src/content/feature/extensionless.ts'],
    ['import', 'apps/extension/src/content/feature/folder/index.ts'],
    ['re-export', 'packages/demo/src/conditional.ts'],
  ]);
  expect(graph.resourceEdges.map((edge) => [edge.specifier, edge.target])).toEqual([
    ['./fixture.json?raw', 'apps/extension/src/content/feature/fixture.json'],
    ['./image.png?asset#v1', 'apps/extension/src/content/feature/image.png'],
    ['@sniptale/demo/styles', 'packages/demo/src/styles.css'],
  ]);
  expect(graph.unresolvedEdges).toEqual([
    expect.objectContaining({ specifier: './missing', edgeKind: 'dynamic-import' }),
    expect.objectContaining({
      specifier: '@sniptale/missing-package/path',
      edgeKind: 'dynamic-import',
    }),
  ]);
  expect(graph.unresolvedEdges.some((edge) => edge.specifier.includes('missing-styles'))).toBe(
    false
  );
  expect(graph.unresolvedEdges.some((edge) => edge.specifier === './missing.css')).toBe(false);
  expect(graph.unresolvedEdges.some((edge) => edge.specifier === './missing.woff2')).toBe(false);
  expect(graph.unresolvedEdges.some((edge) => edge.specifier.includes('missing-media'))).toBe(
    false
  );
  expect(graph.codeEdges.some((edge) => edge.specifier === '@vendor/external')).toBe(false);
});

it('detects forwarding, pass-through, and delegation-only test syntax without execution', () => {
  const sources = {
    'tooling/example/index.ts': "export { run } from './run';",
    'tooling/example/run.ts': 'export function run(value: string) { return adapter(value); }',
    'tooling/example/run.test.ts': [
      "it('delegates', () => {",
      '  run();',
      '  expect(adapter).toHaveBeenCalled();',
      '});',
    ].join('\n'),
    'tooling/example/run.test-support.ts': [
      'export function assertDelegation() {',
      '  run();',
      '  expect(adapter).toHaveBeenCalled();',
      '}',
    ].join('\n'),
  };
  const graph = collectTopologyModuleGraph({
    files: Object.keys(sources),
    root: '/unused',
    readFile: createReader(sources),
  });
  const modules = Object.fromEntries(graph.modules.map((module) => [module.file, module]));

  expect(modules['tooling/example/index.ts'].forwardingOnly).toBe(true);
  expect(modules['tooling/example/run.ts'].passThrough).toBe(true);
  expect(modules['tooling/example/run.test.ts'].delegationOnlyTest).toBe(true);
  expect(modules['tooling/example/run.test-support.ts'].delegationOnlyTest).toBe(true);
});

it('exposes the same pure forwarding predicate for baseline comparisons', () => {
  expect(
    collectTopologySyntaxSignals('owner/facade.ts', "export { run } from './run';").forwardingOnly
  ).toBe(true);
  expect(
    collectTopologySyntaxSignals(
      'owner/facade.ts',
      "export { run } from './run'; export const owner = 'facade';"
    ).forwardingOnly
  ).toBe(false);
});
