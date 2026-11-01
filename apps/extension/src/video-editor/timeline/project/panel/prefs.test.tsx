import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
// @vitest-environment jsdom
import { VideoTrackKind } from '../../../../features/video/project/types';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import type { VideoEditorTrackPanelPrefs } from '../../../persistence/track-panel';
import { useProjectTimelinePanelPrefs } from './prefs';

const { loadPrefsMock, savePrefsMock } = vi.hoisted(() => ({
  loadPrefsMock: vi.fn(),
  savePrefsMock: vi.fn(),
}));

vi.mock('../../../persistence/track-panel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../persistence/track-panel')>();
  return {
    ...actual,
    loadVideoEditorTrackPanelPrefs: loadPrefsMock,
    saveVideoEditorTrackPanelPrefs: savePrefsMock,
  };
});

let root: Root | null = null;
let latestPrefs: ReturnType<typeof useProjectTimelinePanelPrefs> | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  latestPrefs = null;
  root = null;
  vi.clearAllMocks();
});

it('ignores a late initial prefs load after a newer local panel update', async () => {
  let resolveLoad: (prefs: VideoEditorTrackPanelPrefs) => void = () => undefined;
  const project = createEmptyVideoProject('Panel prefs');
  loadPrefsMock.mockReturnValueOnce(
    new Promise<VideoEditorTrackPanelPrefs>((resolve) => {
      resolveLoad = resolve;
    })
  );

  await renderPrefsHarness(project);
  act(() => {
    latestPrefs?.setCompactRows(true);
  });
  await act(async () => {
    resolveLoad(createLoadedPrefs({ compactRows: false }));
    await Promise.resolve();
  });

  expect(latestPrefs?.prefs.compactRows).toBe(true);
});

async function renderPrefsHarness(project: ReturnType<typeof createEmptyVideoProject>) {
  function Harness() {
    latestPrefs = useProjectTimelinePanelPrefs(project);
    return null;
  }

  await act(async () => {
    root = createRoot(document.createElement('div'));
    root.render(<Harness />);
  });
}

function createLoadedPrefs(
  overrides: Partial<VideoEditorTrackPanelPrefs>
): VideoEditorTrackPanelPrefs {
  return {
    collapsedCursorLaneVisible: true,
    collapsedTelemetryLaneVisible: false,
    compactRows: false,
    hideTrackNames: false,
    trackHeightByTrackId: {},
    ...overrides,
  };
}

it('keeps local heights stable while the same tracks are reordered', async () => {
  let project = createEmptyVideoProject('Reorder presentation');
  project.tracks.push(createVideoProjectTrack('Overlay', 2, VideoTrackKind.PRIMARY));
  const firstId = project.tracks[0]!.id;
  loadPrefsMock.mockResolvedValue(createLoadedPrefs({}));
  function Harness() {
    latestPrefs = useProjectTimelinePanelPrefs(project);
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root?.render(<Harness />));
  act(() => latestPrefs?.setTrackHeight(firstId, 2));
  project = { ...project, tracks: [...project.tracks].reverse() };
  await act(async () => root?.render(<Harness />));
  expect(latestPrefs?.prefs.trackHeightByTrackId[firstId]).toBe(2);
  expect(loadPrefsMock).toHaveBeenCalledOnce();
});

it('keeps archived cursor history visible with no inline samples and respects the row preference', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 640,
    height: 360,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
  });
  const clip = project.clips.find((clip) => clip.type === 'VIDEO');
  if (!clip || clip.type !== 'VIDEO' || !clip.sourceInstanceId) throw new Error('Missing source.');
  project.cursorTrack = {
    captureMode: 'embedded-fallback',
    skin: normalizeVideoProjectCursorSkin(undefined),
    samples: [],
    sourceObservations: [
      {
        recordingId: 'recording',
        sourceInstanceId: clip.sourceInstanceId,
        samples: [],
        trajectory: {
          format: 'cursor-trajectory-v1',
          formatVersion: 1,
          algorithm: 'sed-window-v1',
          encoding: 'json-ascii-int-v1',
          trajectoryId: 'a'.repeat(32),
          state: 'complete',
          finalized: true,
          totalBlocks: 100,
          totalRecords: 6002,
          totalSamples: 6000,
          totalBytes: 1000000,
          streamSha256: 'b'.repeat(64),
        },
      },
    ],
  };
  loadPrefsMock.mockResolvedValue(createLoadedPrefs({ collapsedTelemetryLaneVisible: true }));
  await renderPrefsHarness(project);
  expect(latestPrefs?.cursorLaneVisible).toBe(true);
  act(() => latestPrefs?.setCollapsedCursorLaneVisible(false));
  expect(latestPrefs?.cursorLaneVisible).toBe(false);
});
