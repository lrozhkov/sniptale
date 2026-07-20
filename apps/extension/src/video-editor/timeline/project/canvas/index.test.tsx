// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createSceneSelection } from '../../../project/selection/model';
import { ProjectTimelineCanvas } from './';
import type { ProjectTimelineInsertionActions } from '../types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('routes empty track-lane pointer selection through scene selection and seek', () => {
  const onSelectScene = vi.fn();
  const onSelectTrack = vi.fn();
  const seekToClientX = vi.fn();

  const { trackId } = renderCanvas({
    onSelectScene,
    onBeginTrackRangeSelection: () => (event) => {
      onSelectScene();
      seekToClientX(event.clientX);
    },
    onSelectTrack,
    seekToClientX,
  });
  const trackLane = container?.querySelector('[data-track-lane-id]');

  act(() => {
    const pointerEvent = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerEvent, 'clientX', { value: 144 });
    trackLane?.dispatchEvent(pointerEvent);
    trackLane?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 144 }));
  });

  expect(trackId).not.toBeNull();
  expect(seekToClientX).toHaveBeenCalledWith(144);
  expect(onSelectScene).toHaveBeenCalledTimes(1);
  expect(onSelectTrack).not.toHaveBeenCalled();
});

it('keeps root timeline clicks scene-owned for empty-space seeking', () => {
  const onSelectScene = vi.fn();
  const onSeek = vi.fn();

  renderCanvas({
    onSelectScene,
    onSeek,
  });

  act(() => {
    container
      ?.querySelector('.relative.min-w-0.overflow-auto')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 90 }));
  });

  expect(onSelectScene).toHaveBeenCalledTimes(1);
  expect(onSeek).toHaveBeenCalledTimes(1);
});

it('creates a playback range when the ruler is dragged', () => {
  const onBeginRangeSelection = vi.fn();

  renderCanvas({
    onBeginRangeSelection,
  });

  act(() => {
    const pointerEvent = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerEvent, 'clientX', { value: 120 });
    container?.querySelector('.sticky.top-0.z-20')?.dispatchEvent(pointerEvent);
  });

  expect(onBeginRangeSelection).toHaveBeenCalledTimes(1);
});

it('routes empty track-lane pointer ownership through track range selection handlers', () => {
  const onBeginTrackRangeSelection = vi.fn(() => vi.fn());

  renderCanvas({
    onBeginTrackRangeSelection,
  });

  act(() => {
    const pointerEvent = new Event('pointerdown', { bubbles: true });
    container?.querySelector('[data-track-lane-id]')?.dispatchEvent(pointerEvent);
  });

  expect(onBeginTrackRangeSelection).toHaveBeenCalledTimes(1);
});

it('renders ruler loop markers when a playback range is active', () => {
  renderCanvas({
    playbackRange: { start: 1.25, end: 3.5 },
  });

  expect(container?.textContent).toContain('0:01.250');
  expect(container?.textContent).toContain('0:03.500');
});

it('renders the telemetry lane whenever timeline visibility is enabled', () => {
  renderCanvas({
    recordingTelemetry: {
      actionEvents: [],
      captureMode: 'TAB',
      createdAt: 1,
      cursorTrack: null,
      displaySurface: null,
      recordingId: 'recording-1',
      signals: [],
      updatedAt: 2,
      viewport: null,
    },
    telemetryLaneVisible: true,
  });

  expect(container?.textContent).toContain('videoEditor.timeline.telemetryLaneEmpty');

  renderCanvas({
    recordingTelemetry: null,
    telemetryLaneVisible: true,
  });

  expect(container?.textContent).toContain('videoEditor.timeline.telemetryLaneEmpty');
});

it('does not render telemetry empty text when the telemetry lane is hidden', () => {
  renderCanvas({
    recordingTelemetry: null,
    telemetryLaneVisible: false,
  });

  expect(container?.textContent).not.toContain('videoEditor.timeline.telemetryLaneEmpty');
});

