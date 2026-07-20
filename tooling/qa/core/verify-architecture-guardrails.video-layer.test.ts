import { expect, it } from 'vitest';

import { writeRuntimeTopology } from './verify-architecture-guardrails.test-support';
import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./verify-architecture-guardrails.mjs')>(
      './verify-architecture-guardrails.mjs',
      import.meta.url
    )
  );
}

function writeLayerFixtures(root: string): string[] {
  writeRuntimeTopology(root);
  writeFile(root, 'apps/extension/src/content/overlay/thing.ts', 'export const thing = 1;\n');
  writeFile(
    root,
    'apps/extension/src/content/parser/thing.ts',
    "import { thing } from '../overlay/thing';\n"
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/workspace/surface/Button.tsx',
    'export const Button = () => null;\n'
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/runtime/controller/useButton.ts',
    "import { Button } from '../../workspace/surface/Button';\n"
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/project/policy.ts',
    "import { session } from '../runtime/session';\n"
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/runtime/session.ts',
    'export const session = 1;\n'
  );
  return [
    'apps/extension/src/content/parser/thing.ts',
    'apps/extension/src/video-editor/runtime/controller/useButton.ts',
    'apps/extension/src/video-editor/project/policy.ts',
  ];
}

it('blocks content and video-editor layer backedges without duplicate runtime diagnostics', async () => {
  const root = createTempRoot('architecture-guardrails-layers-');
  const files = writeLayerFixtures(root);
  const module = await loadModule(root);

  expect(
    module.collectLayerLeakageViolations(files, {
      baseline: {
        'content-parser-imports-content-overlay': [],
        'video-editor-layer-backedge': [],
        'video-editor-runtime-imports-product-surface': [],
      },
      root,
    })
  ).toEqual([
    expect.objectContaining({ rule: 'content-parser-imports-content-overlay' }),
    expect.objectContaining({ rule: 'video-editor-runtime-imports-product-surface' }),
    expect.objectContaining({ rule: 'video-editor-layer-backedge' }),
  ]);
});
