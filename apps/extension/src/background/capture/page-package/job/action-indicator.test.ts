import { afterEach, expect, it, vi } from 'vitest';

const browserActionMocks = vi.hoisted(() => ({
  openPopup: vi.fn().mockResolvedValue(undefined),
  setIcon: vi.fn().mockResolvedValue(undefined),
  setTitle: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@sniptale/platform/browser/action', () => ({
  browserAction: browserActionMocks,
}));

import {
  restorePagePackageProgressPopup,
  startPagePackageActionIndicator,
} from './action-indicator';
import type { ActivePopupExportJob } from './runtime-state';

function createJob(tabCount: number): ActivePopupExportJob {
  return {
    cancelled: false,
    status: {
      orderedTabs: Array.from({ length: tabCount }, (_, index) => ({
        tabId: index + 1,
        title: `Page ${index + 1}`,
      })),
    },
  } as ActivePopupExportJob;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('animates the main browser action icon and restores it before reopening multi-tab results', async () => {
  vi.useFakeTimers();
  const job = createJob(3);
  job.status.originalActiveTabs = [{ tabId: 17, windowId: 9 }];
  const deps = {
    openPopup: vi.fn().mockResolvedValue(undefined),
    renderFrame: vi.fn(() => ({}) as ImageData),
    setIcon: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  };
  const finish = startPagePackageActionIndicator(job, deps);
  await vi.advanceTimersByTimeAsync(840);

  expect(deps.renderFrame).toHaveBeenCalledTimes(6);
  expect(deps.setIcon).toHaveBeenCalledWith(
    expect.objectContaining({ imageData: expect.anything() })
  );
  const completion = finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(deps.openPopup).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(120);
  await completion;
  expect(deps.setIcon).toHaveBeenLastCalledWith({
    path: { 16: 'icons/icon-16.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  });
  expect(deps.openPopup).toHaveBeenCalledOnce();
  expect(deps.openPopup).toHaveBeenCalledWith({ windowId: 9 });
});

it('keeps a current-tab single page quiet but reopens a single temporary URL result', async () => {
  vi.useFakeTimers();
  const deps = {
    openPopup: vi.fn().mockResolvedValue(undefined),
    renderFrame: vi.fn(() => ({}) as ImageData),
    setIcon: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
  };
  await startPagePackageActionIndicator(createJob(1), deps)();
  expect(deps.setIcon).not.toHaveBeenCalled();

  const temporaryUrlJob = createJob(1);
  temporaryUrlJob.temporaryTabIds = [1];
  const completion = startPagePackageActionIndicator(temporaryUrlJob, deps)();
  await vi.advanceTimersByTimeAsync(120);
  await completion;
  expect(deps.openPopup).toHaveBeenCalledOnce();
  deps.openPopup.mockClear();

  const cancelled = createJob(2);
  cancelled.cancelled = true;
  await restorePagePackageProgressPopup(cancelled, 3);
  await startPagePackageActionIndicator(cancelled, deps)();
  expect(browserActionMocks.openPopup).not.toHaveBeenCalled();
  expect(deps.openPopup).not.toHaveBeenCalled();
});

it('retries popup restoration after the first post-activation open is rejected', async () => {
  vi.useFakeTimers();
  browserActionMocks.openPopup.mockClear();
  browserActionMocks.openPopup
    .mockRejectedValueOnce(new Error('Popup is still closing'))
    .mockResolvedValueOnce(undefined);

  const restoration = restorePagePackageProgressPopup(createJob(2), 3);
  expect(browserActionMocks.openPopup).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(120);
  expect(browserActionMocks.openPopup).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(120);
  await restoration;

  expect(browserActionMocks.openPopup).toHaveBeenNthCalledWith(1, { windowId: 3 });
  expect(browserActionMocks.openPopup).toHaveBeenNthCalledWith(2, { windowId: 3 });
});

it('keeps capture authority independent from action presentation failures', async () => {
  vi.useFakeTimers();
  const job = createJob(2);
  const deps = {
    openPopup: vi.fn().mockRejectedValue(new Error('Popup unavailable')),
    renderFrame: vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('Canvas unavailable');
      })
      .mockReturnValue({} as ImageData),
    setIcon: vi.fn().mockRejectedValue(new Error('Icon unavailable')),
    setTitle: vi.fn().mockRejectedValue(new Error('Title unavailable')),
  };

  const finish = startPagePackageActionIndicator(job, deps);
  await vi.advanceTimersByTimeAsync(420);
  const completion = finish();
  await vi.advanceTimersByTimeAsync(240);
  await expect(completion).resolves.toBeUndefined();
  expect(deps.renderFrame).toHaveBeenCalled();
  expect(deps.openPopup).toHaveBeenCalledTimes(2);
});

it('renders the production action frame through the canonical browser adapter', async () => {
  vi.useFakeTimers();
  browserActionMocks.openPopup.mockClear();
  browserActionMocks.setIcon.mockClear();
  browserActionMocks.setTitle.mockClear();
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn(() => ({}) as ImageData),
    lineCap: 'butt',
    lineWidth: 1,
    stroke: vi.fn(),
    strokeStyle: '',
  };
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return context;
      }
    }
  );

  const finish = startPagePackageActionIndicator(createJob(2));
  await vi.advanceTimersByTimeAsync(1);

  expect(context.arc).toHaveBeenCalled();
  expect(context.getImageData).toHaveBeenCalledTimes(2);
  expect(browserActionMocks.setIcon).toHaveBeenCalledWith({
    imageData: { 16: expect.anything(), 32: expect.anything() },
  });
  const completion = finish();
  await vi.advanceTimersByTimeAsync(120);
  await completion;
  expect(browserActionMocks.openPopup).toHaveBeenCalledOnce();
});
