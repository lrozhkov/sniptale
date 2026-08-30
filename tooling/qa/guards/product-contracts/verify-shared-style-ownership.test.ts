import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectFocusedSharedStyleFiles } from '../../composition/checkpoint/focused-triggered/helpers.mjs';

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
      'packages/platform/src/surfaces/theme-styles.data.mts': "export const value = '';\n",
      'packages/platform/src/theme/styles.ts': "export const value = '';\n",
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [
            path.join(root, 'packages/runtime-contracts/src/theme.styles.ts'),
            path.join(root, 'packages/foundation/src/glass-popover/styles.data.ts'),
            path.join(root, 'packages/platform/src/surfaces/theme-styles.data.mts'),
            path.join(root, 'packages/platform/src/theme/styles.ts'),
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
        expect.objectContaining({
          file: 'packages/platform/src/surfaces/theme-styles.data.mts',
          rule: 'shared-style-ownership',
        }),
        expect.objectContaining({
          file: 'packages/platform/src/theme/styles.ts',
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

it('does not turn arbitrary owner folders or domain style names into style ownership', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo(
    {
      'packages/foundation/src/glass-popover/copy.data.ts': "export const copy = 'demo';\n",
      'packages/runtime-contracts/src/page-style/types.ts': 'export interface PageStyle {}\n',
      'apps/extension/src/ui/local.css': '.feature {}\n',
    },
    (root) => {
      expect(
        module.collectSharedStyleOwnershipViolationsWithOptions(
          [
            path.join(root, 'packages/foundation/src/glass-popover/copy.data.ts'),
            path.join(root, 'packages/runtime-contracts/src/page-style/types.ts'),
            path.join(root, 'apps/extension/src/ui/local.css'),
          ],
          { root }
        )
      ).toEqual([]);
    }
  );
});

it('normalizes external paths without treating them as repository package owners', async () => {
  const module = await import('./verify-shared-style-ownership.mjs');

  await withTempRepo({}, (root) => {
    expect(
      module.collectSharedStyleOwnershipViolationsWithOptions(
        [path.resolve(root, '../external/packages/platform/src/theme.css')],
        { root }
      )
    ).toEqual([]);
  });
});

it('focuses lower-package style candidates and the current guard owner', () => {
  expect(
    collectFocusedSharedStyleFiles([
      'packages/platform/src/theme.styles.tsx',
      'packages/foundation/src/glass-popover/styles.data.ts',
      'packages/runtime-contracts/src/page-styles.data.mjs',
      'packages/platform/src/theme/styles.ts',
      'tooling/qa/guards/product-contracts/verify-shared-style-ownership.mjs',
      'apps/extension/src/ui/local.css',
      'packages/platform/src/not-style.data.ts',
      'tooling/qa/core/verify-shared-style-ownership.mjs',
    ])
  ).toEqual([
    'packages/platform/src/theme.styles.tsx',
    'packages/foundation/src/glass-popover/styles.data.ts',
    'packages/runtime-contracts/src/page-styles.data.mjs',
    'packages/platform/src/theme/styles.ts',
    'tooling/qa/guards/product-contracts/verify-shared-style-ownership.mjs',
  ]);
});
