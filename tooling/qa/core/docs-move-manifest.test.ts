import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { generateDocsMoveManifest, validateDocsMoveManifest } from './docs-move-manifest.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function write(root: string, path: string, text: string) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

function fixture() {
  const root = join(tmpdir(), `docs-move-${crypto.randomUUID()}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'fixture@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  write(root, 'docs/live/index.md', '[plan](../old/plan.md)\n');
  write(root, 'docs/old/plan.md', '# Plan\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
  return root;
}

function mapping(target = 'docs/deprecated/old/plan.md') {
  return {
    schemaVersion: 1,
    moves: [{ source: 'docs/old/plan.md', target }],
  };
}

it('generates a one-to-one manifest with pre-move consumers and verifies parity', () => {
  const root = fixture();
  const moveMapping = mapping();
  const manifest = generateDocsMoveManifest({ root, tree: 'HEAD', mapping: moveMapping });
  expect(manifest.preMoveConsumers).toEqual([
    expect.objectContaining({ kind: 'markdown-link', path: 'docs/live/index.md' }),
  ]);
  write(
    root,
    moveMapping.moves[0].target,
    readFileSync(join(root, moveMapping.moves[0].source), 'utf8')
  );
  rmSync(join(root, moveMapping.moves[0].source));
  expect(validateDocsMoveManifest(root, manifest)).toContain(
    'stale pre-move consumer: docs/live/index.md -> ../old/plan.md'
  );
  write(root, 'docs/live/index.md', '[plan](../deprecated/old/plan.md)\n');
  expect(validateDocsMoveManifest(root, manifest)).toEqual([]);
});

it('allows only an explicitly justified intentional policy consumer', () => {
  const root = fixture();
  write(root, 'tooling/policy.json', '{"retiredPath":"docs/old/plan.md"}\n');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'policy'], { cwd: root });
  const moveMapping = {
    ...mapping(),
    allowedIntentionalConsumers: [
      {
        path: 'tooling/policy.json',
        literal: 'docs/old/plan.md',
        reason: 'permanent retired-path guard',
      },
    ],
  };
  const manifest = generateDocsMoveManifest({ root, tree: 'HEAD', mapping: moveMapping });
  write(
    root,
    moveMapping.moves[0].target,
    readFileSync(join(root, moveMapping.moves[0].source), 'utf8')
  );
  rmSync(join(root, moveMapping.moves[0].source));
  write(root, 'docs/live/index.md', '[plan](../deprecated/old/plan.md)\n');
  expect(validateDocsMoveManifest(root, manifest)).toEqual([]);
  expect(
    validateDocsMoveManifest(root, {
      ...manifest,
      allowedIntentionalConsumers: [
        { path: 'tooling/policy.json', literal: 'docs/old/plan.md', reason: '' },
      ],
    })
  ).toContain('stale pre-move consumer: tooling/policy.json -> docs/old/plan.md');
});

it('rejects duplicate targets and base-tree or worktree collisions', () => {
  const root = fixture();
  write(root, 'docs/deprecated/old/plan.md', '# Collision\n');
  expect(() =>
    generateDocsMoveManifest({
      root,
      tree: 'HEAD',
      mapping: {
        schemaVersion: 1,
        moves: [
          { source: 'docs/old/plan.md', target: 'docs/deprecated/old/plan.md' },
          { source: 'docs/live/index.md', target: 'docs/deprecated/old/plan.md' },
        ],
      },
    })
  ).toThrow(/not one-to-one/u);
  expect(() =>
    generateDocsMoveManifest({
      root,
      tree: 'HEAD',
      mapping: mapping(),
    })
  ).toThrow(/worktree/u);
  rmSync(join(root, 'docs/deprecated/old/plan.md'));
  expect(() =>
    generateDocsMoveManifest({
      root,
      tree: 'HEAD',
      mapping: mapping('docs/live/index.md'),
    })
  ).toThrow(/collides/u);
});

it('rejects missing targets, changed mechanical files, and stale rollback', () => {
  const root = fixture();
  const manifest = generateDocsMoveManifest({ root, tree: 'HEAD', mapping: mapping() });
  rmSync(join(root, 'docs/old/plan.md'));
  expect(validateDocsMoveManifest(root, manifest)).toContain(
    'move target is missing: docs/deprecated/old/plan.md'
  );
  write(root, 'docs/deprecated/old/plan.md', '# Changed\n');
  expect(validateDocsMoveManifest(root, manifest)).toContain(
    'mechanical move content changed: docs/deprecated/old/plan.md'
  );
  write(root, 'docs/deprecated/old/plan.md', '# Plan\n');
  chmodSync(join(root, 'docs/deprecated/old/plan.md'), 0o755);
  expect(validateDocsMoveManifest(root, manifest)).toContain(
    'mechanical move mode changed: docs/deprecated/old/plan.md'
  );
  expect(validateDocsMoveManifest(root, { ...manifest, rollback: [] })).toContain(
    'docs move rollback is incomplete or stale'
  );
});
