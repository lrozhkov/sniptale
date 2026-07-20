import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectBoundaryCastViolations } from './verify-boundary-casts.mjs';

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

it('flags JSON.parse casts on import boundaries', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-casts-payload-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/editor/import.ts',
    [
      'type EditorDocument = { id: string };',
      'export function load(text: string) {',
      '  return JSON.parse(text) as EditorDocument;',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryCastViolations([file])).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        file: expect.stringContaining('apps/extension/src/editor/import.ts'),
        rule: 'boundary-json-parse-cast',
      }),
    ])
  );
});

it('flags custom event detail casts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-casts-payload-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/events.ts',
    [
      'type OpenDetail = { target: string };',
      'export function handle(event: Event) {',
      '  const detail = (event as CustomEvent<OpenDetail>).detail;',
      '  return detail.target;',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryCastViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/content/events.ts'),
      rule: 'boundary-custom-event-cast',
    }),
  ]);
});

it('flags unknown response and payload casts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-casts-payload-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/background/transport.ts',
    [
      'type ChatCompletionResponse = { choices?: unknown[] };',
      'type ProviderErrorPayload = { error?: { message?: string } };',
      'export function read(result: unknown, errorData: unknown) {',
      '  const payload = result as ChatCompletionResponse;',
      '  const error = errorData as ProviderErrorPayload;',
      '  return { payload, error };',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryCastViolations([file])).toEqual([
    expect.objectContaining({ rule: 'boundary-payload-cast' }),
    expect.objectContaining({ rule: 'boundary-payload-cast' }),
  ]);
});

it('ignores non-boundary local casts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-boundary-casts-payload-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/editor/math.ts',
    [
      'type Point = { x: number };',
      'export function read(value: unknown) {',
      '  return value as Point;',
      '}',
      '',
    ].join('\n')
  );

  expect(collectBoundaryCastViolations([file])).toEqual([]);
});
