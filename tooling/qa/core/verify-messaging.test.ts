import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectDefaultRuntimeMessagingImportReport } from './messaging-default-imports.mjs';
import { collectMessagingViolations } from './verify-messaging.mjs';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-messaging-'));
  tempDirs.push(root);
  return root;
}

function expectDirectMessagingViolation(root: string, file: string) {
  expect(collectMessagingViolations([file], { root })).toEqual([
    expect.objectContaining({
      rule: 'messaging-direct-send',
      file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
    }),
  ]);
}

function verifiesDirectRuntimeMessagingViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/example.ts',
    "export function demo() { chrome.runtime.sendMessage({ type: 'PING' }); }\n"
  );

  expectDirectMessagingViolation(root, file);
}

function verifiesMultilineRuntimeMessagingViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/example.ts',
    [
      'export function demo() {',
      '  chrome.runtime',
      "    .sendMessage({ type: 'PING' });",
      '}',
    ].join('\n')
  );

  expectDirectMessagingViolation(root, file);
}

function verifiesTypedTransportAllowlist() {
  const file = path.resolve('apps/extension/src/platform/runtime-messaging/index.ts');

  expect(collectMessagingViolations([file])).toEqual([]);
}

function verifiesSpoofedTypedTransportPathViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'spoof/apps/extension/src/platform/runtime-messaging/index.ts',
    'export const send = () => chrome.runtime.sendMessage({ type: "PING" });\n'
  );

  expect(collectMessagingViolations([file], { root })).toEqual([
    expect.objectContaining({ rule: 'messaging-direct-send' }),
  ]);
}

function verifiesChromeStubViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/bootstrap/index.test.ts',
    "import { vi } from 'vitest';\nvi.stubGlobal('chrome', {});\n"
  );

  expect(collectMessagingViolations([file], { root })).toEqual([
    expect.objectContaining({
      rule: 'messaging-chrome-stub',
      file: expect.stringContaining('apps/extension/src/popup/shell/bootstrap/index.test.ts'),
    }),
  ]);
}

function verifiesDefaultRuntimeMessagingImportViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/example.ts',
    "import { sendRuntimeMessage } from '../../platform/runtime-messaging';\n"
  );

  expect(collectMessagingViolations([file], { root })).toEqual([
    expect.objectContaining({
      rule: 'messaging-default-runtime-transport-import',
      file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
      message: expect.stringContaining('Use injected RuntimeMessagingTransport'),
    }),
  ]);
}

function verifiesDirectDefaultTransportImportViolation() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/example.ts',
    "import { sendRuntimeMessage } from '../../platform/runtime-messaging/default-transport';\n"
  );

  expect(collectMessagingViolations([file], { root })).toEqual([
    expect.objectContaining({
      rule: 'messaging-default-runtime-transport-import',
      file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
      message: expect.stringContaining('Use injected RuntimeMessagingTransport'),
    }),
  ]);
}

function verifiesDefaultRuntimeMessagingImportAllowances() {
  const root = createTempRoot();
  const typeOnlyFile = writeFile(
    root,
    'apps/extension/src/content/logic/type-only.ts',
    "import type { RuntimeMessagingTransport } from '../../../../../src/shared/runtime-messaging';\n"
  );
  const wrapperFile = writeFile(
    root,
    'apps/extension/src/offscreen/runtime-messaging/best-effort.ts',
    "import { sendRuntimeMessage } from '../../../../../src/shared/runtime-messaging/index';\n"
  );
  const facadeTestFile = writeFile(
    root,
    'apps/extension/src/platform/runtime-messaging/index.test.ts',
    "import { sendRuntimeMessage } from './index';\n"
  );

  expect(collectMessagingViolations([typeOnlyFile, wrapperFile, facadeTestFile], { root })).toEqual(
    []
  );
}

function verifiesDefaultRuntimeMessagingImportBaselineRemoval() {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/type-only.ts',
    'export const value = 1;\n'
  );

  const report = collectDefaultRuntimeMessagingImportReport([file], {
    baseline: new Set(['apps/extension/src/content/logic/missing.ts#sendRuntimeMessage']),
    includeRemoved: true,
    root,
  });

  expect(report.violations).toEqual([
    expect.objectContaining({
      file: 'tooling/qa/policy/messaging.mjs',
      message: expect.stringContaining('Removed default runtime messaging import baseline'),
      rule: 'messaging-default-runtime-transport-import',
    }),
  ]);
}

describe('collectMessagingViolations', () => {
  it(
    'flags direct runtime messaging outside the allowlist',
    verifiesDirectRuntimeMessagingViolation
  );
  it(
    'flags multiline direct runtime messaging outside the allowlist',
    verifiesMultilineRuntimeMessagingViolation
  );
  it(
    'allows direct runtime messaging in the typed transport seam',
    verifiesTypedTransportAllowlist
  );
  it('rejects a suffix-spoofed typed transport path', verifiesSpoofedTypedTransportPathViolation);
  it('flags new chrome global stubs outside the allowlist', verifiesChromeStubViolation);
  it(
    'flags new default runtime messaging imports outside the baseline',
    verifiesDefaultRuntimeMessagingImportViolation
  );
  it(
    'flags direct default transport imports outside the baseline',
    verifiesDirectDefaultTransportImportViolation
  );
  it(
    'allows type imports, compatibility wrappers, and facade tests',
    verifiesDefaultRuntimeMessagingImportAllowances
  );
  it(
    'flags removed default runtime messaging import baseline entries',
    verifiesDefaultRuntimeMessagingImportBaselineRemoval
  );
});
