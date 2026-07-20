import { beforeEach, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock('./browser-storage', () => ({
  browserStorage: { local: { get: getMock } },
}));

import { loadStoredBooleanFlag } from './ui-state-storage';

beforeEach(() => vi.clearAllMocks());

it('loads validated flags and reports invalid persisted values', async () => {
  const reportInvalid = vi.fn();
  getMock.mockResolvedValueOnce({ preference: true }).mockResolvedValueOnce({ preference: 'true' });

  await expect(
    loadStoredBooleanFlag({
      failureMode: 'throw',
      reportInvalid,
      storageKey: 'preference',
    })
  ).resolves.toBe(true);
  await expect(
    loadStoredBooleanFlag({
      failureMode: 'throw',
      reportInvalid,
      storageKey: 'preference',
    })
  ).resolves.toBe(false);
  expect(reportInvalid).toHaveBeenCalledWith('preference');
});

it('applies the explicit storage read failure mode', async () => {
  getMock.mockRejectedValue(new Error('unavailable'));

  await expect(
    loadStoredBooleanFlag({
      failureMode: 'return-false',
      reportInvalid: vi.fn(),
      storageKey: 'preference',
    })
  ).resolves.toBe(false);
  await expect(
    loadStoredBooleanFlag({
      failureMode: 'throw',
      reportInvalid: vi.fn(),
      storageKey: 'preference',
    })
  ).rejects.toThrow('unavailable');
});
