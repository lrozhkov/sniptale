import { describe, expect, it } from 'vitest';
import {
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  priorWindow,
  request,
  viewportPreset,
  windowPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface closed-tab cleanup', () => {
  it('abandons screenshot viewport authority after a forceful debugger detach', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    mocks.restoreViewportSnapshot.mockClear();

    await expect(service.handleDebuggerDetach(7)).resolves.toEqual(['screenshot']);

    expect(mocks.acknowledgeClosedViewportTab).toHaveBeenCalledWith(7);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('retains a video viewport lease for terminal reassertion after debugger detach', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(
      request({ context: 'video-tab', owner: 'video', sessionId: 'recording-1' })
    );

    await expect(service.handleDebuggerDetach(7)).resolves.toEqual([]);
    expect(service.getApplied(7)).toEqual(applied);
  });

  it('restores surviving window state and abandons closed-tab viewport state explicitly', async () => {
    const windowService = new DefaultCaptureSurfaceService();
    await windowService.apply(request({ presetId: windowPreset.id }));
    await windowService.terminateClosedTab(7, ['screenshot']);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(windowService.getApplied(7)).toBeNull();

    const viewportService = new DefaultCaptureSurfaceService();
    await viewportService.apply(request({ sessionId: 'closed-viewport' }));
    mocks.restoreViewportSnapshot.mockClear();
    await viewportService.terminateClosedTab(7, ['screenshot']);
    expect(mocks.acknowledgeClosedViewportTab).toHaveBeenCalledWith(7);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(viewportService.getApplied(7)).toBeNull();
  });

  it('unwinds a mixed-target closed-tab stack without reattaching its viewport parent', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: windowPreset.id,
        sessionId: 'recording-window',
      })
    );
    mocks.restoreViewportSnapshot.mockClear();

    await service.terminateClosedTab(7, ['video']);

    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(service.getApplied(7)).toBeNull();

    await service.terminateClosedTab(7, ['screenshot']);
    expect(mocks.acknowledgeClosedViewportTab).toHaveBeenCalledWith(7);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('rejects closed-tab cleanup when the requested owner is suspended', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: windowPreset.id,
        sessionId: 'recording-window',
      })
    );

    await expect(service.terminateClosedTab(7, ['screenshot'])).rejects.toMatchObject({
      code: 'surface-busy',
    });
  });

  it('marks a closed window lease conflicted instead of overwriting manual bounds', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request({ presetId: windowPreset.id }));
    mocks.getWindowSnapshot.mockResolvedValueOnce({
      ...priorWindow,
      width: 1111,
      height: 777,
    });

    await expect(service.terminateClosedTab(7, ['screenshot'])).rejects.toMatchObject({
      code: 'restore-conflict',
    });
    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
  });

  it('discards a suspended viewport after debugger detach and retains its window child', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    const window = await service.apply(
      request({
        context: 'video-tab',
        generation: 1,
        owner: 'video',
        presetId: windowPreset.id,
        sessionId: 'recording-window',
      })
    );

    await expect(service.handleDebuggerDetach(7)).resolves.toEqual(['screenshot']);
    expect(service.getApplied(7)).toEqual(window);
  });

  it('does not let a conflicted lease block an unrelated window', async () => {
    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(request());
    mocks.currentViewport.mockResolvedValueOnce({ width: 1111, height: 777 });
    await expect(service.release(applied)).rejects.toMatchObject({ code: 'restore-conflict' });
    mocks.getTab.mockResolvedValueOnce({ id: 8, windowId: 4 });

    await expect(
      service.getAvailability({ tabId: 8, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ status: 'available' });
  });

  it('normalizes stale and invalid generation requests before mutation', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(service.apply(request({ generation: 0.5 }))).rejects.toMatchObject({
      code: 'stale-generation',
    });
    const applied = await service.apply(request());
    await service.release(applied);
    await expect(service.apply(request())).rejects.toMatchObject({ code: 'stale-generation' });
  });
});
