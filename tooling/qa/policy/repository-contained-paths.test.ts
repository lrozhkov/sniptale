import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  assertRepositoryRelativePath,
  resolveRepositoryRegularFile,
  resolveRepositoryWritePath,
  walkRepositoryDirectories,
  walkRepositoryFiles,
} from './repository-contained-paths.mjs';

const roots: string[] = [];

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'sniptale-contained-path-'));
  roots.push(root);
  mkdirSync(join(root, 'tooling/configs/qa'), { recursive: true });
  writeFileSync(join(root, 'tooling/configs/qa/safe.json'), '{}\n');
  return root;
}

it('accepts only canonical repository-relative paths', () => {
  expect(assertRepositoryRelativePath('tooling/configs/qa/safe.json')).toBe(
    'tooling/configs/qa/safe.json'
  );
  for (const path of ['../outside.json', '/tmp/outside.json', 'C:\\outside.json', './safe.json'])
    expect(() => assertRepositoryRelativePath(path)).toThrow('unsafe repository path');
});

it('rejects index paths that escape or traverse a symlink', () => {
  const root = fixtureRoot();
  const outside = join(tmpdir(), `sniptale-outside-${Date.now()}.json`);
  writeFileSync(outside, '{}\n');
  symlinkSync(outside, join(root, 'tooling/configs/qa/linked.json'));

  expect(resolveRepositoryRegularFile(root, 'tooling/configs/qa/safe.json')).toContain('safe.json');
  expect(() => resolveRepositoryRegularFile(root, '../outside.json')).toThrow(
    'unsafe repository path'
  );
  expect(() => resolveRepositoryRegularFile(root, 'tooling/configs/qa/linked.json')).toThrow(
    'unsafe repository path'
  );
  expect(() => resolveRepositoryWritePath(root, 'tooling/configs/qa/linked.json')).toThrow(
    'unsafe repository path'
  );
  rmSync(outside, { force: true });
});

it('fails closed on file, directory, and loop symlinks during repository discovery', () => {
  const root = fixtureRoot();
  mkdirSync(join(root, 'src', 'safe'), { recursive: true });
  writeFileSync(join(root, 'src', 'safe', 'entry.ts'), 'export {};\n');
  const outsideFile = join(tmpdir(), `sniptale-outside-file-${Date.now()}.ts`);
  const outsideDirectory = join(tmpdir(), `sniptale-outside-directory-${Date.now()}`);
  writeFileSync(outsideFile, 'export {};\n');
  mkdirSync(outsideDirectory, { recursive: true });

  symlinkSync(outsideFile, join(root, 'src', 'linked.ts'));
  expect(() => walkRepositoryFiles(root, 'src')).toThrow('unsafe repository path');
  unlinkSync(join(root, 'src', 'linked.ts'));

  symlinkSync(outsideDirectory, join(root, 'src', 'linked-directory'));
  expect(() => walkRepositoryDirectories(root, 'src')).toThrow('unsafe repository path');
  unlinkSync(join(root, 'src', 'linked-directory'));

  symlinkSync('loop', join(root, 'src', 'loop'));
  expect(() => walkRepositoryFiles(root, 'src')).toThrow('unsafe repository path');
  rmSync(outsideFile, { force: true });
  rmSync(outsideDirectory, { recursive: true, force: true });
});
