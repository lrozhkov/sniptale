import { describe, expect, it, vi } from 'vitest';
import {
  DefaultCaptureSurfaceService,
  getCaptureSurfaceServiceTestMocks,
  priorWindow,
  viewportPreset,
  windowPreset,
} from './service.test-support';

const mocks = getCaptureSurfaceServiceTestMocks();

describe('capture-surface availability', () => {
  it('waits for journal recovery before serving single or batched availability', async () => {
    let resolveJournal!: (entries: []) => void;
    mocks.readJournal.mockReturnValueOnce(
      new Promise<[]>((resolve) => {
        resolveJournal = resolve;
      })
    );
    const service = new DefaultCaptureSurfaceService();

    const single = service.getAvailability({
      tabId: 7,
      presetId: viewportPreset.id,
      context: 'screenshot',
    });
    const batch = service.getAvailabilities({
      tabId: 7,
      presetIds: [viewportPreset.id],
      context: 'screenshot',
    });
    await vi.waitFor(() => expect(mocks.readJournal).toHaveBeenCalledOnce());
    expect(mocks.loadSettings).not.toHaveBeenCalled();

    resolveJournal([]);
    await expect(Promise.all([single, batch])).resolves.toHaveLength(2);
    expect(mocks.loadSettings).toHaveBeenCalledTimes(2);
  });

  it('reports the required and available viewport sizes without scaling', async () => {
    mocks.readViewportCapacity.mockResolvedValueOnce({ width: 1200, height: 700 });
    const service = new DefaultCaptureSurfaceService();

    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toEqual({
      status: 'unavailable',
      presetId: viewportPreset.id,
      reason: 'viewport-too-large',
      target: 'viewport',
      required: { width: 1280, height: 720 },
      available: { width: 1200, height: 700 },
    });
    expect(mocks.readViewportCapacity).toHaveBeenCalledWith(7);
    expect(mocks.prepareViewportSurface).not.toHaveBeenCalled();
  });

  it('evaluates the catalog from one read-only viewport measurement', async () => {
    mocks.loadSettings.mockResolvedValue({
      viewportPresets: [
        { ...viewportPreset, id: 'portrait', width: 768, height: 1024 },
        { ...viewportPreset, id: 'landscape', width: 1024, height: 768 },
        { ...viewportPreset, id: 'hd', width: 1280, height: 720 },
      ],
    });
    mocks.readViewportCapacity.mockResolvedValue({ width: 1365, height: 767 });
    const service = new DefaultCaptureSurfaceService();

    await expect(
      service.getAvailabilities({
        tabId: 7,
        presetIds: ['portrait', 'landscape', 'hd'],
        context: 'screenshot',
      })
    ).resolves.toEqual([
      expect.objectContaining({ status: 'unavailable', reason: 'viewport-too-large' }),
      expect.objectContaining({ status: 'unavailable', reason: 'viewport-too-large' }),
      expect.objectContaining({ status: 'available' }),
    ]);

    expect(mocks.loadSettings).toHaveBeenCalledOnce();
    expect(mocks.getTab).toHaveBeenCalledOnce();
    expect(mocks.readViewportCapacity).toHaveBeenCalledOnce();
    expect(mocks.prepareViewportSurface).not.toHaveBeenCalled();
  });

  it('requires start validation for exact viewport video and blocks non-100% zoom', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'video-tab' })
    ).resolves.toMatchObject({ status: 'requires-start-validation', target: 'viewport' });

    mocks.getTabZoom.mockResolvedValue(1.25);
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'video-tab' })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'zoom-not-100' });
  });

  it('disables presets for screen capture and rejects windows larger than the work area', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(
      service.getAvailability({ tabId: 7, presetId: windowPreset.id, context: 'video-screen' })
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'unsupported-context' });

    mocks.getWindowWorkArea.mockResolvedValue({
      snapshot: priorWindow,
      workArea: { left: -1280, top: 0, width: 1024, height: 700 },
    });
    await expect(
      service.getAvailability({ tabId: 7, presetId: windowPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'window-too-large',
      available: { width: 1024, height: 700 },
    });

    mocks.getWindowWorkArea.mockResolvedValue({
      snapshot: { ...priorWindow, state: 'maximized' },
      workArea: { left: -1280, top: 0, width: 1920, height: 1040 },
    });
    await expect(
      service.getAvailability({ tabId: 7, presetId: windowPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'window-not-normal',
    });
  });

  it('reports missing, disabled, unsupported-tab, and platform failures as typed availability', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(
      service.getAvailability({ tabId: 7, presetId: 'missing', context: 'screenshot' })
    ).resolves.toMatchObject({ reason: 'missing', status: 'unavailable', target: null });

    mocks.loadSettings.mockResolvedValueOnce({
      viewportPresets: [{ ...viewportPreset, enabled: false }],
    });
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ reason: 'disabled', status: 'unavailable' });

    mocks.getTab.mockRejectedValueOnce(new Error('tab closed'));
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ reason: 'unsupported-context', status: 'unavailable' });

    mocks.readViewportCapacity.mockRejectedValueOnce(new Error('metrics rejected'));
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ reason: 'platform-rejected', status: 'unavailable' });

    mocks.getWindowWorkArea.mockRejectedValueOnce(new Error('display rejected'));
    await expect(
      service.getAvailability({ tabId: 7, presetId: windowPreset.id, context: 'screenshot' })
    ).resolves.toMatchObject({ reason: 'platform-rejected', status: 'unavailable' });
  });

  it('reports available viewport and window presets with their exact requirements', async () => {
    const service = new DefaultCaptureSurfaceService();
    await expect(
      service.getAvailability({ tabId: 7, presetId: viewportPreset.id, context: 'screenshot' })
    ).resolves.toEqual({
      status: 'available',
      presetId: viewportPreset.id,
      required: { width: 1280, height: 720 },
      target: 'viewport',
    });
    await expect(
      service.getAvailability({ tabId: 7, presetId: windowPreset.id, context: 'screenshot' })
    ).resolves.toEqual({
      status: 'available',
      presetId: windowPreset.id,
      required: { width: 1280, height: 720 },
      target: 'window',
    });
  });

  it('reads viewport, window, display, and zoom at most once for a mixed video batch', async () => {
    const service = new DefaultCaptureSurfaceService();

    await expect(
      service.getAvailabilities({
        tabId: 7,
        presetIds: [viewportPreset.id, windowPreset.id],
        context: 'video-tab',
      })
    ).resolves.toEqual([
      expect.objectContaining({ status: 'requires-start-validation', target: 'viewport' }),
      expect.objectContaining({ status: 'available', target: 'window' }),
    ]);

    expect(mocks.getTab).toHaveBeenCalledOnce();
    expect(mocks.getTabZoom).toHaveBeenCalledOnce();
    expect(mocks.readViewportCapacity).toHaveBeenCalledOnce();
    expect(mocks.getWindowWorkArea).toHaveBeenCalledOnce();
  });
});
