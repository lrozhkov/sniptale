// @vitest-environment jsdom
import { createVideoClipFromAsset } from '../../../../features/video/project/factories/clip';

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
  createVideoProjectTrack,
} from '../../../../features/video/project/factories/creation';
import { VideoTrackKind } from '../../../../features/video/project/types';
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

it('renders a clip drag ghost on the target logical lane', () => {
  const project = createEmptyVideoProject('Canvas drag ghost');
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };

  act(() => {
    root?.render(
      <ProjectTimelineCanvas
        {...createCanvasProps(project, {
          clipId: 'clip-1',
          duration: 0.1,
          name: 'Dragged clip',
          startTime: 1,
          timelineLaneId: 'line-2',
          trackId,
        })}
      />
    );
  });

  const ghost = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.clip-drag-ghost"]'
  );
  expect(ghost?.textContent).toContain('Dragged clip');
  expect(ghost?.style.width).toBe('9px');
  expect(ghost?.style.top).not.toBe('');
  expect(ghost?.style.backgroundColor).not.toBe('rgb(24, 24, 27)');
  expect(ghost?.className).toContain('var(--sniptale-color-surface-panel)');
});

it('renders a clip drag ghost on a newly previewed third logical lane', () => {
  const project = createEmptyVideoProject('Canvas new lane drag ghost');
  const trackId = project.tracks[0]!.id;
  project.tracks[0] = {
    ...project.tracks[0]!,
    logicalLanes: [{ id: 'line-1' }, { id: 'line-2' }],
  };

  act(() => {
    root?.render(
      <ProjectTimelineCanvas
        {...createCanvasProps(project, {
          clipId: 'clip-1',
          duration: 2,
          name: 'Dragged clip',
          startTime: 1,
          timelineLaneId: 'line-3',
          trackId,
        })}
      />
    );
  });

  const ghost = container?.querySelector<HTMLElement>(
    '[data-ui="video-editor.timeline.clip-drag-ghost"]'
  );
  expect(Number.parseFloat(ghost?.style.top ?? '0')).toBeGreaterThan(80);
});

it('renders linked destinations on their own tracks and removes every proposal together', () => {
  const project = createEmptyVideoProject('Linked destinations');
  const trackId = project.tracks[0]!.id;
  const camera = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(camera);
  const ghost = {
    clipId: 'screen',
    duration: 3,
    name: 'Screen',
    startTime: 5,
    timelineLaneId: null,
    trackId,
    relatedClips: [
      {
        clipId: 'camera',
        duration: 1,
        name: 'Camera',
        startTime: 6,
        timelineLaneId: 'line-1',
        trackId: camera.id,
      },
    ],
  };
  act(() => root?.render(<ProjectTimelineCanvas {...createCanvasProps(project, ghost)} />));
  const ghosts = container!.querySelectorAll<HTMLElement>(
    '[data-ui="video-editor.timeline.clip-drag-ghost"]'
  );
  expect(ghosts).toHaveLength(2);
  const main = container!.querySelector<HTMLElement>(
    '[data-clip-id="screen"][data-related="false"]'
  );
  const sidecar = container!.querySelector<HTMLElement>(
    '[data-clip-id="camera"][data-related="true"]'
  );
  expect(main?.style.left).toBe('450px');
  expect(main?.style.width).toBe('270px');
  expect(sidecar?.style.left).toBe('540px');
  expect(sidecar?.style.width).toBe('90px');
  expect(main?.style.height).toBe(sidecar?.style.height);
  expect(sidecar?.parentElement).not.toBe(main?.parentElement);
  expect(sidecar?.className).toContain('pointer-events-none');
  act(() => root?.render(<ProjectTimelineCanvas {...createCanvasProps(project, null)} />));
  expect(
    container!.querySelectorAll('[data-ui="video-editor.timeline.clip-drag-ghost"]')
  ).toHaveLength(0);
});

