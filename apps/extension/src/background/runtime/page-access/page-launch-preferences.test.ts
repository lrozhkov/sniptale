import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ patch: vi.fn(), generation: vi.fn() }));
vi.mock('../../../composition/persistence/settings', () => ({
  patchPageLaunchCorner: mocks.patch,
}));
vi.mock('../../mutation-exclusion/media-activity', () => ({
  getMediaAuthorityGeneration: mocks.generation,
}));
import { routePageLaunchPreferencesMessage } from './page-launch-preferences';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation.mockReturnValue(1);
});
it('serializes accepted corner commands and reports the committed corner', async () => {
  mocks.patch.mockResolvedValue({ pageLaunch: { corner: 'top-left' } });
  const respond = vi.fn();
  expect(
    routePageLaunchPreferencesMessage(
      { type: 'PAGE_LAUNCH_PREFERENCES', corner: 'top-left' },
      respond
    )
  ).toBe(true);
  await vi.waitFor(() =>
    expect(respond).toHaveBeenCalledWith({ success: true, corner: 'top-left' })
  );
  const guard = mocks.patch.mock.calls[0]![1] as () => boolean;
  expect(guard()).toBe(true);
  mocks.generation.mockReturnValue(2);
  expect(guard()).toBe(false);
});
it('refuses malformed commands without a writer and preserves retry after storage refusal', async () => {
  const respond = vi.fn();
  expect(
    routePageLaunchPreferencesMessage(
      { type: 'PAGE_LAUNCH_PREFERENCES', corner: 'center' },
      respond
    )
  ).toBe(false);
  expect(mocks.patch).not.toHaveBeenCalled();
  mocks.patch.mockRejectedValueOnce(new Error('private storage failure'));
  routePageLaunchPreferencesMessage(
    { type: 'PAGE_LAUNCH_PREFERENCES', corner: 'top-right' },
    respond
  );
  await vi.waitFor(() =>
    expect(respond).toHaveBeenCalledWith({
      success: false,
      error: 'page-launch-preference-write-failed',
    })
  );
  mocks.patch.mockResolvedValueOnce({ pageLaunch: { corner: 'top-right' } });
  routePageLaunchPreferencesMessage(
    { type: 'PAGE_LAUNCH_PREFERENCES', corner: 'top-right' },
    respond
  );
  await vi.waitFor(() =>
    expect(respond).toHaveBeenLastCalledWith({ success: true, corner: 'top-right' })
  );
});
