import { expect, it } from 'vitest';

import { resolvePrePushCommands, resolvePrePushNodeOptions } from './pre-push.mjs';

const LOCAL_SHA = '1234567890123456789012345678901234567890';
const ZERO_SHA = '0000000000000000000000000000000000000000';

it('keeps an initial branch push on changed-range proof without a release lane', () => {
  const commands = resolvePrePushCommands({
    prePushInput: `refs/heads/main ${LOCAL_SHA} refs/heads/main ${ZERO_SHA}\n`,
    gitRunner: () => ({ stdout: 'tooling/qa/hooks/pre-push.mjs\n' }),
  });

  expect(commands).toEqual(['qa:checkpoint']);
  expect(commands).not.toContain('qa:release');
  expect(commands).not.toContain('build:release');
});

it('gives only a changed-file checkpoint the larger pre-push heap budget', () => {
  expect(resolvePrePushNodeOptions('qa:checkpoint', '--max-old-space-size=1024')).toBe(
    '--max-old-space-size=8192'
  );
  expect(resolvePrePushNodeOptions('qa:release-harness', '--trace-warnings')).toBe(
    '--trace-warnings'
  );
});