function renderCanvas(overrides: {
  onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
  onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  dragGhost?: React.ComponentProps<typeof ProjectTimelineCanvas>['dragGhost'];
  onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSelectScene?: () => void;
  onSelectTrack?: (trackId: string) => void;
  playbackRange?: React.ComponentProps<typeof ProjectTimelineCanvas>['playbackRange'];
  recordingTelemetry?: React.ComponentProps<typeof ProjectTimelineCanvas>['recordingTelemetry'];
  onImportTimelineFile?: ProjectTimelineInsertionActions['onImport'];
  seekToClientX?: (clientX: number) => void;
  telemetryLaneVisible?: boolean;
  onUnsupportedTimelineFileDrop?: () => void;
}) {
  const project = createEmptyVideoProject('Canvas');
  project.baseRecordingId = 'recording-1';
  const canvasProps = createCanvasProps(project, overrides);

  act(() => {
    root?.render(<ProjectTimelineCanvas {...canvasProps} />);
  });

  return {
    project,
    trackId: project.tracks[0]?.id ?? null,
  };
}

function createCanvasProps(
  project: ReturnType<typeof createEmptyVideoProject>,
  overrides: {
    onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
    onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
    dragGhost?: React.ComponentProps<typeof ProjectTimelineCanvas>['dragGhost'];
    onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onSelectScene?: () => void;
    onSelectTrack?: (trackId: string) => void;
    playbackRange?: React.ComponentProps<typeof ProjectTimelineCanvas>['playbackRange'];
    recordingTelemetry?: React.ComponentProps<typeof ProjectTimelineCanvas>['recordingTelemetry'];
    onImportTimelineFile?: ProjectTimelineInsertionActions['onImport'];
    seekToClientX?: (clientX: number) => void;
    telemetryLaneVisible?: boolean;
    onUnsupportedTimelineFileDrop?: () => void;
  }
): React.ComponentProps<typeof ProjectTimelineCanvas> {
  return {
    currentTime: 0,
    dragGhost: overrides.dragGhost ?? null,
    playbackRange: overrides.playbackRange ?? null,
    pixelsPerSecond: 90,
    project,
    recordingTelemetry: overrides.recordingTelemetry ?? null,
    selection: createSceneSelection(),
    hoveredClipId: null,
    selectedClipId: null,
    selectedEffectSelection: null,
    selectedTrackId: null,
    telemetryLaneVisible: overrides.telemetryLaneVisible ?? false,
    timelinePreviews: {},
    seekToClientX: overrides.seekToClientX ?? vi.fn(),
    timelineRef: { current: null },
    timelineWidth: 900,
    tracks: project.tracks,
    ...createCanvasActionProps(overrides),
  };
}

function createCanvasActionProps(overrides: {
  onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
  onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  onImportTimelineFile?: ProjectTimelineInsertionActions['onImport'];
  onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSelectScene?: () => void;
  onSelectTrack?: (trackId: string) => void;
  onUnsupportedTimelineFileDrop?: () => void;
}) {
  return {
    onBeginClipInteraction: vi.fn(),
    onBeginEffectInteraction: vi.fn(),
    onBeginEffectRangeSelection: overrides.onBeginEffectRangeSelection ?? vi.fn(),
    onBeginRangeSelection: overrides.onBeginRangeSelection ?? vi.fn(),
    onBeginTrackRangeSelection: overrides.onBeginTrackRangeSelection ?? (() => vi.fn()),
    onAddMotionRegion: vi.fn(),
    onCloseTrackGap: vi.fn(),
    onImportTimelineFile: overrides.onImportTimelineFile ?? createImportHandlers({}),
    onSeek: overrides.onSeek ?? vi.fn(),
    onSelectActionSegment: vi.fn(),
    onSelectClip: vi.fn(),
    onSelectCursorSegment: vi.fn(),
    onSelectMotionRegion: vi.fn(),
    onSelectObjectTrack: vi.fn(),
    onSelectScene: overrides.onSelectScene ?? vi.fn(),
    onSelectTrack: overrides.onSelectTrack ?? vi.fn(),
    onSelectTransition: vi.fn(),
    onSetHoveredClipId: vi.fn(),
    onTimelinePreviewViewportChange: vi.fn(),
    onResizeActionEvent: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onScroll: vi.fn(),
    onUnsupportedTimelineFileDrop: overrides.onUnsupportedTimelineFileDrop ?? vi.fn(),
  };
}

function createImportHandlers(
  overrides: Partial<ProjectTimelineInsertionActions['onImport']>
): ProjectTimelineInsertionActions['onImport'] {
  return {
    audio: vi.fn(),
    image: vi.fn(),
    video: vi.fn(),
    ...overrides,
  };
}
