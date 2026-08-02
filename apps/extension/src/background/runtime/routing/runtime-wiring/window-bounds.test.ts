import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  boundsListener: null as ((window: { id?: number }) => void) | null,
  handleBoundsChanged: vi.fn(),
  hydrateLease: vi.fn(),
  subscribeBoundsChanged: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/windows', () => ({
  browserWindows: { subscribeBoundsChanged: mocks.subscribeBoundsChanged },
}));
vi.mock('../../../media/lifecycle', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/lifecycle')>()),
  ensureActiveVideoRecordingLeaseHydrated: mocks.hydrateLease,
  handleTabRecordingWindowBoundsChanged: mocks.handleBoundsChanged,
}));

import { registerWindowBoundsListener } from './window-bounds';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.boundsListener = null;
  mocks.handleBoundsChanged.mockReturnValue(true);
  mocks.hydrateLease.mockResolvedValue(null);
  mocks.subscribeBoundsChanged.mockImplementation((listener) => {
    mocks.boundsListener = listener;
    return vi.fn();
  });
});

it('routes canonical bounds events and ignores events without a window identity', () => {
  registerWindowBoundsListener();

  mocks.boundsListener?.({});
  mocks.boundsListener?.({ id: 4 });

  expect(mocks.handleBoundsChanged).toHaveBeenCalledOnce();
  expect(mocks.handleBoundsChanged).toHaveBeenCalledWith(4);
  expect(mocks.hydrateLease).not.toHaveBeenCalled();
});

it('hydrates the active recording lease before retrying an initially unhandled event', async () => {
  mocks.handleBoundsChanged.mockReturnValueOnce(false).mockReturnValueOnce(true);
  registerWindowBoundsListener();

  mocks.boundsListener?.({ id: 4 });
  await vi.waitFor(() => expect(mocks.handleBoundsChanged).toHaveBeenCalledTimes(2));

  expect(mocks.hydrateLease).toHaveBeenCalledOnce();
  expect(mocks.handleBoundsChanged).toHaveBeenNthCalledWith(1, 4);
  expect(mocks.handleBoundsChanged).toHaveBeenNthCalledWith(2, 4);
});

it('does not hydrate after active-state processing throws', () => {
  mocks.handleBoundsChanged.mockImplementationOnce(() => {
    throw new Error('active state unavailable');
  });
  registerWindowBoundsListener();

  mocks.boundsListener?.({ id: 4 });

  expect(mocks.handleBoundsChanged).toHaveBeenCalledWith(4);
  expect(mocks.hydrateLease).not.toHaveBeenCalled();
});

it('contains an asynchronous lease hydration failure', async () => {
  mocks.handleBoundsChanged.mockReturnValueOnce(false);
  mocks.hydrateLease.mockRejectedValueOnce(new Error('lease unavailable'));
  registerWindowBoundsListener();

  mocks.boundsListener?.({ id: 4 });
  await vi.waitFor(() => expect(mocks.hydrateLease).toHaveBeenCalledOnce());

  expect(mocks.handleBoundsChanged).toHaveBeenCalledOnce();
});
