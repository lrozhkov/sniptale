import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import { collectRepositoryProfile } from './repository-profile.mjs';

it('discovers installed repository-local skills from their canonical layout', () => {
  const root = createTempRoot('repository-profile-skills-');
  writeFile(root, '.agents/skills/security-code-review/SKILL.md', '# Security review\nRules.\n');
  writeFile(root, '.agents/skills/security-code-review/references/checklist.md', '# Checklist\n');
  writeFile(root, 'docs/agent-tooling/ignored.md', '# Not an installed skill\n');

  const { profile } = collectRepositoryProfile(root, 5);

  expect(profile.repoLocalSkills).toEqual([
    expect.objectContaining({
      path: '.agents/skills/security-code-review/SKILL.md',
      title: 'Security review',
    }),
  ]);
});

it('retains tracked inventory larger than the default child-process output buffer', () => {
  const root = createTempRoot('repository-profile-large-index-');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
    cwd: root,
    input: '',
    encoding: 'utf8',
  }).trim();
  const paths = Array.from(
    { length: 6000 },
    (_, index) => `tracked/${'a'.repeat(180)}/source-${index}.ts`
  );
  expect(Buffer.byteLength(paths.join('\n'))).toBeGreaterThan(1024 * 1024);
  execFileSync('git', ['update-index', '--index-info'], {
    cwd: root,
    input: paths.map((file) => `100644 ${blob}\t${file}\n`).join(''),
  });

  const { profile, trackedFiles } = collectRepositoryProfile(root, 1);

  expect(profile.trackedFileCount).toBe(6000);
  expect(trackedFiles).toEqual(paths.sort());
  expect(profile.topDirectories).toEqual([{ directory: 'tracked', files: 6000 }]);
});
