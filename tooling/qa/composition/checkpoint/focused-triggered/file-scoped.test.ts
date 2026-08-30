import { expect, it, vi } from 'vitest';

import { runFileScopedTriggeredChecks } from './file-scoped.mjs';
import { collectFocusedSecurityDataFiles } from './helpers.mjs';

const STORAGE_POLICY = 'tooling/configs/qa/security-storage-ownership.data.json';

it('expands security policy and analyzer changes to the complete code closure', () => {
  const collectAllCodeFiles = vi.fn(() => [
    'apps/extension/src/background/network/client.ts',
    'packages/runtime-contracts/src/messaging/schema.ts',
  ]);

  expect(
    collectFocusedSecurityDataFiles([STORAGE_POLICY], {
      collectAllCodeFiles,
    })
  ).toEqual([
    'apps/extension/src/background/network/client.ts',
    'packages/runtime-contracts/src/messaging/schema.ts',
  ]);
  expect(collectAllCodeFiles).toHaveBeenCalledTimes(1);
});

it('keeps product security checks diff-aware and ignores unrelated JSON', () => {
  const collectAllCodeFiles = vi.fn(() => ['should-not-be-used.ts']);
  const changedSource = 'apps/extension/src/background/network/client.ts';

  expect(
    collectFocusedSecurityDataFiles([changedSource], {
      collectAllCodeFiles,
    })
  ).toEqual([changedSource]);
  expect(
    collectFocusedSecurityDataFiles(['tooling/configs/qa/unrelated.data.json'], {
      collectAllCodeFiles,
    })
  ).toEqual([]);
  expect(collectAllCodeFiles).not.toHaveBeenCalled();
});

it('executes every security analyzer when its shared policy changes', () => {
  const securityFiles = ['apps/extension/src/background/network/client.ts'];
  const runners = [vi.fn(), vi.fn(), vi.fn(), vi.fn()].map((runner) => {
    runner.mockReturnValue({ files: securityFiles, violations: [] });
    return runner;
  });
  const definitions = [
    ['Secret storage', runners[0], 'Secret storage violations found:'],
    ['Sensitive retention', runners[1], 'Sensitive retention violations found:'],
    ['Fetch ownership', runners[2], 'Fetch ownership violations found:'],
    ['Diagnostic sanitization', runners[3], 'Diagnostic sanitization violations found:'],
  ];
  const collectSecurityFiles = vi.fn(() => securityFiles);

  const steps = runFileScopedTriggeredChecks([STORAGE_POLICY], [], {
    collectSecurityFiles,
    securityDefinitions: definitions,
  });

  expect(collectSecurityFiles).toHaveBeenCalledWith([STORAGE_POLICY]);
  expect(runners.every((runner) => runner.mock.calls.length === 1)).toBe(true);
  expect(runners.every((runner) => runner.mock.calls[0]?.[0]?.files === securityFiles)).toBe(true);
  expect(
    steps
      .filter(({ label }) => definitions.some(([expected]) => expected === label))
      .map(({ label, status }) => [label, status])
  ).toEqual(definitions.map(([label]) => [label, 'ok']));
});
