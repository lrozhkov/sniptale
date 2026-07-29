import { describe, expect, it } from 'vitest';
import {
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  journalSnapshots,
  priorWindow,
  request,
  viewportPreset,
  windowPreset,
} from './service.test-support';
import { CaptureSurfaceMutationError } from './types';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface rollback and terminal cleanup', () => {
  it('rolls back a failed viewport mutation and restores a successful window lease', async () => {
    const failed = new DefaultCaptureSurfaceService();
    mocks.setViewportSurface.mockRejectedValueOnce(new Error('mutation failed'));
    await expect(failed.apply(request())).rejects.toMatchObject({ code: 'platform-rejected' });
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
    expect(failed.getApplied(7)).toBeNull();

    const service = new DefaultCaptureSurfaceService();
    const applied = await service.apply(
      request({ sessionId: 'session-window', presetId: windowPreset.id })
    );
    await service.release(applied);
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(service.getApplied(7)).toBeNull();
  });

  it('collapses a successful replacement and preserves the original native rollback point', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    const replacement = await service.replace(
      request({ generation: 2, presetId: compactViewportPreset.id })
    );

    expect(service.getApplied(7)).toEqual(replacement);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toHaveLength(1);
    mocks.currentViewport.mockResolvedValueOnce({ width: 1024, height: 640 });
    await service.release(replacement);
    expect(mocks.restoreViewportSnapshot).toHaveBeenLastCalledWith({
      owner: 'screenshot',
      snapshot: { type: 'native', width: 1440, height: 900 },
      tabId: 7,
    });
  });

  it('restores the working parent when replacement mutation fails', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.setViewportSurface.mockRejectedValueOnce(new Error('replacement failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: compactViewportPreset.id }))
    ).rejects.toMatchObject({ code: 'platform-rejected' });
    expect(service.getApplied(7)).toEqual(parent);
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('restores the working parent from an observed viewport intermediate', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    const observed = {
      type: 'viewport' as const,
      presetId: 'uncommitted',
      width: 1000,
      height: 700,
    };
    mocks.setViewportSurface.mockRejectedValueOnce(
      new CaptureSurfaceMutationError('verification-failed', observed)
    );
    mocks.currentViewport.mockResolvedValueOnce({ width: 1000, height: 700 });

    await expect(
      service.replace(request({ generation: 2, presetId: compactViewportPreset.id }))
    ).rejects.toMatchObject({ code: 'verification-failed' });

    expect(service.getApplied(7)).toEqual(parent);
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
      owner: 'screenshot',
      snapshot: expect.objectContaining({ presetId: viewportPreset.id }),
      tabId: 7,
    });
  });

  it('restores prior window state from an owned normalized or clamped intermediate', async () => {
    const service = new DefaultCaptureSurfaceService();
    const intermediate = { ...priorWindow, state: 'normal' as const, width: 1279, height: 720 };
    mocks.applyPreparedWindowSize.mockRejectedValueOnce(
      new CaptureSurfaceMutationError('verification-failed', intermediate)
    );
    mocks.getWindowSnapshot.mockResolvedValueOnce(intermediate);

    await expect(
      service.apply(request({ presetId: windowPreset.id, sessionId: 'window-failure' }))
    ).rejects.toMatchObject({ code: 'verification-failed' });

    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('keeps the parent and generation retryable when replacement commit persistence fails', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.writeJournal
      .mockImplementationOnce(async (entries: unknown[]) => {
        journalSnapshots.push(structuredClone(entries));
      })
      .mockRejectedValueOnce(new Error('replacement commit failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: compactViewportPreset.id }))
    ).rejects.toMatchObject({ code: 'platform-rejected' });
    expect(service.getApplied(7)).toEqual(parent);

    const retried = await service.replace(
      request({ generation: 2, presetId: compactViewportPreset.id })
    );
    expect(service.getApplied(7)).toEqual(retried);
  });

  it('does not consume an ordinary apply generation when commit persistence fails', async () => {
    const service = new DefaultCaptureSurfaceService();
    mocks.writeJournal.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('commit'));

    await expect(service.apply(request())).rejects.toMatchObject({ code: 'platform-rejected' });
    await expect(service.apply(request())).resolves.toMatchObject({ generation: 1 });
  });

  it('collapses cross-target selector replacement after restoring the previous target', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());

    const replacement = await service.replace(
      request({ generation: 2, presetId: windowPreset.id })
    );
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
      owner: 'screenshot',
      snapshot: { type: 'native', width: 1440, height: 900 },
      tabId: 7,
    });
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toHaveLength(1);

    await service.release(replacement);
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledOnce();
  });

  it('restores the exact parent snapshot when a cross-target mutation fails', async () => {
    const service = new DefaultCaptureSurfaceService();
    const parent = await service.apply(request());
    mocks.applyPreparedWindowSize.mockRejectedValueOnce(new Error('window mutation failed'));

    await expect(
      service.replace(request({ generation: 2, presetId: windowPreset.id }))
    ).rejects.toMatchObject({ code: 'platform-rejected' });

    expect(service.getApplied(7)).toEqual(parent);
    expect(mocks.restoreViewportSnapshot).toHaveBeenLastCalledWith({
      owner: 'screenshot',
      snapshot: expect.objectContaining({ presetId: viewportPreset.id, type: 'viewport' }),
      tabId: 7,
    });
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: parent.leaseId, phase: 'applied' }),
    ]);
  });

  it('keeps repeated viewport-window-viewport selector switches as one releaseable lease', async () => {
    const service = new DefaultCaptureSurfaceService();
    await service.apply(request());
    await service.replace(request({ generation: 2, presetId: windowPreset.id }));
    const final = await service.replace(
      request({ generation: 3, presetId: compactViewportPreset.id })
    );

    expect(service.getApplied(7)).toEqual(final);
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toHaveLength(1);
    await service.release(final);

    expect(service.getApplied(7)).toBeNull();
    expect(mocks.restoreWindowSnapshot).toHaveBeenCalledWith(3, priorWindow);
    expect(mocks.restoreViewportSnapshot).toHaveBeenLastCalledWith({
      owner: 'screenshot',
      snapshot: { type: 'native', width: 1440, height: 900 },
      tabId: 7,
    });
  });

  it('normalizes viewport-window-viewport nesting before persisting and resumes the grandparent', async () => {
    const service = new DefaultCaptureSurfaceService();
    const root = await service.apply(request());
    await service.apply(
      request({ generation: 2, presetId: windowPreset.id, sessionId: 'nested-window' })
    );
    const replacement = await service.replace(
      request({ generation: 3, presetId: compactViewportPreset.id, sessionId: 'nested-window' })
    );

    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([
      expect.objectContaining({ leaseId: root.leaseId, phase: 'suspended' }),
      expect.objectContaining({
        leaseId: replacement.leaseId,
        parentLeaseId: root.leaseId,
        prior: expect.objectContaining({
          type: 'viewport',
          presetId: viewportPreset.id,
          width: viewportPreset.width,
          height: viewportPreset.height,
        }),
      }),
    ]);

    await service.release(replacement);
    expect(service.getApplied(7)).toEqual(root);
    expect(mocks.restoreViewportSnapshot).toHaveBeenLastCalledWith({
      owner: 'screenshot',
      snapshot: expect.objectContaining({ presetId: viewportPreset.id, type: 'viewport' }),
      tabId: 7,
    });

    await service.release(root);
    expect(service.getApplied(7)).toBeNull();
  });
});
