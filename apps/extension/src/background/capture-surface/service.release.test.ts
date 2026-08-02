import { describe, expect, it, vi } from 'vitest';
import {
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  request,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface terminal cleanup', () => {
  it('releases each cross-owner debugger acquisition in LIFO order', async () => {
    const service = new DefaultCaptureSurfaceService();
    const screenshot = await service.apply(request());
    const video = await service.apply(
      request({
        context: 'video-tab',
        owner: 'video',
        presetId: compactViewportPreset.id,
        sessionId: 'recording-1',
      })
    );
    mocks.releaseViewportSurfaceAcquisition.mockClear();

    await service.release(video);
    expect(mocks.releaseViewportSurfaceAcquisition).toHaveBeenLastCalledWith({
      owner: 'video',
      tabId: 7,
    });
    await service.release(screenshot);
    expect(mocks.releaseViewportSurfaceAcquisition).toHaveBeenLastCalledWith({
      owner: 'screenshot',
      tabId: 7,
    });
  });

  it('atomically discards a suspended screenshot parent beneath a video lease', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    const video = await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: compactViewportPreset.id,
        sessionId: 'recording-1',
      })
    );

    mocks.releaseViewportSurfaceAcquisition.mockClear();
    await service.releaseTabOwners(7, ['screenshot']);
    expect(mocks.releaseViewportSurfaceAcquisition).toHaveBeenCalledWith({
      owner: 'screenshot',
      tabId: 7,
    });
    expect(service.getApplied(7)).toEqual(video);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({
        leaseId: video.leaseId,
        parentLeaseId: null,
        prior: { type: 'native', width: 1440, height: 900 },
      }),
    ]);

    await service.release(video);
    expect(service.getApplied(7)).toBeNull();
  });

  it('releases all top-level leases belonging to an owner', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());

    await service.releaseOwners(['screenshot']);

    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('retains owner leases when their pre-release cleanup is not acknowledged', async () => {
    const beforeRelease = vi.fn().mockRejectedValue(new Error('cursor disable denied'));
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(
      request({ context: 'video-tab', owner: 'video', sessionId: 'recording-1' })
    );
    mocks.restoreViewportSnapshot.mockClear();

    await expect(service.releaseOwners(['video'], { beforeRelease })).rejects.toThrow(
      'cursor disable denied'
    );

    expect(beforeRelease).toHaveBeenCalledWith({
      generation: 1,
      owner: 'video',
      sessionId: 'recording-1',
      tabId: 7,
      target: 'viewport',
    });
    expect(service.getApplied(7)).toEqual(applied);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('transfers a same-owner viewport acquisition back to its nested parent', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    const child = await service.apply(
      request({ sessionId: 'session-2', presetId: compactViewportPreset.id })
    );
    mocks.releaseViewportSurfaceAcquisition.mockClear();

    await service.release(child);

    expect(service.getApplied(7)).toEqual(parent);
    expect(mocks.releaseViewportSurfaceAcquisition).not.toHaveBeenCalled();
    await service.release(parent);
  });

  it('rejects global owner cleanup when its lease is suspended by another owner', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: compactViewportPreset.id,
        sessionId: 'recording-1',
      })
    );

    await expect(service.releaseOwners(['screenshot'])).rejects.toMatchObject({
      code: 'surface-busy',
    });
  });

  it('releases a newly acquired debugger client when exact pre-lease capacity rejects', async () => {
    const releaseAcquisition = vi.fn().mockResolvedValue(undefined);
    mocks.prepareViewportSurface.mockResolvedValueOnce({
      current: { width: 1000, height: 700 },
      releaseAcquisition,
    });
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'viewport-too-large' });
    expect(releaseAcquisition).toHaveBeenCalledOnce();
    expect(mocks.writeJournal).not.toHaveBeenCalled();
  });

  it('fails closed when pre-lease debugger cleanup cannot detach', async () => {
    const releaseAcquisition = vi.fn().mockRejectedValue(new Error('detach failed'));
    mocks.prepareViewportSurface.mockResolvedValueOnce({
      current: { width: 1000, height: 700 },
      releaseAcquisition,
    });
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'platform-rejected' });
    expect(mocks.writeJournal).not.toHaveBeenCalled();
  });

  it('releases a debugger acquired only to confirm an already-restored surface', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    const releaseAcquisition = vi.fn().mockResolvedValue(undefined);
    mocks.prepareViewportSurface.mockResolvedValueOnce({
      current: { width: 1440, height: 900 },
      releaseAcquisition,
    });
    mocks.currentViewport.mockResolvedValueOnce({ width: 1440, height: 900 });
    mocks.restoreViewportSnapshot.mockClear();

    await service.release(applied);

    expect(releaseAcquisition).toHaveBeenCalledOnce();
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(service.getApplied(7)).toBeNull();
  });
});
