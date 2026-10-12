import { beforeEach, expect, it, vi } from 'vitest';

import { collectFullCoverageAuditStep } from './audit-coverage-step.mjs';
import { recordSuccessfulFullUnitProof } from '../unit/unit-test-proof.mjs';
import {
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
} from './coverage-proof.mjs';
import { runUnitTests } from '../unit/verify-unit-tests.mjs';

vi.mock('./coverage-proof.mjs', () => ({
  createCoverageProofInputs: vi.fn(() => ({ inputDigest: 'current' })),
  resolveReusableCoverageProof: vi.fn(() => ({ matched: false })),
  materializeReusableCoverageProof: vi.fn(),
  recordSuccessfulCoverageProof: vi.fn(),
}));
vi.mock('../unit/unit-test-proof.mjs', () => ({ recordSuccessfulFullUnitProof: vi.fn() }));
vi.mock('../unit/verify-unit-tests.mjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../unit/verify-unit-tests.mjs')>()),
  resolveProductUnitTestPool: () => null,
  runUnitTests: vi.fn(() => ({ status: 1, stderr: 'test failed', stdout: '' })),
}));

beforeEach(() => vi.clearAllMocks());

it('refreshes unit proof only after admission of coverage with its own threads execution', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({
    matched: true,
    source: 'local proof',
    proof: { proofDigest: 'sealed', fullUnit: { inputDigest: 'executed' } },
    inputs: { inputDigest: 'coverage-current' },
  });
  const result = await collectFullCoverageAuditStep({ maxWorkers: 8 });
  expect(result.status).toBe('ok');
  expect(resolveReusableCoverageProof).toHaveBeenCalledWith({ pool: 'threads' });
  expect(materializeReusableCoverageProof).toHaveBeenCalledOnce();
  expect(recordSuccessfulCoverageProof).toHaveBeenCalledWith({
    pool: 'threads',
    inputs: { inputDigest: 'coverage-current' },
    reusedFrom: 'sealed',
  });
  expect(recordSuccessfulFullUnitProof).toHaveBeenCalledWith(
    expect.objectContaining({
      pool: 'threads',
      expectedInputDigest: 'executed',
      reusedFrom: 'sealed',
      source: 'full-product-coverage',
      suite: 'product',
    })
  );
  expect(runUnitTests).not.toHaveBeenCalled();
});

it('executes threads and issues no receipts for rejected coverage followed by failing tests', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({ matched: false });
  const result = await collectFullCoverageAuditStep({ maxWorkers: 8 });
  expect(result.status).toBe('failed');
  expect(runUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({ pool: 'threads', coverage: true })
  );
  expect(recordSuccessfulCoverageProof).not.toHaveBeenCalled();
  expect(recordSuccessfulFullUnitProof).not.toHaveBeenCalled();
});
