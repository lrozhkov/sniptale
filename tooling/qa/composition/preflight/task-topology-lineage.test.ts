import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { collectTaskTopologySourceByTarget } from './task-topology-lineage.mjs';

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'task-topology-lineage-'));
  fs.mkdirSync(path.join(root, 'tasks'));
  fs.mkdirSync(path.join(root, 'source'));
  fs.writeFileSync(path.join(root, 'source/original.ts'), 'export const value = 1;\n');
  execFileSync('git', ['init'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'qa@example.test'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'QA'], { cwd: root });
  execFileSync('git', ['add', 'source/original.ts'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
  return root;
}

function createManifest(root: string) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const source = fs.readFileSync(path.join(root, 'source/original.ts'));
  fs.renameSync(path.join(root, 'source/original.ts'), path.join(root, 'source/moved.ts'));
  return {
    head,
    selectedRoot: 'source',
    generatedEntries: [],
    entries: [
      {
        sourcePath: 'source/original.ts',
        targetPath: 'source/moved.ts',
        mode: '644',
        sha256: createHash('sha256').update(source).digest('hex'),
      },
    ],
  };
}

function writeManifest(root: string, manifest: unknown) {
  fs.writeFileSync(path.join(root, 'tasks/wave-manifest.json'), JSON.stringify(manifest));
}

it('accepts only complete current-HEAD entries with matching source digests', () => {
  const root = createRepository();
  const manifest = createManifest(root);
  writeManifest(root, manifest);
  expect(collectTaskTopologySourceByTarget({ root }).get('source/moved.ts')).toBe(
    'source/original.ts'
  );
  manifest.entries[0].sha256 = 'invalid';
  writeManifest(root, manifest);
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());
});

it('rejects self-asserted completeness when inventory, modes, collisions, or targets drift', () => {
  const root = createRepository();
  const manifest = createManifest(root);
  writeManifest(root, { ...manifest, completeness: { valid: true }, entries: [] });
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());
  writeManifest(root, { ...manifest, entries: [{ ...manifest.entries[0], mode: '755' }] });
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());
  writeManifest(root, {
    ...manifest,
    generatedEntries: [{ targetPath: 'source/moved.ts' }],
  });
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());
  writeManifest(root, {
    ...manifest,
    entries: [{ ...manifest.entries[0], targetPath: 'source/missing.ts' }],
  });
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());
});

it('accepts declared generated targets outside the selected move root', () => {
  const root = createRepository();
  const manifest = createManifest(root);
  fs.mkdirSync(path.join(root, 'platform'));
  fs.writeFileSync(path.join(root, 'platform/codec.ts'), 'export {};\n');
  manifest.generatedEntries.push({ targetPath: 'platform/codec.ts', mode: '644' } as never);
  writeManifest(root, manifest);
  expect(collectTaskTopologySourceByTarget({ root }).get('source/moved.ts')).toBe(
    'source/original.ts'
  );
});

it('maps one source to every declared split target', () => {
  const root = createRepository();
  const manifest = createManifest(root);
  fs.copyFileSync(path.join(root, 'source/moved.ts'), path.join(root, 'source/second.ts'));
  manifest.entries[0].targetPath = null as never;
  Object.assign(manifest.entries[0], {
    splitTargets: ['source/moved.ts', { targetPath: 'source/second.ts' }],
  });
  manifest.generatedEntries.push(
    { targetPath: 'source/moved.ts', mode: '644' } as never,
    { targetPath: 'source/second.ts', mode: '644' } as never
  );
  writeManifest(root, manifest);
  expect([...collectTaskTopologySourceByTarget({ root }).entries()]).toEqual([
    ['source/moved.ts', 'source/original.ts'],
    ['source/second.ts', 'source/original.ts'],
  ]);
});

it('rejects conflicting lineage declarations and generated mode drift', () => {
  const root = createRepository();
  fs.writeFileSync(path.join(root, 'source/other.ts'), 'export const value = 1;\n');
  execFileSync('git', ['add', 'source/other.ts'], { cwd: root });
  execFileSync('git', ['commit', '-m', 'second fixture'], { cwd: root });
  const manifest = createManifest(root);
  fs.unlinkSync(path.join(root, 'source/other.ts'));
  manifest.entries.push({
    ...manifest.entries[0],
    sourcePath: 'source/other.ts',
    targetPath: 'source/moved.ts',
  });
  writeManifest(root, manifest);
  expect(collectTaskTopologySourceByTarget({ root })).toEqual(new Map());

  const cleanRoot = createRepository();
  const cleanManifest = createManifest(cleanRoot);
  fs.mkdirSync(path.join(cleanRoot, 'platform'));
  fs.writeFileSync(path.join(cleanRoot, 'platform/codec.ts'), 'export {};\n');
  cleanManifest.generatedEntries.push({ targetPath: 'platform/codec.ts', mode: '755' } as never);
  writeManifest(cleanRoot, cleanManifest);
  expect(collectTaskTopologySourceByTarget({ root: cleanRoot })).toEqual(new Map());
});
