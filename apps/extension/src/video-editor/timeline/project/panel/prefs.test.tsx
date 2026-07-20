// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
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
    latestPrefs?.setPanelExpanded(true);
  });
  await act(async () => {
    resolveLoad(createLoadedPrefs({ panelExpanded: false }));
    await Promise.resolve();
  });

  expect(latestPrefs?.prefs.panelExpanded).toBe(true);
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
    panelExpanded: false,
    trackHeightByTrackId: {},
    ...overrides,
  };
}
