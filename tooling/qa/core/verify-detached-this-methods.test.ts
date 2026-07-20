import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, expect, it, vi } from 'vitest';

import {
  collectDetachedThisMethodViolations,
  runDetachedThisMethodCheck,
} from './verify-detached-this-methods.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-detached-this-methods-'));
  tempDirs.push(root);
  return root;
}

function createRepoTempRoot() {
  const tempParent = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, 'verify-detached-this-methods-'));
  tempDirs.push(root);
  return root;
}

function serviceClassSource() {
  return [
    'export class ExampleService {',
    '  private count = 0;',
    '  flush() {',
    '    this.count += 1;',
    '  }',
    '  safe() {',
    '    return 1;',
    '  }',
    '  arrow = () => {',
    '    this.count += 1;',
    '  };',
    '}',
  ].join('\n');
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('reports class methods using this when they cross object-bag boundaries', () => {
  const root = createTempRoot();
  const service = writeFile(root, 'src/shared/example-service.ts', serviceClassSource());
  const consumer = writeFile(
    root,
    'apps/extension/src/popup/use-service.ts',
    [
      "import { ExampleService } from '../../../../src/shared/example-service';",
      'export function buildActions(service: ExampleService) {',
      '  return { onFlush: service.flush };',
      '}',
    ].join('\n')
  );

  expect(
    collectDetachedThisMethodViolations([consumer], { indexFiles: [service, consumer] })
  ).toEqual([
    expect.objectContaining({
      file: expect.stringContaining('apps/extension/src/popup/use-service.ts'),
      rule: 'detached-this-method',
    }),
  ]);
});

it('allows wrapper closures, direct invocations, and explicit bind calls', () => {
  const root = createTempRoot();
  const service = writeFile(root, 'src/shared/example-service.ts', serviceClassSource());
  const consumer = writeFile(
    root,
    'apps/extension/src/popup/use-service.ts',
    [
      "import { ExampleService } from '../../../../src/shared/example-service';",
      'export function buildActions(service: ExampleService) {',
      '  service.flush();',
      '  return {',
      '    bound: service.flush.bind(service),',
      '    wrapped: () => service.flush(),',
      '  };',
      '}',
    ].join('\n')
  );

  expect(
    collectDetachedThisMethodViolations([consumer], { indexFiles: [service, consumer] })
  ).toEqual([]);
});

it('does not report class-field arrow methods or methods that do not use this', () => {
  const root = createTempRoot();
  const service = writeFile(root, 'src/shared/example-service.ts', serviceClassSource());
  const consumer = writeFile(
    root,
    'apps/extension/src/popup/use-service.ts',
    [
      "import { ExampleService } from '../../../../src/shared/example-service';",
      'export function buildActions(service: ExampleService) {',
      '  return { arrow: service.arrow, safe: service.safe };',
      '}',
    ].join('\n')
  );

  expect(
    collectDetachedThisMethodViolations([consumer], { indexFiles: [service, consumer] })
  ).toEqual([]);
});

it('reports object-literal methods using this when they are detached', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/logic/example.ts',
    [
      'const service = {',
      '  count: 0,',
      '  flush() {',
      '    this.count += 1;',
      '  },',
      '  reset: function () {',
      '    this.count = 0;',
      '  },',
      '};',
      'export function buildActions() {',
      '  return { onFlush: service.flush, onReset: service.reset };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedThisMethodViolations([file], { indexFiles: [file] })).toHaveLength(2);
});

it('reports methods initialized with new class instances', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'src/shared/example.ts',
    [
      'class ExampleService {',
      '  flush() {',
      '    this.flush();',
      '  }',
      '}',
      'const service = new ExampleService();',
      'export const actions = { onFlush: service.flush };',
    ].join('\n')
  );

  expect(collectDetachedThisMethodViolations([file], { indexFiles: [file] })).toHaveLength(1);
});

it('keeps repo-wide report-only inventory non-blocking', () => {
  const root = createRepoTempRoot();
  const file = writeFile(
    root,
    'src/shared/example.ts',
    [
      'class ExampleService {',
      '  flush() {',
      '    this.flush();',
      '  }',
      '}',
      'const service = new ExampleService();',
      'export const actions = { onFlush: service.flush };',
    ].join('\n')
  );
  const result = runDetachedThisMethodCheck({
    collectFiles: () => [path.relative(process.cwd(), file)],
    collectIndexFiles: () => [path.relative(process.cwd(), file)],
    scope: 'repo-wide',
  });

  expect(result.violations).toEqual([expect.objectContaining({ rule: 'detached-this-method' })]);
});

it('keeps the repo-wide report-only CLI non-blocking', () => {
  const root = createTempRoot();
  writeFile(
    root,
    'apps/extension/src/shared/example.ts',
    [
      'class ExampleService {',
      '  flush() {',
      '    this.flush();',
      '  }',
      '}',
      'const service = new ExampleService();',
      'export const actions = { onFlush: service.flush };',
    ].join('\n')
  );
  const script = path.join(process.cwd(), 'tooling/qa/core/verify-detached-this-methods.mjs');

  const result = spawnSync(
    process.execPath,
    [script, '--repo-wide', '--report-only', 'apps/extension/src/shared/example.ts'],
    { cwd: root, encoding: 'utf8' }
  );

  expect(result.status).toBe(0);
  expect(result.stderr).toContain('Detached this-sensitive method report found references');
});
