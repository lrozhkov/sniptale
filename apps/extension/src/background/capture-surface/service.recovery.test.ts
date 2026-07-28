import { describe, expect, it, vi } from 'vitest';
import {
  compactViewportPreset,
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  request,
  viewportPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface recovery', () => {
  function journalEntry(overrides: Record<string, unknown> = {}) {
    return {
      applied: {
        height: 720,
        presetId: viewportPreset.id,
        type: 'viewport' as const,
        width: 1280,
      },
      generation: 3,
      leaseId: 'lease-journal-1',
      owner: 'video' as const,
      parentLeaseId: null,
      phase: 'applied' as const,
      presetId: viewportPreset.id,
      prior: { height: 900, type: 'native' as const, width: 1440 },
      sessionId: 'recording-live',
      tabId: 7,
      target: 'viewport' as const,
      updatedAt: 10,
      version: 1 as const,
      windowId: 3,
      ...overrides,
    };
  }

  it('rehydrates live leases and preserves their generation monotonicity', async () => {
    mocks.readJournal.mockResolvedValue([journalEntry()]);
    const service = new DefaultCaptureSurfaceService();
    await service.recover({ liveSessionIds: new Set(['recording-live']) });

    expect(service.getAppliedForSession('recording-live')).toMatchObject({
      generation: 3,
      leaseId: 'lease-journal-1',
      target: 'viewport',
    });
    await expect(
      service.apply(request({ generation: 3, sessionId: 'recording-live' }))
    ).rejects.toMatchObject({ code: 'stale-generation' });
  });

  it('advances journal revisions beyond hydrated state without trusting the wall clock', async () => {
    const persistedRevision = 10_000;
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1);
    mocks.readJournal.mockResolvedValue([journalEntry({ updatedAt: persistedRevision })]);
    const service = new DefaultCaptureSurfaceService();
    await service.recover({ liveSessionIds: new Set(['recording-live']) });
    const applied = service.getAppliedForSession('recording-live');
    if (!applied) throw new Error('Expected recovered surface');
    mocks.writeJournal.mockClear();

    await service.release(applied);

    const nextRevision = mocks.writeJournal.mock.calls[0]?.[0]?.[0]?.updatedAt;
    dateNow.mockRestore();
    expect(nextRevision).toBeGreaterThan(persistedRevision);
  });

  it('reacquires and retains the recovered viewport debugger client during exact reassertion', async () => {
    mocks.readJournal.mockResolvedValue([journalEntry()]);
    const service = new DefaultCaptureSurfaceService();
    await service.recover({ liveSessionIds: new Set(['recording-live']) });
    const applied = service.getAppliedForSession('recording-live');
    if (!applied) throw new Error('Expected recovered surface');
    mocks.releaseViewportSurfaceAcquisition.mockClear();

    await service.reassert(applied);
    expect(mocks.setViewportSurface).toHaveBeenCalledWith({
      height: 720,
      tabId: 7,
      width: 1280,
    });
    expect(mocks.releaseViewportSurfaceAcquisition).not.toHaveBeenCalled();

    await service.release(applied);
    expect(mocks.releaseViewportSurfaceAcquisition).toHaveBeenCalledWith({
      owner: 'video',
      tabId: 7,
    });
  });

  it('restores abandoned applied leases and retains retryable restore conflicts in the journal', async () => {
    mocks.readJournal.mockResolvedValue([journalEntry()]);
    mocks.currentViewport.mockResolvedValueOnce({ width: 1280, height: 720 });
    const service = new DefaultCaptureSurfaceService();
    await service.recover();
    expect(mocks.restoreViewportSnapshot).toHaveBeenCalledWith({
      owner: 'video',
      snapshot: { height: 900, type: 'native', width: 1440 },
      tabId: 7,
    });
    expect(service.getApplied(7)).toBeNull();

    mocks.readJournal.mockResolvedValue([journalEntry({ leaseId: 'lease-conflict' })]);
    mocks.currentViewport.mockResolvedValueOnce({ width: 1111, height: 777 });
    const conflict = new DefaultCaptureSurfaceService();
    await conflict.recover();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]?.[0]).toMatchObject({
      leaseId: 'lease-conflict',
      phase: 'conflict',
    });
  });

  it('detaches an inspection-only debugger acquisition after prepared-before-mutation recovery', async () => {
    const releaseAcquisition = vi.fn().mockResolvedValue(undefined);
    mocks.readJournal.mockResolvedValue([journalEntry({ phase: 'prepared' })]);
    mocks.prepareViewportSurface.mockResolvedValueOnce({
      current: { width: 1440, height: 900 },
      releaseAcquisition,
    });
    mocks.currentViewport.mockResolvedValueOnce({ width: 1440, height: 900 });
    const service = new DefaultCaptureSurfaceService();

    await service.recover();

    expect(releaseAcquisition).toHaveBeenCalledOnce();
    expect(service.getApplied(7)).toBeNull();
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('reconciles a stale journal before reporting availability', async () => {
    mocks.readJournal.mockResolvedValue([journalEntry({ phase: 'prepared' })]);
    const service = new DefaultCaptureSurfaceService();

    await expect(
      service.getAvailabilities({
        tabId: 7,
        presetIds: [viewportPreset.id],
        context: 'screenshot',
      })
    ).resolves.toHaveLength(1);

    expect(mocks.readJournal).toHaveBeenCalledOnce();
    expect(mocks.prepareViewportSurface).toHaveBeenCalledOnce();
    expect(mocks.restoreViewportSnapshot).not.toHaveBeenCalled();
  });

  it('fails a live child closed and unwinds its stale recovered ancestor in LIFO order', async () => {
    const parent = journalEntry({
      generation: 1,
      leaseId: 'lease-parent',
      owner: 'screenshot',
      sessionId: 'screenshot-stale',
      updatedAt: 10,
    });
    const child = journalEntry({
      applied: {
        height: 640,
        presetId: compactViewportPreset.id,
        type: 'viewport',
        width: 1024,
      },
      leaseId: 'lease-child',
      parentLeaseId: 'lease-parent',
      prior: parent.applied,
      sessionId: 'recording-live',
      updatedAt: 20,
    });
    mocks.readJournal.mockResolvedValue([parent, child]);
    mocks.currentViewport
      .mockResolvedValueOnce({ width: 1024, height: 640 })
      .mockResolvedValueOnce({ width: 1280, height: 720 });
    const service = new DefaultCaptureSurfaceService();

    await service.recover({ liveSessionIds: new Set(['recording-live']) });

    expect(service.getAppliedForSession('recording-live')).toBeNull();
    expect(mocks.restoreViewportSnapshot).toHaveBeenNthCalledWith(1, {
      owner: 'video',
      snapshot: parent.applied,
      tabId: 7,
    });
    expect(mocks.restoreViewportSnapshot).toHaveBeenNthCalledWith(2, {
      owner: 'screenshot',
      snapshot: parent.prior,
      tabId: 7,
    });
    expect(mocks.writeJournal.mock.calls.at(-1)?.[0]).toEqual([]);
  });
});
