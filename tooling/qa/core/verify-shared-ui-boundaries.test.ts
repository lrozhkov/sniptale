import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectSharedUiBoundaryViolations } from './verify-shared-ui-boundaries.mjs';

const tempDirs: string[] = [];
const DESIGN_SYSTEM_ROOT = '../../../../apps/extension/src/design-system';

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('collectSharedUiBoundaryViolations', () => {
  it('flags packages/ui imports from apps/extension/src/design-system', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-shared-ui-boundaries-'));
    tempDirs.push(root);

    const file = writeFile(
      root,
      'packages/ui/src/Example.design-system.tsx',
      `import { getSharedPreviewCopy } from '${DESIGN_SYSTEM_ROOT}/design-system-preview/shared-copy';\n`
    );

    expect(collectSharedUiBoundaryViolations([file])).toEqual([
      expect.objectContaining({
        rule: 'shared-ui-design-system-import',
        file: expect.stringContaining('packages/ui/src/Example.design-system.tsx'),
      }),
    ]);
  });

  it('allows shared-ui local imports', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-shared-ui-boundaries-'));
    tempDirs.push(root);

    const file = writeFile(
      root,
      'packages/ui/src/Example.design-system.tsx',
      "import { getSharedPreviewCopy } from './design-system-preview/shared-copy';\n"
    );

    expect(collectSharedUiBoundaryViolations([file])).toEqual([]);
  });
});
