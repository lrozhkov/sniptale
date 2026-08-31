import { expect, it } from 'vitest';
import path from 'node:path';

import { writeRuntimeTopology } from './test-support';
import {
  createTempRoot,
  importFresh,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

async function loadModule(root: string) {
  return withCwd(root, async () =>
    importFresh<typeof import('./check.mjs')>('./check.mjs', import.meta.url)
  );
}

it('allows raw browser storage writes only from canonical or documented owner paths', async () => {
  const root = createTempRoot('architecture-guardrails-storage-owner-');
  writeRuntimeTopology(root);
  writeFile(
    root,
    'apps/extension/src/background/storage/page-access/tab-activation.ts',
    "import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';\nexport function save() { return browserStorage.session.set({ a: 1 }); }\n"
  );
  writeFile(
    root,
    'apps/extension/src/background/diagnostics/other.ts',
    "import { browserStorage as storage } from '../../composition/persistence/infrastructure/browser-storage';\nexport function save() { return storage.session.set({ a: 1 }); }\n"
  );
  writeFile(
    root,
    'apps/extension/src/background/capture/page-package/job/storage.ts',
    "import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';\nexport function save() { return browserStorage.session.set({ a: 1 }); }\n"
  );
  writeFile(
    root,
    'apps/extension/src/background/capture/page-package/job/execute.ts',
    "import * as persistence from '../../../../composition/persistence/infrastructure/browser-storage';\nexport function save() { return persistence.browserStorage.session.set({ a: 1 }); }\n"
  );
  writeFile(
    root,
    'apps/extension/src/editor/persistence/workspace.ts',
    "import { browserStorage } from '../../composition/persistence/infrastructure/browser-storage';\nexport function save() { return browserStorage.local.set({ a: 1 }); }\n"
  );

  const module = await loadModule(root);
  expect(
    module.collectRawStorageMutationViolations(
      [
        path.join(root, 'apps/extension/src/background/storage/page-access/tab-activation.ts'),
        path.join(root, 'apps/extension/src/background/diagnostics/other.ts'),
        path.join(root, 'apps/extension/src/background/capture/page-package/job/storage.ts'),
        path.join(root, 'apps/extension/src/background/capture/page-package/job/execute.ts'),
        path.join(root, 'apps/extension/src/editor/persistence/workspace.ts'),
      ],
      { baseline: { 'raw-browser-storage-write': [] } }
    )
  ).toEqual([
    expect.objectContaining({
      message: expect.stringContaining(
        [
          'added=[apps/extension/src/background/diagnostics/other.ts:2,',
          'apps/extension/src/background/capture/page-package/job/execute.ts:2]; removed=[]',
        ].join(' ')
      ),
      rule: 'raw-browser-storage-write',
    }),
  ]);
});

it('does not treat an unrelated parameter named browserStorage as persistence authority', async () => {
  const root = createTempRoot('architecture-guardrails-storage-near-miss-');
  writeRuntimeTopology(root);
  const file = writeFile(
    root,
    'apps/extension/src/background/diagnostics/injected.ts',
    'export function save(browserStorage) { return browserStorage.session.set({ a: 1 }); }\n'
  );

  const module = await loadModule(root);
  expect(
    module.collectRawStorageMutationViolations([file], {
      baseline: { 'raw-browser-storage-write': [] },
    })
  ).toEqual([]);
});
