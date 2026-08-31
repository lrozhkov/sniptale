import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendRuntimeMessage: vi.fn() }));

vi.mock('../../platform/runtime-services/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-services/services')>()),
  getContentRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage },
  }),
}));

import { clearWebSnapshotSaveProgress, publishWebSnapshotSaveProgress } from './progress';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendRuntimeMessage.mockResolvedValue(undefined);
  clearWebSnapshotSaveProgress('job-1');
});

it('publishes only the transition and completion for each producer step', async () => {
  publishWebSnapshotSaveProgress('job-1', {
    activeStepKey: 'webSnapshotAssets',
    current: 0,
    total: 1_000,
  });
  for (let current = 1; current < 1_000; current += 1) {
    publishWebSnapshotSaveProgress('job-1', {
      activeStepKey: 'webSnapshotAssets',
      current,
      total: 1_000,
    });
  }
  publishWebSnapshotSaveProgress('job-1', {
    activeStepKey: 'webSnapshotAssets',
    current: 1_000,
    total: 1_000,
  });

  await vi.waitFor(() => expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(2));
  expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      activeStepKey: 'webSnapshotAssets',
      current: 1_000,
      requestId: 'job-1',
    })
  );
});

it('starts a fresh publication lifecycle after cleanup', async () => {
  const update = { activeStepKey: 'files' as const, current: 0, total: 10 };
  publishWebSnapshotSaveProgress('job-1', update);
  publishWebSnapshotSaveProgress('job-1', update);
  clearWebSnapshotSaveProgress('job-1');
  publishWebSnapshotSaveProgress('job-1', update);

  await vi.waitFor(() => expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(2));
});

it('keeps producer transitions ordered while an earlier runtime message is pending', async () => {
  let releaseFirst!: () => void;
  mocks.sendRuntimeMessage.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve;
      })
  );

  publishWebSnapshotSaveProgress('job-1', {
    activeStepKey: 'webSnapshotPreview',
    current: 0,
    total: 4,
  });
  publishWebSnapshotSaveProgress('job-1', {
    activeStepKey: 'webSnapshotDom',
    current: 1,
    total: 4,
  });
  publishWebSnapshotSaveProgress('job-1', {
    activeStepKey: 'json',
    current: 0,
    total: 1,
  });

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledOnce();
  releaseFirst();
  await vi.waitFor(() => expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(3));
  expect(mocks.sendRuntimeMessage.mock.calls.map(([message]) => message.activeStepKey)).toEqual([
    'webSnapshotPreview',
    'webSnapshotDom',
    'json',
  ]);
});
