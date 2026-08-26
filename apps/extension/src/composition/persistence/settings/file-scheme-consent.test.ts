import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: { get: getMock, set: setMock },
  },
}));

beforeEach(() => {
  getMock.mockReset().mockResolvedValue({});
  setMock.mockReset().mockResolvedValue(undefined);
});

it('persists only the dedicated local-file opt-in boolean', async () => {
  const { hasLocalFileAccessOptIn, setLocalFileAccessOptIn } =
    await import('./file-scheme-consent');
  getMock.mockResolvedValue({ sniptale_page_access_local_file_opt_in: true });

  await expect(hasLocalFileAccessOptIn()).resolves.toBe(true);
  await setLocalFileAccessOptIn(false);

  expect(getMock).toHaveBeenCalledWith(['sniptale_page_access_local_file_opt_in']);
  expect(setMock).toHaveBeenCalledWith({ sniptale_page_access_local_file_opt_in: false });
});

it('defaults to disabled for missing or malformed stored values', async () => {
  const { hasLocalFileAccessOptIn } = await import('./file-scheme-consent');
  getMock.mockResolvedValue({ sniptale_page_access_local_file_opt_in: 'true' });

  await expect(hasLocalFileAccessOptIn()).resolves.toBe(false);
});
