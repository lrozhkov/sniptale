import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectHotspotRegressionViolations } from './verify-hotspot-regression.mjs';

const tempDirs: string[] = [];

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

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-hotspot-regression-'));
  tempDirs.push(root);
  return root;
}

function createSequentialLines(length: number) {
  return Array.from({ length }, (_, index) => `const value${index} = ${index};`).join('\n');
}

describe('collectHotspotRegressionViolations', () => {
  it('flags oversized files that grow further in line count', () => {
    const root = createTempRoot();
    const previous = createSequentialLines(301);
    const current = createSequentialLines(302);
    const file = writeFile(root, 'apps/extension/src/content/hooks/useHugeHook.ts', current);

    expect(
      collectHotspotRegressionViolations([file], {
        getPreviousSource: () => previous,
      })
    ).toEqual([
      expect.objectContaining({
        rule: 'hotspot-regression-lines',
        file: expect.stringContaining('apps/extension/src/content/hooks/useHugeHook.ts'),
      }),
    ]);
  });
});

describe('collectHotspotRegressionViolations allowances', () => {
  it('allows files that stay below the hotspot limits', () => {
    const root = createTempRoot();
    const previous = createSequentialLines(100);
    const current = createSequentialLines(101);
    const file = writeFile(root, 'apps/extension/src/content/hooks/useSmallHook.ts', current);

    expect(
      collectHotspotRegressionViolations([file], {
        getPreviousSource: () => previous,
      })
    ).toEqual([]);
  });

  it('allows oversized files that shrink without treating that as topology success', () => {
    const root = createTempRoot();
    const previous = createSequentialLines(320);
    const current = createSequentialLines(301);
    const file = writeFile(root, 'apps/extension/src/content/hooks/useShrinkingHook.ts', current);

    expect(
      collectHotspotRegressionViolations([file], {
        getPreviousSource: () => previous,
      })
    ).toEqual([]);
  });

  it('allows a real repo hotspot file when the diff does not grow it', () => {
    const file = path.resolve('packages/ui/src/styles/index.css');
    const source = fs.readFileSync(file, 'utf8');

    expect(
      collectHotspotRegressionViolations([file], {
        getPreviousSource: () => source,
      })
    ).toEqual([]);
  });
});
