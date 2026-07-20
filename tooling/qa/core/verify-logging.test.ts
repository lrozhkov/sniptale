import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { collectLoggingViolations } from './verify-logging.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-logging-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function verifiesProductionConsoleViolation() {
  const file = writeFile(
    createTempRoot(),
    'apps/extension/src/content/logic/example.ts',
    "export function demo() { console.error('boom'); }\n"
  );

  expect(collectLoggingViolations([file])).toEqual([
    expect.objectContaining({
      rule: 'raw-console-logging',
      file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
      line: 1,
    }),
  ]);
}

function verifiesChangedLineFiltering() {
  const file = writeFile(
    createTempRoot(),
    'apps/extension/src/content/logic/example.ts',
    [
      "export function first() { console.log('old'); }",
      "export function second() { console.warn('new'); }",
      '',
    ].join('\n')
  );

  expect(
    collectLoggingViolations([file], {
      changedLineMap: new Map([['apps/extension/src/content/logic/example.ts', new Set([2])]]),
    })
  ).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/content/logic/example.ts'),
      line: 2,
    }),
  ]);
}

function verifiesAllowlistsAndNonProductionScopes() {
  const tracerFile = writeFile(
    createTempRoot(),
    'packages/platform/src/observability/message-tracer/console.ts',
    "export function init() { console.log('trace'); }\n"
  );
  const testFile = writeFile(
    createTempRoot(),
    'apps/extension/src/content/logic/example.test.ts',
    "it('demo', () => console.error('test'));\n"
  );

  expect(collectLoggingViolations([tracerFile, testFile])).toEqual([]);
}

describe('collectLoggingViolations', () => {
  it('flags raw console usage in production src files', verifiesProductionConsoleViolation);
  it(
    'filters violations down to changed lines when a diff map is provided',
    verifiesChangedLineFiltering
  );
  it('ignores allowlisted tracing seams and test scopes', verifiesAllowlistsAndNonProductionScopes);
  it('ignores deleted files retained in the Git diff', () => {
    const missing = path.join(createTempRoot(), 'apps/extension/src/features/removed.ts');

    expect(collectLoggingViolations([missing])).toEqual([]);
  });
});
