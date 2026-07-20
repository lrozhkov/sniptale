import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function withTempRepo(files: Record<string, string>, run: (root: string) => Promise<void> | void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-shared-style-ownership-'));
  tempDirs.push(root);

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
  }

  return Promise.resolve(run(root));
}

it('flags style modules in lower-layer packages', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/platform/src/styles-editor-special.css': '.demo {}',
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [path.join(root, 'packages/platform/src/styles-editor-special.css')],
          { root }
        )
      ).toEqual([
        expect.objectContaining({
          rule: 'shared-style-ownership',
          file: 'packages/platform/src/styles-editor-special.css',
        }),
      ]);
    }
  );
});

it('flags style data in non-UI packages', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/runtime-contracts/src/theme.styles.ts': "export const value = '';\n",
      'packages/foundation/src/glass-popover/styles.data.ts': "export const value = '';\n",
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [
            path.join(root, 'packages/runtime-contracts/src/theme.styles.ts'),
            path.join(root, 'packages/foundation/src/glass-popover/styles.data.ts'),
          ],
          { root }
        )
      ).toEqual([
        expect.objectContaining({
          file: 'packages/runtime-contracts/src/theme.styles.ts',
          rule: 'shared-style-ownership',
        }),
        expect.objectContaining({
          file: 'packages/foundation/src/glass-popover/styles.data.ts',
          rule: 'shared-style-ownership',
        }),
      ]);
    }
  );
});

it('allows canonical shared-ui style owners', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/ui/src/ProductModal.styles.ts': "export const modalStyles = ['demo'];\n",
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [path.join(root, 'packages/ui/src/ProductModal.styles.ts')],
          { root }
        )
      ).toEqual([]);
    }
  );
});

it('allows canonical shared style family modules', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/ui/src/styles/feedback/root.css': '.sniptale-toast { color: var(--demo); }\n',
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [path.join(root, 'packages/ui/src/styles/feedback/root.css')],
          { root }
        )
      ).toEqual([]);
    }
  );
});

it('allows canonical shared style owner-folder modules', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/ui/src/styles/ai-modal-content.css': '.sniptale-ai-modal { color: var(--demo); }\n',
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [path.join(root, 'packages/ui/src/styles/ai-modal-content.css')],
          { root }
        )
      ).toEqual([]);
    }
  );
});

it('allows canonical glass-popover style data owner-folder modules', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/ui/src/glass-popover/styles.data.ts': "export const glassPopoverStyles = 'demo';\n",
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [path.join(root, 'packages/ui/src/glass-popover/styles.data.ts')],
          { root }
        )
      ).toEqual([]);
    }
  );
});
