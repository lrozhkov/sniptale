import { expect, it } from 'vitest';

import { resolvePrePushCommands, resolvePrePushNodeOptions } from './pre-push.mjs';

const LOCAL_SHA = '1234567890123456789012345678901234567890';
const ZERO_SHA = '0000000000000000000000000000000000000000';

it('uses the full release lane for an initial repository push', () => {
  const commands = resolvePrePushCommands({
    prePushInput: `refs/heads/main ${LOCAL_SHA} refs/heads/main ${ZERO_SHA}\n`,
    gitRunner: () => ({ stdout: 'tooling/qa/hooks/pre-push.mjs\n' }),
  });

  expect(commands).toEqual(['qa:release-harness', 'qa:release', 'build:release']);
});

it('gives only a changed-file checkpoint the larger pre-push heap budget', () => {
  expect(resolvePrePushNodeOptions('qa:checkpoint', '--max-old-space-size=1024')).toBe(
    '--max-old-space-size=8192'
  );
  expect(resolvePrePushNodeOptions('qa:release-harness', '--trace-warnings')).toBe(
    '--trace-warnings'
  );
  expect(resolvePrePushNodeOptions('qa:build', '')).toBe('');
});
