import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';

import {
  createSourceSnapshotStore,
  getSourceSnapshotStats,
  resolveSourceScriptKind,
} from './source-snapshot.mjs';
import { createTypeScriptSourceFile } from './typescript-ast-helpers.mjs';
import { createSourceFile as createStructuralSourceFile } from '../structural-risk/ast.mjs';

const roots: string[] = [];

function createFile(name: string, text: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-snapshot-'));
  roots.push(root);
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, text);
  return filePath;
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

it('reads and parses a current file once for all compatible consumers in a run', () => {
  const filePath = createFile('sample.ts', 'export const value = 1;\n');
  const readFile = vi.fn((target: string) => fs.readFileSync(target, 'utf8'));
  const createSourceFile = vi.fn(ts.createSourceFile);
  const store = createSourceSnapshotStore({ createSourceFile, readFile });

  const first = store.get({ filePath });
  const second = store.get({ filePath });

  expect(second).toBe(first);
  expect(first.lines).toEqual(['export const value = 1;', '']);
  expect(first.parseDiagnostics).toEqual([]);
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.lines)).toBe(true);
  expect(readFile).toHaveBeenCalledTimes(1);
  expect(createSourceFile).toHaveBeenCalledTimes(1);
  expect(store.getStats()).toEqual({
    evictionCount: 0,
    parseCount: 1,
    readCount: 1,
    snapshotCount: 1,
  });
});

it('keys current and HEAD snapshots by version, path, content and script kind', () => {
  const filePath = createFile('sample.tsx', 'export const current = <div />;\n');
  const createSourceFile = vi.fn(ts.createSourceFile);
  const store = createSourceSnapshotStore({ createSourceFile });

  const current = store.get({ filePath });
  const previous = store.get({
    filePath,
    text: 'export const previous = <span />;\n',
    version: 'HEAD',
  });
  const repeatedPrevious = store.get({
    filePath,
    text: 'export const previous = <span />;\n',
    version: 'HEAD',
  });

  expect(previous).toBe(repeatedPrevious);
  expect(previous).not.toBe(current);
  expect(previous.scriptKind).toBe(ts.ScriptKind.TSX);
  expect(createSourceFile).toHaveBeenCalledTimes(2);
  expect(store.getStats()).toMatchObject({ parseCount: 2, snapshotCount: 2 });
});

it('retains the immutable run snapshot across deletion and treats a rename as another path', () => {
  const filePath = createFile('before.ts', 'export const value = 1;\n');
  const renamedPath = path.join(path.dirname(filePath), 'after.ts');
  const store = createSourceSnapshotStore();
  const before = store.get({ filePath });
  fs.renameSync(filePath, renamedPath);

  expect(store.get({ filePath })).toBe(before);
  expect(store.get({ filePath: renamedPath }).sourceFile).not.toBe(before.sourceFile);
  expect(store.getStats()).toEqual({
    evictionCount: 0,
    parseCount: 2,
    readCount: 2,
    snapshotCount: 2,
  });
});

it('bounds strong AST retention while keeping recently reused snapshots hot', () => {
  const createSourceFile = vi.fn(ts.createSourceFile);
  const store = createSourceSnapshotStore({ createSourceFile, maxStrongSnapshots: 2 });
  const firstPath = createFile('first.ts', 'export const first = 1;\n');
  const secondPath = createFile('second.ts', 'export const second = 2;\n');
  const thirdPath = createFile('third.ts', 'export const third = 3;\n');

  const first = store.get({ filePath: firstPath });
  const second = store.get({ filePath: secondPath });
  expect(store.get({ filePath: firstPath })).toBe(first);

  store.get({ filePath: thirdPath });

  expect(store.get({ filePath: firstPath })).toBe(first);
  expect(store.get({ filePath: secondPath })).not.toBe(second);
  expect(store.getStats()).toEqual({
    evictionCount: 2,
    parseCount: 4,
    readCount: 3,
    snapshotCount: 2,
  });
});

it('exposes normalized parse diagnostics instead of silently treating invalid input as valid', () => {
  const store = createSourceSnapshotStore();
  const snapshot = store.get({
    filePath: '/virtual/broken.ts',
    text: 'export const value = ;',
  });

  expect(snapshot.parseDiagnostics).toEqual([
    expect.objectContaining({ code: expect.any(Number), message: expect.any(String) }),
  ]);
  expect(Object.isFrozen(snapshot.parseDiagnostics)).toBe(true);
});

it('shares one current and one HEAD parse across independent AST consumers', () => {
  const filePath = createFile('integration.ts', 'export const current = 1;\n');
  const before = getSourceSnapshotStats();

  const currentFromGeneric = createTypeScriptSourceFile(filePath, 'export const current = 1;\n');
  const currentFromStructural = createStructuralSourceFile(filePath, 'export const current = 1;\n');
  const headFromGeneric = createTypeScriptSourceFile(filePath, 'export const previous = 0;\n', {
    version: 'HEAD',
  });
  const headFromStructural = createStructuralSourceFile(filePath, 'export const previous = 0;\n', {
    version: 'HEAD',
  });
  const after = getSourceSnapshotStats();

  expect(currentFromStructural).toBe(currentFromGeneric);
  expect(headFromStructural).toBe(headFromGeneric);
  expect(after.parseCount - before.parseCount).toBe(2);
  expect(after.snapshotCount - before.snapshotCount).toBe(2);
});

it('makes shared AST consumers fail closed on malformed source', () => {
  const filePath = createFile('malformed.ts', 'export const value = ;\n');

  expect(() => createTypeScriptSourceFile(filePath, 'export const value = ;\n')).toThrow(
    /Cannot analyze malformed source/u
  );
  expect(() => createStructuralSourceFile(filePath, 'export const value = ;\n')).toThrow(
    /Cannot analyze malformed source/u
  );
});

it('resolves the TypeScript script kind from every admitted source extension', () => {
  expect(resolveSourceScriptKind('sample.ts')).toBe(ts.ScriptKind.TS);
  expect(resolveSourceScriptKind('sample.mts')).toBe(ts.ScriptKind.TS);
  expect(resolveSourceScriptKind('sample.cts')).toBe(ts.ScriptKind.TS);
  expect(resolveSourceScriptKind('sample.tsx')).toBe(ts.ScriptKind.TSX);
  expect(resolveSourceScriptKind('sample.js')).toBe(ts.ScriptKind.JS);
  expect(resolveSourceScriptKind('sample.mjs')).toBe(ts.ScriptKind.JS);
  expect(resolveSourceScriptKind('sample.cjs')).toBe(ts.ScriptKind.JS);
  expect(resolveSourceScriptKind('sample.jsx')).toBe(ts.ScriptKind.JSX);
});
