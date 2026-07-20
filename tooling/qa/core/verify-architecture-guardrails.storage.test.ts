import { expect, it } from 'vitest';
import path from 'node:path';

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

it('allows raw browser storage writes only from canonical or documented owner paths', async () => {
  const root = createTempRoot('architecture-guardrails-storage-owner-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/background/storage/page-access/tab-activation.ts',
    'export function save(browserStorage) { return browserStorage.session.set({ a: 1 }); }\n'
  );
  writeFile(
    root,
    'apps/extension/src/background/diagnostics/other.ts',
    'export function save(browserStorage) { return browserStorage.session.set({ a: 1 }); }\n'
  );
  writeFile(
    root,
    'apps/extension/src/editor/persistence/workspace.ts',
    'export function save(browserStorage) { return browserStorage.local.set({ a: 1 }); }\n'
  );

  const module = await loadModule(root);
  expect(
    module.collectRawStorageMutationViolations(
      [
        path.join(root, 'apps/extension/src/background/storage/page-access/tab-activation.ts'),
        path.join(root, 'apps/extension/src/background/diagnostics/other.ts'),
        path.join(root, 'apps/extension/src/editor/persistence/workspace.ts'),
      ],
      { baseline: { 'raw-browser-storage-write': [] } }
    )
  ).toEqual([
    expect.objectContaining({
      message: expect.stringContaining(
        'added=[apps/extension/src/background/diagnostics/other.ts:1]; removed=[]'
      ),
      rule: 'raw-browser-storage-write',
    }),
  ]);
});
