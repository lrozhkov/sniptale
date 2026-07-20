import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { runHotPathCleanupCheck } from './verify-hot-path-cleanups.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-hot-path-cleanups-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('reports write-style persistence functions that perform full scans', () => {
  const root = createTempRoot();
  writeFile(
    root,
    'apps/extension/src/composition/persistence/db/example.ts',
    [
      'export async function saveExampleRecord() {',
      '  const db = await initDB();',
      "  return db.getAll('records');",
      '}',
    ].join('\n')
  );

  expect(
    runHotPathCleanupCheck({
      files: [path.join(root, 'apps/extension/src/composition/persistence/db/example.ts')],
    })
  ).toEqual(
    expect.objectContaining({
      skipped: false,
      violations: [
        expect.objectContaining({
          rule: 'storage-write-patterns',
        }),
      ],
    })
  );
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runHotPathCleanupCheck({ scope: 'repo-wide' });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
