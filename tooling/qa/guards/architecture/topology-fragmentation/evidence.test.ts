import { expect, it } from 'vitest';

import {
  classifyAutomaticForwardingKeep,
  classifyCanonicalTopologyOwner,
  collectExactPublicContractFiles,
} from './evidence.mjs';

const runtimes = [
  { id: 'background', root: 'apps/extension/src/background', entrypointFiles: [] },
  { id: 'content', root: 'apps/extension/src/content', entrypointFiles: [] },
];
it('collects only exact package exports and runtime entrypoints as public contracts', () => {
  const graph = {
    files: [
      'packages/demo/src/public.ts',
      'packages/demo/src/private.ts',
      'apps/extension/src/background/index.ts',
    ],
  };
  const files = collectExactPublicContractFiles(
    graph,
    [{ ...runtimes[0], entrypointFiles: ['apps/extension/src/background/index.ts'] }],
    (file) => {
      if (file === 'packages/demo/package.json') {
        return JSON.stringify({ exports: { './public': './src/public.ts' } });
      }
      throw new Error(`Missing fixture ${file}`);
    }
  );

  expect([...files].sort()).toEqual([
    'apps/extension/src/background/index.ts',
    'packages/demo/src/public.ts',
  ]);
});

it('classifies runtime, app-core, and package owners and fails closed elsewhere', () => {
  const context = { runtimes };

  expect(
    classifyCanonicalTopologyOwner('apps/extension/src/content/overlay/view.ts', context)
  ).toMatchObject({ id: 'runtime:content' });
  expect(
    classifyCanonicalTopologyOwner('apps/extension/src/features/editor/guards.ts', context)
  ).toMatchObject({ id: 'app-core:apps/extension/src/features/editor' });
  expect(classifyCanonicalTopologyOwner('packages/ui/src/button.ts', context)).toMatchObject({
    id: 'package:ui',
  });
  expect(classifyCanonicalTopologyOwner('tooling/example/check.mjs', context)).toBeNull();
});

it('keeps only exact public, cross-runtime, or canonical cross-owner edges', () => {
  const context = { publicFiles: new Set<string>(), runtimes };

  expect(
    classifyAutomaticForwardingKeep({
      ...context,
      forwarder: 'apps/extension/src/content/public.ts',
      consumer: 'apps/extension/src/background/consumer.ts',
    })
  ).toMatchObject({ reason: 'runtime-boundary' });
  expect(
    classifyAutomaticForwardingKeep({
      ...context,
      forwarder: 'apps/extension/src/features/editor/public.ts',
      consumer: 'apps/extension/src/features/scenario/consumer.ts',
    })
  ).toMatchObject({ reason: 'cross-owner' });
  expect(
    classifyAutomaticForwardingKeep({
      ...context,
      forwarder: 'apps/extension/src/content/public.ts',
      consumer: 'apps/extension/src/content/consumer.ts',
    })
  ).toBeNull();
  expect(
    classifyAutomaticForwardingKeep({
      ...context,
      forwarder: 'tooling/a/public.mjs',
      consumer: 'tooling/b/consumer.mjs',
    })
  ).toBeNull();
});
