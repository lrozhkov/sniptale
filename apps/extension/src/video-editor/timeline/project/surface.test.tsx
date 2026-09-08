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

vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorHistoryController: () => ({
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  }),
  useVideoEditorHeaderController: () => ({
    grid: { magnetEnabled: true, onToggleMagnet: vi.fn() },
    onOpenExportDialog: vi.fn(),
  }),
}));

it('keeps auto-processing out of the top toolbar regardless of base-recording telemetry', () => {
  const project = createProject(
    [createVideoClip({ assetId: 'asset-video', trackId: 'track-video' })],
    [createTrack('track-video', 0)]
  );
  project.baseRecordingId = 'rec-asset-video';

  expect(renderSurface(project, createTelemetry())).not.toContain(
    'videoEditor.timeline.autoTransform'
  );
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
      selection={{ kind: 'scene' }}
      onSeek={vi.fn()}
      onAutoProcessingModalVisibilityChange={vi.fn()}
      autoProcessing={{
        prepare: async () => ({ status: 'stale' }),
        apply: async () => 'stale',
        isCurrent: () => false,
      }}
      currentTime={0}
      isPlaying={false}
      playbackRange={null}
      onSeekToEnd={vi.fn()}
      onSeekToStart={vi.fn()}
      onTogglePlay={vi.fn()}
      onClearPlaybackRange={vi.fn()}
      onStepToNextFrame={vi.fn()}
      onStepToPreviousFrame={vi.fn()}
      canDeleteSelectedClip={false}
      canEditSelectedClip={false}
      canSplitSelectedClip={false}
      fitSelectionDuration={null}
      insertion={createInsertionActions()}
      onDeleteSelectedClip={vi.fn()}
      onDuplicateSelectedClip={vi.fn()}
      onFitProject={vi.fn()}
      onFitSelection={vi.fn()}
      onSplitSelectedClip={vi.fn()}
      onTimelinePreviewSuspendedChange={vi.fn()}
      onZoomChange={vi.fn()}
      panelPrefs={createPanelPrefs()}
      pixelsPerSecond={90}
      project={project}
      recordingTelemetry={[recordingTelemetry]}
      selectedClip={null}
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
    setHideTrackNames: vi.fn(),
    setClipNamesHidden: vi.fn(),
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
