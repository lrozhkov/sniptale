import { beforeEach, describe, expect, it, vi } from 'vitest';

const { localGetMock, localSetMock } = vi.hoisted(() => ({
  localGetMock: vi.fn(),
  localSetMock: vi.fn(),
}));

vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: localGetMock,
      set: localSetMock,
    },
  },
}));

import {
  loadVideoEditorTrackPanelPrefs,
  saveVideoEditorTrackPanelPrefs,
  type VideoEditorTrackPanelPrefs,
} from './track-panel';

function resetTrackPanelStorageMocks() {
  vi.clearAllMocks();
}

function createTrackPanelPrefs(): VideoEditorTrackPanelPrefs {
  return {
    collapsedCursorLaneVisible: true,
    collapsedTelemetryLaneVisible: true,
    compactRows: true,
    panelExpanded: false,
    trackHeightByTrackId: { 'track-a': 3 },
  };
}

describe('video editor track panel ui-state storage reads', () => {
  beforeEach(resetTrackPanelStorageMocks);

  it('loads project-scoped prefs and drops deleted track height entries', async () => {
    localGetMock.mockResolvedValueOnce({
      'sniptale_video_editor_track_panel_prefs:project-a': {
        collapsedCursorLaneVisible: false,
        panelExpanded: true,
        trackHeightByTrackId: {
          'track-a': 2,
          'track-old': 3,
        },
      },
    });

    await expect(
      loadVideoEditorTrackPanelPrefs('project-a', new Set(['track-a']))
    ).resolves.toEqual({
      collapsedCursorLaneVisible: false,
      collapsedTelemetryLaneVisible: false,
      compactRows: false,
      panelExpanded: true,
      trackHeightByTrackId: {
        'track-a': 2,
      },
    });
  });

  it('falls back to defaults when loading prefs fails', async () => {
    localGetMock.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      loadVideoEditorTrackPanelPrefs('project-a', new Set(['track-a']))
    ).resolves.toEqual({
      collapsedCursorLaneVisible: true,
      collapsedTelemetryLaneVisible: false,
      compactRows: false,
      panelExpanded: false,
      trackHeightByTrackId: {},
    });
  });
});

describe('video editor track panel invalid storage reads', () => {
  beforeEach(resetTrackPanelStorageMocks);

  it('warns and falls back to defaults for invalid stored prefs roots', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localGetMock.mockResolvedValueOnce({
      'sniptale_video_editor_track_panel_prefs:project-a': 'broken-root',
    });

    await expect(
      loadVideoEditorTrackPanelPrefs('project-a', new Set(['track-a']))
    ).resolves.toEqual({
      collapsedCursorLaneVisible: true,
      collapsedTelemetryLaneVisible: false,
      compactRows: false,
      panelExpanded: false,
      trackHeightByTrackId: {},
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[SharedUiStateStorage]',
      'Ignoring invalid video editor track panel prefs root from storage',
      { projectId: 'project-a' }
    );
  });
});

describe('video editor track panel ui-state storage writes', () => {
  beforeEach(resetTrackPanelStorageMocks);

  it('saves project-scoped prefs and keeps storage failures fail-soft', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    localSetMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));

    await expect(
      saveVideoEditorTrackPanelPrefs('project-a', createTrackPanelPrefs())
    ).resolves.toBeUndefined();
    await expect(
      saveVideoEditorTrackPanelPrefs('project-a', {
        collapsedCursorLaneVisible: true,
        collapsedTelemetryLaneVisible: false,
        compactRows: false,
        panelExpanded: true,
        trackHeightByTrackId: {},
      })
    ).resolves.toBeUndefined();

    expect(localSetMock).toHaveBeenNthCalledWith(1, {
      'sniptale_video_editor_track_panel_prefs:project-a': createTrackPanelPrefs(),
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[SharedUiStateStorage]',
      'Failed to save video editor track panel prefs',
      expect.objectContaining({ projectId: 'project-a' })
    );
  });
});
