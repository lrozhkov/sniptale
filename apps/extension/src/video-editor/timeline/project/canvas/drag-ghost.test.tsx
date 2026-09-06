// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createEmptyVideoProject,
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
          duration: 2,
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
    recordingTelemetry: null,
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
    onResizeActionEvent: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onScroll: vi.fn(),
    onSeek: vi.fn(),
    onSeekTime: vi.fn(),
    onSelectActionSegment: vi.fn(),
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
