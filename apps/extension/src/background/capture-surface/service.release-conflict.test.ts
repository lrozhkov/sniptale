import { describe, expect, it } from 'vitest';
import {
  appliedWindow,
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  request,
  windowPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface release conflict recovery', () => {
  it('retains final-release authority until debugger cleanup succeeds', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    mocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('detach failed'));

    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-impossible' });
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'releasing' });

    await service.release(applied);
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite a manual viewport change made between release attempts', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    mocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('detach failed'));

    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-impossible' });
    mocks.currentViewport.mockResolvedValueOnce({ width: 1111, height: 777 });

    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-conflict' });
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledOnce();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' });
  });

  it('re-observes a conflicted release and cleans up when the surface is already prior', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    mocks.currentViewport.mockResolvedValueOnce({ width: 1111, height: 777 });

    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-conflict' });
    mocks.currentViewport.mockResolvedValueOnce({ width: 1440, height: 900 });
    mocks.restoreViewportSnapshot.mockClear();

    await service.release(applied);

    expect(mocks.currentViewport).toHaveBeenCalledTimes(2);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('abandons an exact conflicted top lease without overwriting a manual window change', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request({ presetId: windowPreset.id }));
    const manuallySelectedBounds = { ...appliedWindow, left: -1200, width: 1180 };
    mocks.getWindowSnapshot.mockResolvedValue(manuallySelectedBounds);

    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-conflict' });
    await service.abandonConflicted(applied);

    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('preserves a nested parent as conflicted when a manually changed video child is abandoned', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    const child = await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: compactViewportPreset.id,
        sessionId: 'recording-1',
      })
    );
    mocks.currentViewport.mockResolvedValueOnce({ width: 1111, height: 777 });
    mocks.restoreViewportSnapshot.mockClear();
    mocks.releaseViewportSurfaceAcquisition.mockClear();

    await expect(service.release(child)).rejects.toMatchObject({ code: 'restore-conflict' });
    await service.abandonConflicted(child);

    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(mocks.releaseViewportSurfaceAcquisition).toHaveBeenCalledWith({
      owner: 'video',
      tabId: 7,
    });
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({
        leaseId: parent.leaseId,
        parentLeaseId: null,
        phase: 'conflict',
      }),
    ]);
  });
});
