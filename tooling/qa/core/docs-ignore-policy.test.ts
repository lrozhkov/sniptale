import { execFileSync } from 'node:child_process';

import { expect, it } from 'vitest';

import { repoRoot } from './shared.mjs';

it('ignores only the root task workspace and keeps nested documentation visible', () => {
  const output = execFileSync(
    process.platform === 'win32' ? 'git.exe' : 'git',
    ['check-ignore', '--no-index', '--stdin'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      input: ['tasks/probe.md', 'docs/tasks/probe.md', 'docs/nested/tasks/probe.md'].join('\n'),
    }
  );

  expect(output.trim().split('\n')).toEqual(['tasks/probe.md']);
});
