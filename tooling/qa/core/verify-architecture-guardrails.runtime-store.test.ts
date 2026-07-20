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

it('keeps the full video-editor store behind its sole runtime composition adapter', async () => {
  const root = createTempRoot('architecture-guardrails-video-store-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/video-editor/state/store.ts',
    'export const useVideoEditorStore = {};\n'
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/runtime/session/read-store.ts',
    "import { useVideoEditorStore } from '../../state/store';\n"
  );
  writeFile(
    root,
    'apps/extension/src/video-editor/runtime/controller/store.ts',
    "import { useVideoEditorStore } from '../../state/store';\n"
  );

  const module = await loadModule(root);
  const violations = module.collectLayerLeakageViolations(
    [
      'apps/extension/src/video-editor/runtime/session/read-store.ts',
      'apps/extension/src/video-editor/runtime/controller/store.ts',
    ],
    { baseline: { 'video-editor-runtime-imports-store-authority': [] }, root }
  );

  expect(violations).toEqual([
    expect.objectContaining({
      file: 'tooling/qa/core/architecture-guardrails.data.mjs',
      message: expect.stringContaining(
        'apps/extension/src/video-editor/runtime/session/read-store.ts:1'
      ),
      rule: 'video-editor-runtime-imports-store-authority',
    }),
  ]);
  expect(violations[0]?.message).not.toContain(
    'apps/extension/src/video-editor/runtime/controller/store.ts'
  );
});
