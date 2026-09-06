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
