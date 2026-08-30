import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { inspectBoundaryInputFiles, runBoundaryInputCheck } from './check.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createFixture(relativePath: string, lines: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);
  return writeFile(root, relativePath, [...lines, ''].join('\n'));
}

function collectBoundaryInputViolations(files: string[]) {
  return inspectBoundaryInputFiles(files).violations;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('inventories canonical message, connection, Port and raw runtime subscriptions', () => {
  const file = createFixture('apps/extension/src/editor/runtime.ts', [
    "import { browserRuntime as runtime } from '@sniptale/platform/browser/runtime';",
    'const handleMessage = (message: unknown) => { if (!isMessage(message)) return; void message.type; };',
    'runtime.subscribeToMessages(handleMessage);',
    'runtime.subscribeToConnections((port) => {',
    '  port.onMessage.addListener((payload: unknown) => { if (isPayload(payload)) void payload.id; });',
    '});',
    'chrome.runtime.onMessage.addListener((value: unknown) => { if (isValue(value)) void value.id; });',
  ]);

  expect(inspectBoundaryInputFiles([file]).inventory.map(({ kind }) => kind)).toEqual([
    'runtime-message',
    'runtime-connection',
    'port-message',
    'runtime-message',
  ]);
  expect(collectBoundaryInputViolations([file])).toEqual([]);
});

it('flags typed payloads and property reads before validation', () => {
  const file = createFixture('apps/extension/src/editor/runtime.ts', [
    "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
    'browserRuntime.subscribeToMessages((message: { type?: string }) => {',
    '  console.log(message.type);',
    '  if (!isMessage(message)) return;',
    '});',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'boundary-input-non-unknown' }),
      expect.objectContaining({ rule: 'boundary-input-unvalidated' }),
    ])
  );
});

it('accepts validation before use through a payload alias', () => {
  const file = createFixture('apps/extension/src/editor/runtime.ts', [
    "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
    'const listener = (message: unknown) => {',
    '  const candidate = message;',
    '  if (!isMessage(candidate)) return;',
    '  console.log(message.type);',
    '};',
    'browserRuntime.subscribeToMessages(listener);',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual([]);
});

it('flags a validator-looking call on an unrelated value', () => {
  const file = createFixture('apps/extension/src/editor/runtime.ts', [
    "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
    'browserRuntime.subscribeToMessages((message: unknown) => {',
    '  validateSettings({});',
    '  console.log(message.type);',
    '});',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual([
    expect.objectContaining({ rule: 'boundary-input-unvalidated' }),
  ]);
});

it('resolves a callback returned by a factory without relying on its name', () => {
  const file = createFixture('apps/extension/src/content/runtime.ts', [
    "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
    'function buildReceiver() {',
    '  return (request: unknown) => {',
    '    const typedRequest = request as { type: string };',
    '    return typedRequest.type;',
    '  };',
    '}',
    'browserRuntime.subscribeToMessages(buildReceiver());',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: 'boundary-input-unvalidated' })])
  );
});

it('resolves an imported callback factory used by the canonical adapter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);
  const factory = writeFile(
    root,
    'apps/extension/src/content/receiver.ts',
    [
      'export function makeReceiver() {',
      '  return (message: unknown) => console.log(message.type);',
      '}',
      '',
    ].join('\n')
  );
  const subscriber = writeFile(
    root,
    'apps/extension/src/content/runtime.ts',
    [
      "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
      "import { makeReceiver } from './receiver';",
      'browserRuntime.subscribeToMessages(makeReceiver());',
      '',
    ].join('\n')
  );

  const result = inspectBoundaryInputFiles([subscriber, factory]);
  expect(result.inventory).toEqual([
    expect.objectContaining({
      callbackResolved: true,
      kind: 'runtime-message',
    }),
  ]);
  expect(result.violations).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/content/receiver.ts'),
      rule: 'boundary-input-unvalidated',
    }),
  ]);
});

it('resolves named Port callbacks and flags their raw reads', () => {
  const file = createFixture('apps/extension/src/content/port.ts', [
    'declare const port: chrome.runtime.Port;',
    'function receive(frame: unknown) { console.log(frame.type); }',
    'port.onMessage.addListener(receive);',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual([
    expect.objectContaining({ rule: 'boundary-input-unvalidated' }),
  ]);
});

it('allows a raw payload handoff to a named unknown boundary owner', () => {
  const file = createFixture('apps/extension/src/background/runtime.ts', [
    "import { browserRuntime } from '@sniptale/platform/browser/runtime';",
    'function route(message: unknown) { if (!isMessage(message)) return; void message.type; }',
    'browserRuntime.subscribeToMessages((message) => route(message));',
  ]);

  expect(collectBoundaryInputViolations([file])).toEqual([]);
});

it('ignores ordinary event listeners and unregistered typed factories', () => {
  const file = createFixture('apps/extension/src/content/components/example.tsx', [
    'document.addEventListener("mousemove", (event: MouseEvent) => console.log(event.clientX));',
    'export function createPassiveRuntimeMessageHandler() {',
    '  return (typedRequest: { type: string }) => typedRequest.type;',
    '}',
  ]);

  expect(inspectBoundaryInputFiles([file])).toEqual({
    inventory: [],
    violations: [],
  });
});

it('keeps focused runner output in parity with direct inspection', () => {
  const file = createFixture('apps/extension/src/editor/runtime.ts', [
    'chrome.runtime.onMessage.addListener((message: unknown) => console.log(message.type));',
  ]);
  const inspected = inspectBoundaryInputFiles([file]);
  const focused = runBoundaryInputCheck({ files: [file], scope: 'explicit' });

  expect(focused.inventory).toEqual(inspected.inventory);
  expect(focused.violations).toEqual(inspected.violations);
});
