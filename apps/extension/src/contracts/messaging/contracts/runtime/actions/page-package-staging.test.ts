import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionPagePackageStagingContracts } from './page-package-staging';
import { MAX_POPUP_EXPORT_JOB_ID_BYTES } from '@sniptale/runtime-contracts/export';

const contract = runtimeActionPagePackageStagingContracts[MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK];

const valid = {
  base64: 'YQ==',
  final: true,
  jobId: 'job-1',
  ordinal: 0,
  sequence: 0,
  stagedBlobId: 'stage-1',
  type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
} as const;

it('accepts only the fixed bounded staging request shape', () => {
  expect(contract.parseRequest(valid)).toEqual(valid);
  expect(
    contract.parseRequest({ ...valid, jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES) })
  ).toMatchObject({ jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES) });
  for (const invalid of [
    { ...valid, unexpected: true },
    { ...valid, base64: 'not canonical!' },
    { ...valid, jobId: '../job' },
    { ...valid, jobId: 'x'.repeat(MAX_POPUP_EXPORT_JOB_ID_BYTES + 1) },
    { ...valid, ordinal: -1 },
    { ...valid, sequence: 2048 },
  ]) {
    expect(() => contract.parseRequest(invalid)).toThrow();
  }
});

it('accepts a successful exact acknowledgement and rejects unbounded fields', () => {
  expect(
    contract.parseResponse({ complete: true, stagedBlobId: 'stage-1', success: true })
  ).toEqual({ complete: true, stagedBlobId: 'stage-1', success: true });
  expect(() => contract.parseResponse({ complete: true, extra: 'no', success: true })).toThrow();
});
