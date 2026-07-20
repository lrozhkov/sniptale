import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectRuntimeListenerSeamViolations } from './verify-runtime-listener-seams.mjs';

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

describe('collectRuntimeListenerSeamViolations', () => {
  it('flags direct runtime listener registration outside the allowlist', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-runtime-listener-seams-'));
    tempDirs.push(root);

    const file = writeFile(
      root,
      'apps/extension/src/content/logic/example.ts',
      'chrome.runtime.onMessage.addListener(() => {});\n'
    );

    expect(collectRuntimeListenerSeamViolations([file])).toEqual([
      expect.objectContaining({
        rule: 'runtime-listener-seam',
        file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
      }),
    ]);
  });

  it('ignores files that use the shared browser runtime seam instead of direct listeners', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-runtime-listener-seams-'));
    tempDirs.push(root);

    const file = writeFile(
      root,
      'apps/extension/src/popup/popup-message-sync.ts',
      'browserRuntime.subscribeToMessages(() => {});\n'
    );

    expect(collectRuntimeListenerSeamViolations([file])).toEqual([]);
  });

  it('keeps the real content bridge allowlisted', () => {
    const file = path.resolve('apps/extension/src/content/overlay/app/message-bridge/index.ts');
    expect(collectRuntimeListenerSeamViolations([file])).toEqual([]);
  });
});
