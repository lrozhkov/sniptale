import { expect, it, vi } from 'vitest';

import { discoverWorkflowFiles, validateWorkflows } from './validate-workflows.mjs';

it('discovers every current workflow without a manually maintained file list', () => {
  expect(discoverWorkflowFiles()).toEqual([
    '.github/workflows/_canonical-proof.yml',
    '.github/workflows/pr.yml',
    '.github/workflows/provenance.yml',
    '.github/workflows/release.yml',
    '.github/workflows/selectel-maintenance.yml',
    '.github/workflows/selectel-smoke.yml',
  ]);
});

it('proves the native analyzer contract before checking the repository workflows', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'unexpected key "runz"' })
    .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });

  expect(validateWorkflows({ actionlint: '/locked/actionlint', run })).toHaveLength(6);
  expect(run).toHaveBeenNthCalledWith(
    1,
    '/locked/actionlint',
    [expect.stringMatching(/fixtures\/actionlint\/valid\.yml$/u)],
    expect.objectContaining({ cwd: process.cwd() })
  );
  expect(run).toHaveBeenNthCalledWith(
    2,
    '/locked/actionlint',
    [expect.stringMatching(/fixtures\/actionlint\/invalid\.yml$/u)],
    expect.objectContaining({ cwd: process.cwd() })
  );
  expect(run.mock.calls[2]?.[1]).toEqual(discoverWorkflowFiles());
});

it('fails closed when the invalid smell fixture becomes accepted', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' });
  expect(() => validateWorkflows({ run })).toThrow(/accepted its invalid workflow fixture/u);
});

it('fails closed when a real workflow is invalid', () => {
  const run = vi
    .fn()
    .mockReturnValueOnce({ status: 0, stdout: '', stderr: '' })
    .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'fixture finding' })
    .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'workflow finding' });
  expect(() => validateWorkflows({ run })).toThrow(/repository workflows/u);
});