function createCanvasProps(
  project: ReturnType<typeof createEmptyVideoProject>,
  dragGhost: React.ComponentProps<typeof ProjectTimelineCanvas>['dragGhost']
): React.ComponentProps<typeof ProjectTimelineCanvas> {
  return {
    currentTime: 0,
    consumeCompletedScrubClick: () => false,
    dragGhost,
    hoveredClipId: null,
    pixelsPerSecond: 90,
    playbackRange: null,
    project,
    recordingTelemetry: [],
    selectedClipId: null,
    selectedEffectSelection: null,
    selectedTrackId: null,
    selection: createSceneSelection(),
    snapGuideTime: null,
    seekToClientX: vi.fn(),
    telemetryLaneVisible: false,
    timelinePreviews: {},
    timelineRef: { current: null },
    timelineWidth: 900,
    tracks: project.tracks,
    ...createCanvasActionProps(),
  };
}

function createCanvasActionProps() {
  return {
    onAddMotionRegion: vi.fn(),
    onBeginClipInteraction: vi.fn(),
    onBeginEffectInteraction: vi.fn(),
    onBeginPlayheadScrub: vi.fn(),
    onStepToNextFrame: vi.fn(),
    onStepToPreviousFrame: vi.fn(),
    onBeginEffectRangeSelection: vi.fn(),
    onBeginRangeSelection: vi.fn(),
    onBeginTrackRangeSelection: () => vi.fn(),
    onCloseTrackGap: vi.fn(),
    onImportTimelineFile: createImportHandlers({}),

    onResizeMotionRegion: vi.fn(),
    onScroll: vi.fn(),
    onSeek: vi.fn(),
    onSeekTime: vi.fn(),
    onSelectActionOccurrence: vi.fn(),
    onSelectClip: vi.fn(),
    onSelectCursorSegment: vi.fn(),
    onSelectMotionRegion: vi.fn(),
    onSelectObjectTrack: vi.fn(),
    onSelectScene: vi.fn(),
    onSelectTrack: vi.fn(),
    onSelectTransition: vi.fn(),
    onSetHoveredClipId: vi.fn(),
    onTimelinePreviewViewportChange: vi.fn(),
    onUnsupportedTimelineFileDrop: vi.fn(),
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

it('renders a single labeled reorder slot on the manipulated track and clears it with the proposal', () => {
  const project = createEmptyVideoProject('Reorder marker');
  const trackId = project.tracks[0]!.id;
  const camera = createVideoProjectTrack('Camera', -1, VideoTrackKind.PRIMARY);
  project.tracks.push(camera);
  const asset = createVideoProjectAsset(
    'Screen',
    'VIDEO',
    { kind: 'recording', recordingId: 'rec' },
    {
      duration: 2,
      width: 1280,
      height: 720,
      size: 1,
      mimeType: 'video/webm',
      hasAudio: false,
      audioPeaks: null,
    }
  );
  project.assets = [asset];
  project.clips = [{ ...createVideoClipFromAsset(trackId, asset, 1280, 720, 0), id: 'selected' }];
  const props = createCanvasProps(project, {
    clipId: 'selected',
    name: 'Screen',
    trackId,
    timelineLaneId: null,
    startTime: 3,
    duration: 2,
    activeReorder: 'right',
    reorderSlots: [{ direction: 'right', startTime: 3, neighborName: 'Next recording' }],
    relatedClips: [
      {
        clipId: 'camera',
        name: 'Camera',
        trackId: camera.id,
        timelineLaneId: null,
        startTime: 3,
        duration: 2,
      },
    ],
  });
  act(() => root?.render(<ProjectTimelineCanvas {...props} />));
  const markers = container!.querySelectorAll<HTMLElement>(
    '[data-ui="video-editor.timeline.reorder-slot"]'
  );
  expect(markers).toHaveLength(1);
  expect(markers[0]!.style.left).toBe('270px');
  expect(markers[0]!.dataset['active']).toBe('true');
  expect(markers[0]!.textContent).toContain('videoEditor.app.clipSwapNeighbor');
  expect(markers[0]!.className).toContain('pointer-events-none');
  const clipNode = () =>
    container!.querySelector<HTMLElement>('[data-project-timeline-clip="selected"]')!;
  expect(clipNode().style.left).toBe('270px');
  expect(container!.querySelector('[data-ui="video-editor.timeline.clip-drag-ghost"]')).toBeNull();
  expect(project.clips[0]!.startTime).toBe(0);
  act(() => root?.render(<ProjectTimelineCanvas {...props} dragGhost={null} />));
  expect(container!.querySelector('[data-ui="video-editor.timeline.reorder-slot"]')).toBeNull();
  expect(clipNode().style.left).toBe('0px');
});
