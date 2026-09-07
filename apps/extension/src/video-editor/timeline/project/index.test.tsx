// @vitest-environment jsdom

import { act, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { createVideoProjectMotionRegion } from '../../../features/video/project/motion';
import { createSceneSelection } from '../../project/selection/model';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';
import { ProjectTimeline } from './index';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

// The composition boundary supplies unrelated workspace commands; timeline composition stays real.
vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorHistoryController: () => ({
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  }),
  useVideoEditorHeaderController: () => ({
    grid: { magnetEnabled: false, onToggleMagnet: vi.fn() },
    onOpenExportDialog: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createProps(): ComponentProps<typeof ProjectTimeline> {
  const project = createEmptyVideoProject('Precise montage');
  project.fps = 240;
  project.duration = 86400;
  const asset = createVideoProjectAsset(
    'Source',
    VideoProjectAssetType.VIDEO,
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 160,
      height: 90,
      duration: 4,
      mimeType: 'video/webm',
      size: 1,
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  project.clips = [
    {
      ...createVideoClipFromAsset(project.tracks[0]!.id, asset, 1920, 1080, 43200),
      id: 'clip',
      duration: 1 / 240,
    },
  ];
  project.motionRegions = [
    { ...createVideoProjectMotionRegion(project, 43200), id: 'motion', duration: 1 / 240 },
  ];
  const idle = () => {};
  return {
    project,
    currentTime: 43200,
    pixelsPerSecond: 23040,
    isPlaying: false,
    magnetEnabled: false,
    playbackRange: { start: 43200, end: 43200 + 1 / 240 },
    recordingTelemetry: null,
    selection: createSceneSelection(),
    selectedClipId: 'clip',
    selectedTrackId: null,
    telemetryLaneVisible: false,
    timelinePreviews: {},
    canEditSelectedClip: true,
    canSplitSelectedClip: false,
    panelPrefs: {
      prefs: DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS,
      cursorLaneVisible: false,
      telemetryLaneVisible: false,
      setCollapsedCursorLaneVisible: idle,
      setCollapsedTelemetryLaneVisible: idle,
      setCompactRows: idle,
      setTrackHeight: idle,
    },
    historyTransaction: {
      beginProjectHistoryTransaction: () => Symbol('gesture'),
      endProjectHistoryTransaction: vi.fn(),
      isProjectHistoryTransactionCurrent: () => true,
    },
    insertion: {
      onAddActionEvent: idle,
      onAddMotionRegion: idle,
      onAddShapeOverlay: idle,
      onAddTextOverlay: idle,
      onAddTrack: idle,
      onEnableCursorTrack: idle,
      onImport: { audio: idle, image: idle, video: idle },
      onUnsupportedFileDrop: idle,
    },
    onSeekToEnd: idle,
    onSeekToStart: idle,
    onTogglePlay: idle,
    onStepToNextFrame: idle,
    onStepToPreviousFrame: idle,
    onSeek: vi.fn(),
    onZoomChange: idle,
    onSetPlaybackRange: vi.fn(),
    onToggleTelemetryLaneVisibility: idle,
    onSelectScene: idle,
    onSelectClip: idle,
    onSelectTrack: idle,
    onSelectTransition: idle,
    onSelectCursorSegment: idle,
    onSelectActionSegment: idle,
    onSelectMotionRegion: idle,
    onSelectObjectTrack: idle,
    onSwapClip: idle,
    onMoveClip: vi.fn(() => null),
    onCloseTrackGap: idle,
    onAddTrackLogicalLane: idle,
    onRenameTrack: idle,
    onTrimClipStart: () => null,
    onTrimClipEnd: () => null,
    onSplitSelectedClip: idle,
    onDuplicateSelectedClip: idle,
    onDeleteSelectedClip: idle,
    onUpdateSelectedClipPlaybackRate: idle,
    onAutoTransformRecording: idle,
    onDeleteSelectedTimelineObject: idle,
    onToggleUtilityLaneVisibility: idle,
    onToggleUtilityLaneLock: idle,
    onClearUtilityLane: idle,
    onMoveActionEvent: idle,
    onResizeActionEvent: idle,
    onMoveCursorSegment: idle,
    onMoveTransitionSegment: idle,
    onMoveMotionRegion: vi.fn(),
    onResizeMotionRegion: idle,
    onUpdateEffectInstance: idle,
    onToggleTrackVisibility: idle,
    onToggleTrackLock: idle,
    onTimelinePreviewSuspendedChange: idle,
    onTimelinePreviewViewportChange: vi.fn(),
  };
}

function mountTimeline(props: ComponentProps<typeof ProjectTimeline>) {
  function Harness() {
    const [scale, setScale] = useState(props.pixelsPerSecond);
    return <ProjectTimeline {...props} pixelsPerSecond={scale} onZoomChange={setScale} />;
  }
  act(() => root.render(<Harness />));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.fit-selection"]')!
      .click()
  );
}

function pointer(target: EventTarget, type: string, x: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: 20 },
    button: { value: 0 },
  });
  target.dispatchEvent(event);
}

it('composes precise fit, clip draft cancellation and commit through the real timeline body', () => {
  const props = createProps();
  mountTimeline(props);
  const clip = container.querySelector<HTMLElement>('[data-project-timeline-clip="clip"]')!;
  expect(clip).not.toBeNull();
  expect(parseFloat(clip.style.width)).toBeCloseTo(96, 3);

  const before = structuredClone(props.project);
  act(() => {
    pointer(clip, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
  });
  const ghost = () =>
    container.querySelector<HTMLElement>('[data-ui="video-editor.timeline.clip-drag-ghost"]');
  expect(ghost()).not.toBeNull();
  expect(parseFloat(ghost()!.style.width)).toBeCloseTo(96, 3);
  expect(props.onMoveClip).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(window, 'pointerup', 576);
  });
  expect(ghost()).toBeNull();
  expect(props.onMoveClip).not.toHaveBeenCalled();
  act(() => {
    pointer(clip, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
    pointer(window, 'pointerup', 576);
  });
  expect(props.onMoveClip).toHaveBeenCalledWith(
    'clip',
    expect.closeTo(43200 + 1 / 240, 6),
    props.project.tracks[0]!.id,
    'line-1'
  );
  expect(props.project).toEqual(before);
});

it('publishes an effect draft through the root context and restores its original geometry on Escape', () => {
  const props = createProps();
  mountTimeline(props);
  const segment = container.querySelector<HTMLElement>('[data-timeline-effect-segment="motion"]')!;
  expect(segment).not.toBeNull();
  const originalLeft = segment.style.left;
  const button = segment.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.timeline.motionLane"]'
  )!;
  act(() => {
    pointer(button, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
  });
  expect(segment.style.left).not.toBe(originalLeft);
  expect(props.onMoveMotionRegion).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(window, 'pointerup', 576);
  });
  expect(segment.style.left).toBe(originalLeft);
  expect(props.onMoveMotionRegion).not.toHaveBeenCalled();
  act(() => {
    pointer(button, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
    pointer(window, 'pointerup', 576);
  });
  expect(props.onMoveMotionRegion).toHaveBeenCalledWith(
    'motion',
    expect.closeTo(43200 + 1 / 240, 6)
  );
});
