// @vitest-environment jsdom
import { createTimelineProjection } from '../interaction-state/projection';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectFromRecording,
} from '../../../../features/video/project/factories/creation';
import { createVideoProjectMotionRegion } from '../../../../features/video/project/motion';
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

it('adds and removes utility rows and playhead height with authored data', () => {
  const project = createEmptyVideoProject('Contextual rows');
  const render = () =>
    act(() =>
      root?.render(<ProjectTimelineCanvas {...createCanvasProps(project, { snapGuideTime: 1 })} />)
    );
  render();
  expect(container?.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(0);
  const line = () =>
    container?.querySelector<HTMLElement>('[data-ui="video-editor.timeline.snap-guide"]');
  const emptyHeight = line()?.style.height;
  project.motionRegions = [createVideoProjectMotionRegion(project, 12)];
  project.utilityLanes = {
    actions: { visible: true, locked: false },
    camera: { visible: false, locked: true },
  };
  render();
  expect(container?.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(1);
  expect(parseFloat(line()?.style.height ?? '0')).toBe(parseFloat(emptyHeight ?? '0') + 46);
  project.motionRegions = [];
  render();
  expect(container?.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(0);
  expect(line()?.style.height).toBe(emptyHeight);
  project.utilityLanes.camera = { visible: true, locked: false };
  render();
  expect(container?.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(0);
  expect(line()?.style.height).toBe(emptyHeight);
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

it('consumes the synthetic canvas click that follows a completed playhead scrub', () => {
  const onSelectScene = vi.fn();
  const onSeek = vi.fn();
  renderCanvas({ consumeCompletedScrubClick: () => true, onSelectScene, onSeek });

  act(() => {
    container
      ?.querySelector('.relative.min-w-0.overflow-auto')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 90 }));
  });

  expect(onSelectScene).not.toHaveBeenCalled();
  expect(onSeek).not.toHaveBeenCalled();
});

it('creates a playback range when the ruler is dragged', () => {
  const onBeginRangeSelection = vi.fn();

  renderCanvas({
    onBeginRangeSelection,
  });

  act(() => {
    const pointerEvent = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(pointerEvent, 'clientX', { value: 120 });
    container
      ?.querySelector('[data-ui="video-editor.timeline.ruler"]')
      ?.dispatchEvent(pointerEvent);
  });

  expect(onBeginRangeSelection).toHaveBeenCalledTimes(1);
});

it('renders a dedicated accessible playhead scrub handle', () => {
  renderCanvas({});

  const handle = container?.querySelector('[data-ui="video-editor.timeline.playhead-handle"]');
  expect(handle).not.toBeNull();
  expect(handle?.getAttribute('role')).toBe('slider');
  expect(handle?.getAttribute('aria-label')).toBe('videoEditor.timeline.playhead');
  expect(handle?.getAttribute('aria-valuetext')).toBe('0:00.000');
});

it('keeps the playhead handle inside the sticky ruler while tracks scroll vertically', () => {
  renderCanvas({});

  const handle = container?.querySelector('[data-ui="video-editor.timeline.playhead-handle"]');
  const stickyRuler = container?.querySelector('[data-ui="video-editor.timeline.ruler"]');

  expect(stickyRuler).not.toBeNull();
  expect(stickyRuler?.contains(handle ?? null)).toBe(true);
});

it('renders the active magnetic snap guide at the accepted timeline target', () => {
  renderCanvas({ snapGuideTime: 2 });

  const guide = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.snap-guide"]'
  );
  expect(guide?.style.left).toBe('180px');
  expect(guide?.getAttribute('aria-hidden')).toBe('true');
});

it('routes slider arrow keys through frame-step actions', () => {
  const onStepToNextFrame = vi.fn();
  const onStepToPreviousFrame = vi.fn();
  renderCanvas({ onStepToNextFrame, onStepToPreviousFrame });
  const handle = container?.querySelector('[data-ui="video-editor.timeline.playhead-handle"]');

  act(() => {
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }));
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }));
    handle?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowUp' }));
  });

  expect(onStepToPreviousFrame).toHaveBeenCalledTimes(2);
  expect(onStepToNextFrame).toHaveBeenCalledTimes(2);
});

