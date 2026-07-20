import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { expect, it } from 'vitest';

const RELEASE_BUILD_SHIMS = [
  'tooling/build/shims/readable-stream-browser-empty.cjs',
  'tooling/build/shims/set-immediate-function-only.cjs',
  'tooling/build/shims/zod-jitless.ts',
];

function collectGitVisibleFiles() {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

it('keeps release build shim inputs visible to git review', () => {
  const gitVisibleFiles = new Set(collectGitVisibleFiles());

  for (const shimPath of RELEASE_BUILD_SHIMS) {
    expect(existsSync(shimPath)).toBe(true);
    expect(gitVisibleFiles.has(shimPath)).toBe(true);
  }
});
