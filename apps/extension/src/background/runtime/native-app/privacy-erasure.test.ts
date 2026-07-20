import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  quiesceForPrivacyErasure: vi.fn(),
}));

vi.mock('./service-singleton', () => ({
  getNativeAppRuntimeService: () => ({
    quiesceForPrivacyErasure: mocks.quiesceForPrivacyErasure,
  }),
}));

import { nativeIngestionPrivacyErasureCleanupAdapter } from './privacy-erasure';

beforeEach(() => {
  vi.clearAllMocks();
});

it('revokes native runtime authority before reporting verified cleanup', async () => {
  await expect(nativeIngestionPrivacyErasureCleanupAdapter.cleanup()).resolves.toEqual([
    {
      id: 'native-ingestion-runtime-state',
      remainingCount: 0,
      severity: 'required',
      status: 'verified-empty',
    },
  ]);
  expect(mocks.quiesceForPrivacyErasure).toHaveBeenCalledOnce();
});
