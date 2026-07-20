import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectReadSafeNamingViolations,
  runReadSafeNamingCheck,
} from './verify-read-safe-naming.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-read-safe-naming-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags read-safe names only when they perform actual mutation work', () => {
  const root = createTempRoot();
  const flaggedFile = writeFile(
    root,
    'apps/extension/src/settings/runtime/store/index.ts',
    [
      'import { saveSettings } from "../../../../../src/shared/settings";',
      'export async function loadSettingsIntoStore() {',
      '  await saveSettings();',
      '}',
    ].join('\n')
  );
  const allowedFile = writeFile(
    root,
    'apps/extension/src/content/components/floating.tsx',
    [
      'export function getToolbarProps(props) {',
      '  return {',
      '    setOpen: props.setOpen,',
      '    bootstrapId: props.bootstrapId,',
      '  };',
      '}',
    ].join('\n')
  );

  expect(collectReadSafeNamingViolations([flaggedFile, allowedFile])).toEqual([
    expect.objectContaining({
      rule: 'read-safe-naming',
      file: expect.stringContaining('apps/extension/src/settings/runtime/store/index.ts'),
    }),
  ]);
});

it('ignores local clone cleanup inside otherwise read-safe helpers', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parsers/helper.ts',
    [
      'export function resolveContainerTextValue(formContainer) {',
      '  const clone = formContainer.cloneNode(true);',
      "  clone.querySelector('label')?.remove();",
      '  return clone.textContent ?? "";',
      '}',
    ].join('\n')
  );

  expect(collectReadSafeNamingViolations([file])).toEqual([]);
});

it('supports repo-wide mode without skipping when no explicit files are provided', () => {
  const result = runReadSafeNamingCheck({
    scope: 'repo-wide',
    collectFiles: () => ['tooling/qa/core/verify-read-safe-naming.mjs'],
  });

  expect(result.skipped).toBe(false);
  expect(result.files.length).toBeGreaterThan(0);
});
