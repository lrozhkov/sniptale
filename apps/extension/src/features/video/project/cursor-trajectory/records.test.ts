import { expect, it } from 'vitest';
import { isCursorTrajectoryDescriptor } from './records';
import type { CursorTrajectoryDescriptor } from './types';

const descriptor: CursorTrajectoryDescriptor = {
  format: 'cursor-trajectory-v1',
  formatVersion: 1,
  algorithm: 'sed-window-v1',
  encoding: 'json-ascii-int-v1',
  trajectoryId: 'a'.repeat(32),
  state: 'complete',
  finalized: true,
  totalBlocks: 1,
  totalRecords: 3,
  totalSamples: 1,
  totalBytes: 1000,
  streamSha256: 'b'.repeat(64),
};
it('refuses impossible descriptor totals that Rust rejects before a durable receipt', () => {
  expect(isCursorTrajectoryDescriptor(descriptor)).toBe(true);
  for (const patch of [
    { totalRecords: 0, totalSamples: 0 },
    { totalRecords: 513 },
    { totalBytes: 0 },
    { totalBytes: 65537 },
    { totalBlocks: 0, totalRecords: 0, totalSamples: 0, totalBytes: 0 },
  ])
    expect(isCursorTrajectoryDescriptor({ ...descriptor, ...patch })).toBe(false);
  expect(
    isCursorTrajectoryDescriptor({
      ...descriptor,
      totalBlocks: 0,
      totalRecords: 0,
      totalSamples: 0,
      totalBytes: 0,
      streamSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    })
  ).toBe(true);
});
