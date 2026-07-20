import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectChangedLineNumbers,
  collectSandboxStagedFiles,
  collectSandboxWorkspaceTargets,
} from './git-fallback.mjs';

function writeLooseObject(gitDir: string, type: string, body: Buffer | string) {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const object = Buffer.concat([Buffer.from(`${type} ${content.length}\0`), content]);
  const oid = crypto.createHash('sha1').update(object).digest('hex');
  const objectPath = path.join(gitDir, 'objects', oid.slice(0, 2), oid.slice(2));

  fs.mkdirSync(path.dirname(objectPath), { recursive: true });
  fs.writeFileSync(objectPath, zlib.deflateSync(object));

  return oid;
}

function writeTree(gitDir: string, entries: Array<{ mode: string; name: string; oid: string }>) {
  const chunks = entries.map(({ mode, name, oid }) =>
    Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')])
  );
  return writeLooseObject(gitDir, 'tree', Buffer.concat(chunks));
}

function writeCommit(gitDir: string, treeOid: string) {
  return writeLooseObject(
    gitDir,
    'commit',
    [
      `tree ${treeOid}`,
      'author Test <test@example.com> 0 +0000',
      'committer Test <test@example.com> 0 +0000',
      '',
      'snapshot',
      '',
    ].join('\n')
  );
}

function writeIndex(gitDir: string, entries: Array<{ mode: number; oid: string; path: string }>) {
  const header = Buffer.alloc(12);
  header.write('DIRC', 0, 'ascii');
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(entries.length, 8);

  const chunks = [header];
  for (const entry of entries) {
    const prefix = Buffer.alloc(62);
    prefix.writeUInt32BE(entry.mode, 24);
    Buffer.from(entry.oid, 'hex').copy(prefix, 40);
    prefix.writeUInt16BE(Buffer.byteLength(entry.path), 60);

    const pathBuffer = Buffer.from(entry.path);
    const nullByte = Buffer.from([0]);
    const body = Buffer.concat([prefix, pathBuffer, nullByte]);
    const padding = (8 - (body.length % 8)) % 8;

    chunks.push(body, Buffer.alloc(padding));
  }

  fs.writeFileSync(path.join(gitDir, 'index'), Buffer.concat(chunks));
}

function createTaskArtifactFallbackRepo() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-fallback-task-artifacts-'));
  tempDirs.push(repoRoot);

  const gitDir = path.join(repoRoot, '.git');
  fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });

  const trackedBlob = writeLooseObject(gitDir, 'blob', 'export const value = 1;\n');
  const rootTaskBlob = writeLooseObject(gitDir, 'blob', '# root plan\n');
  const rootTasksTree = writeTree(gitDir, [{ mode: '100644', name: 'plan.md', oid: rootTaskBlob }]);
  const headTree = writeTree(gitDir, [
    { mode: '100644', name: 'tracked.ts', oid: trackedBlob },
    { mode: '040000', name: 'tasks', oid: rootTasksTree },
  ]);
  const headCommit = writeCommit(gitDir, headTree);

  fs.writeFileSync(path.join(gitDir, 'HEAD'), headCommit);
  writeIndex(gitDir, [
    { mode: 0o100644, oid: trackedBlob, path: 'tracked.ts' },
    { mode: 0o100644, oid: rootTaskBlob, path: 'tasks/plan.md' },
  ]);

  fs.mkdirSync(path.join(repoRoot, 'tasks'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'tracked.ts'), 'export const value = 2;\n');
  fs.writeFileSync(path.join(repoRoot, 'tasks/plan.md'), '# updated root plan\n');
  fs.writeFileSync(path.join(repoRoot, 'tasks/local-note.md'), '# root local note\n');

  return repoRoot;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('collectChangedLineNumbers', () => {
  it('returns post-image line numbers for inserted and replaced lines', () => {
    expect(collectChangedLineNumbers('one\ntwo\nthree\n', 'one\nTWO\nthree\nfour\n')).toEqual([
      2, 4,
    ]);
  });
});

describe('sandbox git fallback', () => {
  it('reconstructs staged and workspace changes without spawning git', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-fallback-'));
    tempDirs.push(repoRoot);

    const gitDir = path.join(repoRoot, '.git');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });

    const headBlob = writeLooseObject(gitDir, 'blob', 'const value = 1;\n');
    const indexBlob = writeLooseObject(gitDir, 'blob', 'const value = 22;\n');
    const headTree = writeTree(gitDir, [{ mode: '100644', name: 'tracked.ts', oid: headBlob }]);
    const headCommit = writeCommit(gitDir, headTree);

    fs.writeFileSync(path.join(gitDir, 'HEAD'), headCommit);
    writeIndex(gitDir, [{ mode: 0o100644, oid: indexBlob, path: 'tracked.ts' }]);

    fs.writeFileSync(path.join(repoRoot, 'tracked.ts'), 'const value = 333;\n');
    fs.mkdirSync(path.join(repoRoot, 'tooling'), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'tooling/new-file.ts'), 'const newlyAdded = true;\n');

    expect(collectSandboxStagedFiles(repoRoot)).toEqual(['tracked.ts']);

    const targets = collectSandboxWorkspaceTargets(repoRoot);

    expect(targets.changedFiles).toEqual(['tooling/new-file.ts', 'tracked.ts']);
    expect([...(targets.changedLineMap.get('tracked.ts') ?? [])]).toEqual([1]);
    expect(targets.untrackedFiles.has('tooling/new-file.ts')).toBe(true);
  });

  it('ignores workspace-only task artifacts in fallback diff reconstruction', () => {
    const repoRoot = createTaskArtifactFallbackRepo();
    expect(collectSandboxStagedFiles(repoRoot)).toEqual([]);

    const targets = collectSandboxWorkspaceTargets(repoRoot);

    expect(targets.changedFiles).toEqual(['tracked.ts']);
    expect(targets.untrackedFiles.has('tasks/local-note.md')).toBe(false);
  });
});

describe('sandbox git fallback deletions', () => {
  it('includes staged deletions in sandbox workspace targets', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'git-fallback-staged-delete-'));
    tempDirs.push(repoRoot);

    const gitDir = path.join(repoRoot, '.git');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });

    const keptBlob = writeLooseObject(gitDir, 'blob', 'const kept = true;\n');
    const deletedBlob = writeLooseObject(gitDir, 'blob', 'const deleted = true;\n');
    const headTree = writeTree(gitDir, [
      { mode: '100644', name: 'deleted.ts', oid: deletedBlob },
      { mode: '100644', name: 'kept.ts', oid: keptBlob },
    ]);
    const headCommit = writeCommit(gitDir, headTree);

    fs.writeFileSync(path.join(gitDir, 'HEAD'), headCommit);
    writeIndex(gitDir, [{ mode: 0o100644, oid: keptBlob, path: 'kept.ts' }]);
    fs.writeFileSync(path.join(repoRoot, 'kept.ts'), 'const kept = true;\n');

    const targets = collectSandboxWorkspaceTargets(repoRoot);

    expect(targets.changedFiles).toEqual(['deleted.ts']);
    expect(targets.deletedFiles).toEqual(['deleted.ts']);
  });
});
