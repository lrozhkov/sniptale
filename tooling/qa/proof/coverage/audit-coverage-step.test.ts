import { beforeEach, expect, it, vi } from 'vitest';

import { collectFullCoverageAuditStep } from './audit-coverage-step.mjs';
import { recordSuccessfulFullUnitProof } from '../unit/unit-test-proof.mjs';
import {
  createCoverageProofInputs,
  materializeReusableCoverageProof,
  recordSuccessfulCoverageProof,
  resolveReusableCoverageProof,
} from './coverage-proof.mjs';
import { createTempRoot } from '../../test-support/test-helpers';
import {
  readUnitAttemptEvidence,
  runCoverageWithTimeoutRetry,
  writeUnitAttemptEvidence,
} from './coverage-timeout-retry.mjs';

import { writeCanonicalCoverageArtifacts } from './coverage-audit-report.mjs';

vi.mock('./coverage-audit-report.mjs', () => ({
  CANONICAL_COVERAGE_DIRECTORY: '.tmp/coverage/canonical',
  collectCoverageAuditReport: vi.fn(() => ({ error: null })),
  formatCoverageAuditReport: vi.fn(() => 'coverage accepted'),
  writeCanonicalCoverageArtifacts: vi.fn(),
}));

vi.mock('./coverage-timeout-retry.mjs', () => ({
  UNIT_ATTEMPTS_FILE: 'html/unit-attempts.json',
  readUnitAttemptEvidence: vi.fn(() => ({ passedOnAttempt2: true })),
  runCoverageWithTimeoutRetry: vi.fn(() => ({ status: 1, stdout: '', stderr: 'failed' })),
  writeUnitAttemptEvidence: vi.fn(),
}));

vi.mock('./coverage-proof.mjs', () => ({
  createCoverageProofInputs: vi.fn(() => ({
    inputDigest: 'current',
    fullUnit: { inputDigest: 'unit-current' },
  })),
  resolveReusableCoverageProof: vi.fn(() => ({ matched: false })),
  materializeReusableCoverageProof: vi.fn(),
  recordSuccessfulCoverageProof: vi.fn(),
  readVerifiedCoverageReport: vi.fn(() => '{}'),
}));
vi.mock('../unit/unit-test-proof.mjs', () => ({ recordSuccessfulFullUnitProof: vi.fn() }));
vi.mock('../unit/verify-unit-tests.mjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../unit/verify-unit-tests.mjs')>()),
  resolveProductUnitTestPool: () => null,
  runUnitTests: vi.fn(() => ({ status: 1, stderr: 'test failed', stdout: '' })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readUnitAttemptEvidence).mockReturnValue({ passedOnAttempt2: true });
  vi.mocked(createCoverageProofInputs).mockReturnValue({
    inputDigest: 'current',
    fullUnit: { inputDigest: 'unit-current' },
  });
});

it('retains the second-attempt marker when the exact sealed coverage is reused', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({
    matched: true,
    source: 'local proof',
    proof: { proofDigest: 'sealed', fullUnit: { inputDigest: 'executed' } },
    inputs: { inputDigest: 'coverage-current' },
  });
  const result = await collectFullCoverageAuditStep({ maxWorkers: 8 });
  expect(readUnitAttemptEvidence).toHaveBeenCalledOnce();
  expect(result.detail).toContain('passed on attempt 2');
});

it('refreshes unit proof only after admission of coverage with its own threads execution', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({
    matched: true,
    source: 'local proof',
    proof: { proofDigest: 'sealed', fullUnit: { inputDigest: 'executed' } },
    inputs: { inputDigest: 'coverage-current' },
  });
  const result = await collectFullCoverageAuditStep({ maxWorkers: 8 });
  expect(result.status).toBe('ok');
  expect(resolveReusableCoverageProof).toHaveBeenCalledWith({
    cwd: process.cwd(),
    pool: 'threads',
  });
  expect(materializeReusableCoverageProof).toHaveBeenCalledOnce();
  expect(recordSuccessfulCoverageProof).toHaveBeenCalledWith({
    cwd: process.cwd(),
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
  expect(runCoverageWithTimeoutRetry).not.toHaveBeenCalled();
});

it('executes threads and issues no receipts for rejected coverage followed by failing tests', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({ matched: false });
  const result = await collectFullCoverageAuditStep({
    maxWorkers: 8,
    cwd: createTempRoot('audit-retry-'),
  });
  expect(result.status).toBe('failed');
  expect(runCoverageWithTimeoutRetry).toHaveBeenCalledWith(
    expect.objectContaining({ pool: 'threads', expectedInputDigest: 'current' })
  );
  expect(recordSuccessfulCoverageProof).not.toHaveBeenCalled();
  expect(recordSuccessfulFullUnitProof).not.toHaveBeenCalled();
});

it('writes preserved attempts after canonical reports and before sealing both proofs', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({ matched: false });
  vi.mocked(runCoverageWithTimeoutRetry).mockResolvedValueOnce({
    status: 0,
    reportPath: 'merged.json',
    passedOnAttempt2: true,
    stdout: 'first failure plus retry',
    stderr: '',
  });
  const cwd = createTempRoot('audit-publish-');
  const result = await collectFullCoverageAuditStep({ cwd, maxWorkers: 8 });
  expect(result.status).toBe('ok');
  expect(result.detail).toContain('passed on attempt 2');
  expect(result.stdout).toBe('first failure plus retry');
  expect(vi.mocked(writeCanonicalCoverageArtifacts).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(writeUnitAttemptEvidence).mock.invocationCallOrder[0]
  );
  expect(vi.mocked(writeUnitAttemptEvidence).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(recordSuccessfulCoverageProof).mock.invocationCallOrder[0]
  );
  expect(vi.mocked(recordSuccessfulCoverageProof).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(recordSuccessfulFullUnitProof).mock.invocationCallOrder[0]
  );
});

it('refuses publication when the candidate changes after collection', async () => {
  vi.mocked(resolveReusableCoverageProof).mockReturnValue({ matched: false });
  vi.mocked(runCoverageWithTimeoutRetry).mockResolvedValueOnce({
    status: 0,
    reportPath: 'merged.json',
    passedOnAttempt2: false,
    stdout: '',
    stderr: '',
  });
  vi.mocked(createCoverageProofInputs)
    .mockReturnValueOnce({ inputDigest: 'original' })
    .mockReturnValueOnce({ inputDigest: 'changed' });
  const result = await collectFullCoverageAuditStep({ cwd: createTempRoot('audit-changed-') });
  expect(result.status).toBe('failed');
  expect(writeCanonicalCoverageArtifacts).not.toHaveBeenCalled();
  expect(recordSuccessfulCoverageProof).not.toHaveBeenCalled();
});
