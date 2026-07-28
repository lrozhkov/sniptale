import { describe, expect, it, vi } from 'vitest';
import {
  appliedWindow,
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  journalSnapshots,
  request,
  viewportPreset,
  windowPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface leases and journal', () => {
  it('persists a prepared viewport lease before mutation and restores native size on release', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());

    expect(mocks.writeJournal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.setViewportSurface.mock.invocationCallOrder[0]!
    );
    expect(journalSnapshots[0]?.[0]).toMatchObject({ phase: 'prepared' });
    expect(applied).toMatchObject({ presetId: viewportPreset.id, target: 'viewport' });

    await service.release({
      sessionId: applied.sessionId,
      leaseId: applied.leaseId,
      generation: applied.generation,
    });

    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
      owner: 'screenshot',
      snapshot: { type: 'native', width: 1440, height: 900 },
      tabId: 7,
    });
    expect(service.getApplied(7)).toBeNull();
  });

  it('enforces LIFO for compatible nested viewport leases', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    const child = await service.apply(
      request({ sessionId: 'session-2', presetId: compactViewportPreset.id })
    );

    await expect(
      service.release({
        sessionId: parent.sessionId,
        leaseId: parent.leaseId,
        generation: parent.generation,
      })
    ).rejects.toMatchObject({ code: 'stale-generation' });

    await service.release({
      sessionId: child.sessionId,
      leaseId: child.leaseId,
      generation: child.generation,
    });
    expect(service.getApplied(7)).toEqual(parent);

    await service.release({
      sessionId: parent.sessionId,
      leaseId: parent.leaseId,
      generation: parent.generation,
    });
    expect(service.getApplied(7)).toBeNull();
  });

  it('rejects replacement beneath an active video lease and stale generations', async () => {
    const service = new DefaultCaptureSurfaceService();
    const video = await service.apply(request({ owner: 'video', context: 'video-tab' }));

    await expect(
      service.apply(request({ sessionId: 'session-2', presetId: compactViewportPreset.id }))
    ).rejects.toMatchObject({ code: 'surface-busy' });
    await expect(
      service.release({ sessionId: video.sessionId, leaseId: video.leaseId, generation: 2 })
    ).rejects.toMatchObject({ code: 'stale-generation' });
  });

  it('rejects cross-tab window contention in the same browser window', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request({ presetId: windowPreset.id }));
    mocks.getTab.mockResolvedValue({ id: 8, windowId: 3 });

    await expect(
      service.getAvailability({ tabId: 8, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'surface-busy' });
  });

  it('preserves a manual surface change as a restore conflict', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    mocks.currentViewport.mockResolvedValue({ width: 1111, height: 777 });

    await expect(
      service.release({
        sessionId: applied.sessionId,
        leaseId: applied.leaseId,
        generation: applied.generation,
      })
    ).rejects.toMatchObject({ code: 'restore-conflict' });
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' });
  });

  it('reasserts only the current top viewport generation', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());

    await service.reassert(applied);
    expect(mocks.setViewportSurface).toHaveBeenLastCalledWith({
      height: 720,
      tabId: 7,
      width: 1280,
    });
    await expect(service.reassert({ ...applied, generation: 2 })).rejects.toMatchObject({
      code: 'stale-generation',
    });
    expect(service.getAppliedForSession('session-1')).toEqual(applied);
    expect(service.getAppliedForSession('missing')).toBeNull();
  });

  it('detects window reassert and bounds-change conflicts without overwriting the user', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request({ presetId: windowPreset.id }));
    await service.reassert(applied);

    mocks.getWindowSnapshot.mockResolvedValue({ ...appliedWindow, width: 1200 });
    await expect(service.reassert(applied)).rejects.toMatchObject({ code: 'restore-conflict' });
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();

    const other = new DefaultCaptureSurfaceService();
    mocks.getWindowSnapshot.mockResolvedValue(appliedWindow);
    await other.apply(request({ sessionId: 'session-window-2', presetId: windowPreset.id }));
    mocks.getWindowSnapshot.mockResolvedValue({ ...appliedWindow, left: -1400 });
    const boundsListener = mocks.subscribeBoundsChanged.mock.calls.at(-1)?.[0];
    boundsListener?.({ id: 3 });
    await vi.waitFor(() =>
      expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' })
    );
  });
});
