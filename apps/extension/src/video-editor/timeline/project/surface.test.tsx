import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import {
  createProject,
  createTrack,
  createVideoClip,
} from '../../../features/video/project/timeline/project-meta.test.helpers';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';
import { ProjectTimelineSurface } from './surface';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

it('shows auto-processing only for eligible telemetry on the base recording', () => {
  const project = createProject(
    [createVideoClip({ assetId: 'asset-video', trackId: 'track-video' })],
    [createTrack('track-video', 0)]
  );
  project.baseRecordingId = 'rec-asset-video';

  expect(renderSurface(project, createTelemetry())).toContain('videoEditor.timeline.autoTransform');
  expect(renderSurface(project, createTelemetry({ actionEvents: [] }))).not.toContain(
    'videoEditor.timeline.autoTransform'
  );
  expect(renderSurface(project, createTelemetry({ recordingId: 'stale-recording' }))).not.toContain(
    'videoEditor.timeline.autoTransform'
  );
});

function renderSurface(
  project: ReturnType<typeof createProject>,
  recordingTelemetry: RecordingTelemetryEntry
) {
  return renderToStaticMarkup(
    <ProjectTimelineSurface
      currentTime={0}
      fitSelectionDuration={null}
      insertion={createInsertionActions()}
      isPlaying={false}
      onAutoTransformRecording={vi.fn()}
      onClearPlaybackRange={vi.fn()}
      onDeleteSelectedClip={vi.fn()}
      onDuplicateSelectedClip={vi.fn()}
      onFitProject={vi.fn()}
      onFitSelection={vi.fn()}
      onSeekToStart={vi.fn()}
      onSplitSelectedClip={vi.fn()}
      onTimelinePreviewSuspendedChange={vi.fn()}
      onTogglePlay={vi.fn()}
      onZoomChange={vi.fn()}
      panelPrefs={createPanelPrefs()}
      pixelsPerSecond={90}
      playbackRange={null}
      project={project}
      recordingTelemetry={recordingTelemetry}
      selectedClip={null}
      visibleRangeSeconds={10}
    >
      <div>Timeline</div>
    </ProjectTimelineSurface>
  );
}

function createTelemetry(
  overrides: Partial<RecordingTelemetryEntry> = {}
): RecordingTelemetryEntry {
  return {
    actionEvents: [
      {
        data: {},
        duration: 0.1,
        id: 'click-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 10 },
        preset: 'CLICK_RIPPLE',
        time: 1,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    recordingId: 'rec-asset-video',
    signals: [],
    updatedAt: 2,
    viewport: null,
    ...overrides,
  };
}

function createPanelPrefs() {
  return {
    cursorLaneVisible: false,
    prefs: DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
    setCollapsedCursorLaneVisible: vi.fn(),
    setCollapsedTelemetryLaneVisible: vi.fn(),
    setCompactRows: vi.fn(),
    setPanelExpanded: vi.fn(),
    setTrackHeight: vi.fn(),
    telemetryLaneVisible: false,
  };
}

function createInsertionActions() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddShapeOverlay: vi.fn(),
    onAddTextOverlay: vi.fn(),
    onAddTrack: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImport: { audio: vi.fn(), image: vi.fn(), video: vi.fn() },
    onUnsupportedFileDrop: vi.fn(),
  };
}
