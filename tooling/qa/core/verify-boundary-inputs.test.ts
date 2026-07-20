import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectBoundaryInputViolations } from './verify-boundary-inputs.mjs';

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

it('flags non-unknown listener payloads that are read without validation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/editor/runtime.ts',
    'chrome.runtime.onMessage.addListener((message: { type?: string }) => console.log(message.type));\n'
  );

  expect(collectBoundaryInputViolations([file])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-input-non-unknown',
        file: expect.stringContaining('apps/extension/src/editor/runtime.ts'),
      }),
      expect.objectContaining({
        rule: 'boundary-input-unvalidated',
        file: expect.stringContaining('apps/extension/src/editor/runtime.ts'),
      }),
    ])
  );
});

it('allows listener payloads that are typed as unknown and narrowed locally', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/editor/runtime.ts',
    [
      'function isMessage(message: unknown): message is { type: string } {',
      "  return typeof message === 'object' && message !== null && 'type' in message;",
      '}',
      'chrome.runtime.onMessage.addListener((message: unknown) => {',
      '  if (!isMessage(message)) {',
      '    return;',
      '  }',
      '  console.log(message.type);',
      '});',
      '',
    ].join('\n')
  );

  expect(collectBoundaryInputViolations([file])).toEqual([]);
});

it('flags boundary helpers that cast unknown payloads instead of parsing them', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/helpers.ts',
    [
      'type RuntimeMessageRequest = { type: string };',
      'export function createRuntimeMessageHandler() {',
      '  return (request: unknown) => {',
      '    const typedRequest = request as RuntimeMessageRequest;',
      '    return typedRequest.type;',
      '  };',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryInputViolations([file])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-input-type-assertion',
        file: expect.stringContaining(
          'apps/extension/src/content/overlay/app/message-bridge/helpers.ts'
        ),
      }),
    ])
  );
});

it('ignores ordinary DOM event listeners outside boundary families', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/components/example.tsx',
    [
      'document.addEventListener("mousemove", (event: MouseEvent) => {',
      '  console.log(event.clientX);',
      '});',
      '',
    ].join('\n')
  );

  expect(collectBoundaryInputViolations([file])).toEqual([]);
});

it('ignores helper callbacks that already receive a typed runtime message', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-inputs-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/message-helpers.ts',
    [
      'type RuntimeMessageRequest = { type: string };',
      'export function createPassiveRuntimeMessageHandler() {',
      '  return (typedRequest: RuntimeMessageRequest) => typedRequest.type;',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryInputViolations([file])).toEqual([]);
});