it('gives playhead pointer ownership to scrubbing instead of ruler selection', () => {
  const onBeginPlayheadScrub = vi.fn((event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  });
  const onBeginRangeSelection = vi.fn();
  const onSelectScene = vi.fn();
  renderCanvas({ onBeginPlayheadScrub, onBeginRangeSelection, onSelectScene });

  const event = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clientX', { value: 120 });
  act(() => {
    container
      ?.querySelector('[data-ui="video-editor.timeline.playhead-handle"]')
      ?.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(true);
  expect(onBeginPlayheadScrub).toHaveBeenCalledTimes(1);
  expect(onBeginRangeSelection).not.toHaveBeenCalled();
  expect(onSelectScene).not.toHaveBeenCalled();
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

it('renders the history lane with and without a telemetry sidecar', () => {
  renderCanvas({
    recordingTelemetry: [
      {
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
    ],
    telemetryLaneVisible: true,
  });

  expect(container?.textContent).toContain('videoEditor.timeline.telemetryLaneEmpty');

  renderCanvas({
    recordingTelemetry: [],
    telemetryLaneVisible: true,
  });

  expect(container?.textContent).toContain('videoEditor.timeline.telemetryLaneEmpty');
  expect(
    container?.querySelector<HTMLElement>('[data-ui="video-editor.timeline.history-row"]')?.style
      .height
  ).toBe('56px');
});

it('counts one history row in playhead height independently of authored action count', () => {
  const project = createEmptyVideoProject('History height');
  const render = (visible: boolean) =>
    act(() =>
      root?.render(
        <ProjectTimelineCanvas
          {...createCanvasProps(project, { snapGuideTime: 1, telemetryLaneVisible: visible })}
        />
      )
    );
  const height = () =>
    parseFloat(
      container?.querySelector<HTMLElement>('[data-ui="video-editor.timeline.snap-guide"]')?.style
        .height ?? '0'
    );
  render(false);
  const collapsedHeight = height();
  render(true);
  expect(height()).toBe(collapsedHeight + 56);
  project.actionEvents = [
    {
      id: 'click',
      kind: 'CLICK',

      anchor: { kind: 'project', time: 1 },

      label: 'Click',
      point: null,
      data: {},
      presentation: { duration: 1, preset: 'CLICK_RIPPLE' },
    },
  ];
  render(true);
  expect(height()).toBe(collapsedHeight + 56);
  expect(container?.querySelectorAll('[data-project-timeline-effect-lane-row]')).toHaveLength(0);
  render(false);
  expect(height()).toBe(collapsedHeight);
});

it('does not render telemetry empty text when the telemetry lane is hidden', () => {
  renderCanvas({
    recordingTelemetry: [],
    telemetryLaneVisible: false,
  });

  expect(container?.textContent).not.toContain('videoEditor.timeline.telemetryLaneEmpty');
});

function renderCanvas(overrides: {
  consumeCompletedScrubClick?: () => boolean;
  onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
  onBeginPlayheadScrub?: React.PointerEventHandler<HTMLElement>;
  onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  dragGhost?: React.ComponentProps<typeof ProjectTimelineCanvas>['dragGhost'];
  onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStepToNextFrame?: () => void;
  onStepToPreviousFrame?: () => void;
  onSeekTime?: (time: number) => void;
  onSelectScene?: () => void;
  onSelectTrack?: (trackId: string) => void;
  playbackRange?: React.ComponentProps<typeof ProjectTimelineCanvas>['playbackRange'];
  recordingTelemetry?: React.ComponentProps<typeof ProjectTimelineCanvas>['recordingTelemetry'];
  snapGuideTime?: number | null;
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
    consumeCompletedScrubClick?: () => boolean;
    onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
    onBeginPlayheadScrub?: React.PointerEventHandler<HTMLElement>;
    onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
    onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
    dragGhost?: React.ComponentProps<typeof ProjectTimelineCanvas>['dragGhost'];
    onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
    onSeekTime?: (time: number) => void;
    onStepToNextFrame?: () => void;
    onStepToPreviousFrame?: () => void;
    onSelectScene?: () => void;
    onSelectTrack?: (trackId: string) => void;
    playbackRange?: React.ComponentProps<typeof ProjectTimelineCanvas>['playbackRange'];
    recordingTelemetry?: React.ComponentProps<typeof ProjectTimelineCanvas>['recordingTelemetry'];
    snapGuideTime?: number | null;
    onImportTimelineFile?: ProjectTimelineInsertionActions['onImport'];
    seekToClientX?: (clientX: number) => void;
    telemetryLaneVisible?: boolean;
    onUnsupportedTimelineFileDrop?: () => void;
  }
): React.ComponentProps<typeof ProjectTimelineCanvas> {
  return {
    currentTime: 0,
    consumeCompletedScrubClick: overrides.consumeCompletedScrubClick ?? (() => false),
    dragGhost: overrides.dragGhost ?? null,
    playbackRange: overrides.playbackRange ?? null,
    pixelsPerSecond: 90,
    project,
    recordingTelemetry: overrides.recordingTelemetry ?? [],
    selection: createSceneSelection(),
    snapGuideTime: overrides.snapGuideTime ?? null,
    hoveredClipId: null,
    selectedClipId: null,
    selectedEffectSelection: null,
    selectedTrackId: null,
    telemetryLaneVisible: overrides.telemetryLaneVisible ?? false,
    timelinePreviews: {},
    seekToClientX: overrides.seekToClientX ?? vi.fn(),
    onSeekTime: overrides.onSeekTime ?? vi.fn(),
    timelineRef: { current: null },
    timelineWidth: 900,
    tracks: project.tracks,
    ...createCanvasActionProps(overrides),
  };
}

function createCanvasActionProps(overrides: {
  onBeginEffectRangeSelection?: React.PointerEventHandler<HTMLDivElement>;
  onBeginPlayheadScrub?: React.PointerEventHandler<HTMLElement>;
  onBeginRangeSelection?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onBeginTrackRangeSelection?: (trackId: string) => React.PointerEventHandler<HTMLDivElement>;
  onImportTimelineFile?: ProjectTimelineInsertionActions['onImport'];
  onSeek?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onStepToNextFrame?: () => void;
  onStepToPreviousFrame?: () => void;
  onSelectScene?: () => void;
  onSelectTrack?: (trackId: string) => void;
  onUnsupportedTimelineFileDrop?: () => void;
}) {
  return {
    onBeginClipInteraction: vi.fn(),
    onBeginEffectInteraction: vi.fn(),
    onBeginPlayheadScrub: overrides.onBeginPlayheadScrub ?? vi.fn(),
    onStepToNextFrame: overrides.onStepToNextFrame ?? vi.fn(),
    onStepToPreviousFrame: overrides.onStepToPreviousFrame ?? vi.fn(),
    onBeginEffectRangeSelection: overrides.onBeginEffectRangeSelection ?? vi.fn(),
    onBeginRangeSelection: overrides.onBeginRangeSelection ?? vi.fn(),
    onBeginTrackRangeSelection: overrides.onBeginTrackRangeSelection ?? (() => vi.fn()),
    onAddMotionRegion: vi.fn(),
    onCloseTrackGap: vi.fn(),
    onImportTimelineFile: overrides.onImportTimelineFile ?? createImportHandlers({}),
    onSeek: overrides.onSeek ?? vi.fn(),
    onSelectActionOccurrence: vi.fn(),
    onSelectClip: vi.fn(),
    onSelectCursorSegment: vi.fn(),
    onSelectMotionRegion: vi.fn(),
    onSelectObjectTrack: vi.fn(),
    onSelectScene: overrides.onSelectScene ?? vi.fn(),
    onSelectTrack: overrides.onSelectTrack ?? vi.fn(),
    onSelectTransition: vi.fn(),
    onSetHoveredClipId: vi.fn(),
    onTimelinePreviewViewportChange: vi.fn(),

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

it('projects clip, motion, range and playhead together in a distant viewport without editing source data', () => {
  const project = createVideoProjectFromRecording({
    duration: 86400,
    filename: 'day.webm',
    height: 720,
    width: 1280,
    mimeType: 'video/webm',
    recordingId: 'day-recording',
    size: 100,
  });
  const clip = project.clips[0]!;
  project.motionRegions = [
    { ...createVideoProjectMotionRegion(project, 0), startTime: 0, duration: 86400 },
  ];
  const original = structuredClone(project);
  const projection = createTimelineProjection({
    extentSeconds: 86405,
    pixelsPerSecond: 280,
    viewportWidth: 1000,
    startTime: 43200,
  });
  act(() =>
    root?.render(
      <ProjectTimelineCanvas
        {...createCanvasProps(project, { playbackRange: { start: 0, end: 86400 } })}
        projection={projection}
        pixelsPerSecond={280}
        timelineWidth={86405 * 280}
        currentTime={43200 + 500 / 280}
      />
    )
  );
  const renderedClip = container?.querySelector<HTMLElement>(
    `[data-project-timeline-clip="${clip.id}"]`
  );
  expect(parseFloat(renderedClip?.style.width ?? '')).toBeCloseTo(1240, 5);
  expect(parseFloat(renderedClip?.style.left ?? '')).toBeCloseTo(-120, 5);
  const playhead = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.playhead-handle"]'
  );
  expect(parseFloat(playhead?.style.left ?? '')).toBeCloseTo(500, 5);
  const motion = container?.querySelector<HTMLElement>(
    '[aria-label^="videoEditor.timeline.motionLane ·"]'
  )?.parentElement;
  expect(parseFloat(motion?.style.width ?? '')).toBeCloseTo(1240, 5);
  expect(
    container?.querySelector('[aria-label="videoEditor.timeline.motionLane:resize-start"]')
  ).toBeNull();
  expect(project).toEqual(original);
});

it('focuses the timeline before a clip pointer handler cancels the default focus', () => {
  const project = createVideoProjectFromRecording({
    duration: 8,
    filename: 'focus.webm',
    height: 720,
    width: 1280,
    mimeType: 'video/webm',
    recordingId: 'focus-recording',
    size: 100,
  });
  const props = createCanvasProps(project, {});
  props.onBeginClipInteraction = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  act(() => root?.render(<ProjectTimelineCanvas {...props} />));
  const canvas = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.canvas-scroll"]'
  );
  const clip = canvas?.querySelector<HTMLElement>('[data-project-timeline-clip]');
  expect(clip).not.toBeNull();
  act(() =>
    clip?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
    )
  );
  expect(document.activeElement).toBe(canvas);
});
