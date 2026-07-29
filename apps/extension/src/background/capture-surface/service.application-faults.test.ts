import { describe, expect, it, vi } from 'vitest';
import {
  appliedWindow,
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  priorWindow,
  request,
  viewportPreset,
  windowPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface application fault paths', () => {
  it('fails closed when suspending a cross-target parent cannot restore its prior surface', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('parent restore failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: windowPreset.id }))
    ).rejects.toMatchObject({ code: 'restore-impossible' });

    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: parent.leaseId, phase: 'conflict' }),
    ]);
  });

  it('marks a suspended parent conflicted when rollback cannot resume it', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.restoreViewportSnapshot
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('parent resume failed'));
    mocks.currentViewport
      .mockResolvedValueOnce({ width: viewportPreset.width, height: viewportPreset.height })
      .mockResolvedValueOnce({ width: 1440, height: 900 });
    mocks.prepareWindowSize.mockRejectedValueOnce(new Error('window preparation failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: windowPreset.id }))
    ).rejects.toMatchObject({ code: 'restore-impossible' });

    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: parent.leaseId, phase: 'conflict' }),
    ]);
  });

  it('retains a conflicted journal when mutation rollback also fails', async () => {
    mocks.setViewportSurface.mockRejectedValueOnce(new Error('mutation failed'));
    mocks.currentViewport.mockResolvedValueOnce({
      width: viewportPreset.width,
      height: viewportPreset.height,
    });
    mocks.restoreViewportSnapshot.mockRejectedValueOnce(new Error('rollback failed'));
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'restore-impossible' });
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' });
  });

  it('does not overwrite a manual window resize after commit persistence fails', async () => {
    const manualWindow = { ...appliedWindow, left: -1200, width: 1180 };
    let rejectedCommit = false;
    mocks.writeJournal.mockImplementation(async (entries: Array<{ phase?: string }>) => {
      if (!rejectedCommit && entries.some((entry) => entry.phase === 'applied')) {
        rejectedCommit = true;
        mocks.getWindowSnapshot.mockResolvedValue(manualWindow);
        throw new Error('commit persistence failed');
      }
    });
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request({ presetId: windowPreset.id }))).rejects.toMatchObject({
      code: 'restore-conflict',
    });

    expect(mocks.restoreWindowSnapshot).not.toHaveBeenCalled();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({ phase: 'conflict' });
  });

  it('restores the parent phase in memory when suspension WAL persistence fails', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.writeJournal.mockRejectedValueOnce(new Error('suspension WAL failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: windowPreset.id }))
    ).rejects.toMatchObject({ code: 'platform-rejected' });

    expect(service.getApplied(7)).toEqual(parent);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('does not overwrite a manual viewport change while resuming a suspended parent', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.prepareWindowSize.mockImplementationOnce(async () => {
      mocks.currentViewport.mockResolvedValue({ width: 1111, height: 777 });
      throw new Error('window preparation failed');
    });

    await expect(
      service.replace(request({ generation: 2, presetId: windowPreset.id }))
    ).rejects.toMatchObject({ code: 'restore-conflict' });

    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledOnce();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: parent.leaseId, phase: 'conflict' }),
    ]);
  });

  it('rejects a display-context change between availability and acquisition', async () => {
    mocks.getTab
      .mockResolvedValueOnce({ id: 7, windowId: 3 })
      .mockResolvedValueOnce({ id: 7, windowId: 0 });
    const service = new DefaultCaptureSurfaceService();

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'unsupported-context' });
    expect(mocks.writeJournal).not.toHaveBeenCalled();
  });

  it('rejects mismatched nested viewport and window snapshots before mutation', async () => {
    const viewportService = new DefaultCaptureSurfaceService();
    await viewportService.apply(request());
    const releaseAcquisition = vi.fn().mockResolvedValue(undefined);
    mocks.prepareViewportSurface.mockResolvedValueOnce({
      current: { width: 1111, height: 777 },
      releaseAcquisition,
    });
    await expect(
      viewportService.replace(request({ generation: 2, presetId: compactViewportPreset.id }))
    ).rejects.toMatchObject({ code: 'restore-conflict' });
    expect(releaseAcquisition).toHaveBeenCalledOnce();

    const windowService = new DefaultCaptureSurfaceService();
    await windowService.apply(
      request({ generation: 1, presetId: windowPreset.id, sessionId: 'window-session' })
    );
    mocks.prepareWindowSize.mockResolvedValueOnce({
      prior: { ...priorWindow, width: 1400 },
      expected: appliedWindow,
    });
    await expect(
      windowService.replace(
        request({ generation: 2, presetId: windowPreset.id, sessionId: 'window-session' })
      )
    ).rejects.toMatchObject({ code: 'restore-conflict' });
  });
});
