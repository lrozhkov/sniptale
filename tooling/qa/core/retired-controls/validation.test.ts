import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RETIRED_CONTROLS_POLICY } from './policy.mjs';
import { readVerifiedRegularFile, retiredControlErrors } from './validation.mjs';

const roots: string[] = [];
const policy = {
  schemaVersion: 1,
  retiredPaths: ['tooling/qa/old-control.mjs'],
  retiredPrefixes: ['tooling/qa/old-controls/'],
  requiredPaths: ['tooling/qa/core/current-control.mjs'],
  forbiddenReferences: ['tooling/qa/old-control.mjs'],
};

function write(root: string, path: string, text: string) {
  const output = join(root, path);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, text);
}

function createCandidate() {
  const root = mkdtempSync(join(tmpdir(), 'retired-controls-'));
  roots.push(root);
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  write(root, RETIRED_CONTROLS_POLICY, `${JSON.stringify(policy, null, 2)}\n`);
  write(root, 'tooling/qa/core/current-control.mjs', 'export const current = true;\n');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('retired control policy', () => {
  it('accepts a current tree without predecessor receipts', () => {
    expect(retiredControlErrors(createCandidate())).toEqual([]);
  });

  it('rejects an exact or prefix reintroduction', () => {
    const root = createCandidate();
    write(root, 'tooling/qa/old-controls/reintroduced.mjs', 'export {};\n');
    expect(retiredControlErrors(root)).toContain(
      'retired control was reintroduced: tooling/qa/old-controls/reintroduced.mjs'
    );
  });

  it('rejects a missing permanent replacement', () => {
    const root = createCandidate();
    rmSync(join(root, 'tooling/qa/core/current-control.mjs'));
    expect(retiredControlErrors(root)).toContain(
      'required permanent control is missing: tooling/qa/core/current-control.mjs'
    );
  });

  it('rejects active references to retired authority', () => {
    const root = createCandidate();
    write(
      root,
      'tooling/qa/core/consumer.mjs',
      "export const legacy = 'tooling/qa/old-control.mjs';\n"
    );
    expect(retiredControlErrors(root)).toContain(
      'active control references retired authority: tooling/qa/core/consumer.mjs -> tooling/qa/old-control.mjs'
    );
  });

  it('rejects retired authority references from non-JavaScript tooling', () => {
    const root = createCandidate();
    write(root, 'tooling/backup/legacy-check.sh', '# tooling/qa/old-control.mjs\n');
    expect(retiredControlErrors(root)).toContain(
      'active control references retired authority: tooling/backup/legacy-check.sh -> tooling/qa/old-control.mjs'
    );
  });
});

describe('retired path modes', () => {
  it('rejects a staged dangling symlink at an exact retired path', () => {
    const root = createCandidate();
    const retiredPath = 'tooling/qa/old-control.mjs';
    const absolutePath = join(root, retiredPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    symlinkSync('missing-target.mjs', absolutePath);
    execFileSync('git', ['add', retiredPath], { cwd: root });

    expect(retiredControlErrors(root)).toContain(
      `retired control was reintroduced: ${retiredPath}`
    );
  });
});

describe('verified retired-control reads', () => {
  it('rejects a regular-file replacement after descriptor open', () => {
    const root = createCandidate();
    const target = join(root, 'active.mjs');
    writeFileSync(target, 'original');

    expect(
      readVerifiedRegularFile(target, {
        afterOpen: () => {
          renameSync(target, `${target}.original`);
          writeFileSync(target, 'replacement');
        },
      })
    ).toBeNull();
  });

  it('does not follow a symlink swapped in after descriptor open', () => {
    const root = createCandidate();
    const target = join(root, 'active.mjs');
    const original = `${target}.original`;
    writeFileSync(target, 'original');

    expect(
      readVerifiedRegularFile(target, {
        afterOpen: () => {
          renameSync(target, original);
          symlinkSync(original, target);
        },
      })
    ).toBeNull();
  });
});

describe('verified retired-control reads without no-follow support', () => {
  it('rejects the same symlink swap when no no-follow flag is available', () => {
    const root = createCandidate();
    const target = join(root, 'active.mjs');
    const original = `${target}.original`;
    writeFileSync(target, 'original');

    expect(
      readVerifiedRegularFile(target, {
        noFollowFlag: null,
        afterOpen: () => {
          renameSync(target, original);
          symlinkSync(original, target);
        },
      })
    ).toBeNull();
  });

  it('rejects an existing symlink when no no-follow flag is available', () => {
    const root = createCandidate();
    const target = join(root, 'active.mjs');
    const original = `${target}.original`;
    writeFileSync(original, 'original');
    symlinkSync(original, target);

    expect(readVerifiedRegularFile(target, { noFollowFlag: null })).toBeNull();
  });
});

describe('extensionless retired control references', () => {
  it('rejects retired authority references from a 100755 hook without an extension', () => {
    const root = createCandidate();
    const hookPath = '.husky/pre-commit';
    write(root, hookPath, '# tooling/qa/old-control.mjs\n');
    execFileSync('git', ['add', hookPath], { cwd: root });
    execFileSync('git', ['update-index', '--chmod=+x', hookPath], { cwd: root });

    expect(retiredControlErrors(root)).toContain(
      `active control references retired authority: ${hookPath} -> tooling/qa/old-control.mjs`
    );
  });

  it('rejects retired authority references from an untracked extensionless shebang hook', () => {
    const root = createCandidate();
    const hookPath = '.husky/pre-push';
    write(root, hookPath, '#!/bin/sh\n# tooling/qa/old-control.mjs\n');

    expect(retiredControlErrors(root)).toContain(
      `active control references retired authority: ${hookPath} -> tooling/qa/old-control.mjs`
    );
  });
});
