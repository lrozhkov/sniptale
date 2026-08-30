import { expect, it, vi } from 'vitest';

import { printNpmCommandGateResult } from './npm-command-gate.mjs';

it('prints one shared npm gate result contract for success and failure', () => {
  const stdout = { write: vi.fn() };
  const stderr = { write: vi.fn() };
  const options = { stdout, stderr };

  expect(
    printNpmCommandGateResult(
      'npm audit',
      {
        status: 'passed',
        detail: 'live',
        reportPath: '/repo/results.json',
      },
      options
    )
  ).toBe(0);
  expect(stdout.write).toHaveBeenCalledWith('npm audit: OK (live); report=/repo/results.json\n');

  expect(
    printNpmCommandGateResult(
      'npm audit signatures',
      {
        status: 'failed',
        exitCode: 1,
        output: '{"invalid":[{"name":"bad"}]}',
        reportPath: '/repo/signatures.json',
      },
      options
    )
  ).toBe(1);
  expect(stderr.write.mock.calls.map(([line]) => line).join('')).toBe(
    [
      'npm audit signatures: failed\n',
      'Report: /repo/signatures.json\n',
      '{"invalid":[{"name":"bad"}]}\n',
    ].join('')
  );
});
