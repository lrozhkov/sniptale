// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import type { VideoEditorImportPlacement } from '../../../contracts/insertion';
import { createSceneSelection } from '../../../project/selection/model';
import { ProjectTimelineCanvas } from './';
import type { ProjectTimelineInsertionActions } from '../types';

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

it('drops a compatible video file on a timeline track with captured placement', () => {
  const onImportVideo = vi.fn();
  const { project, trackId } = renderCanvas({
    onImportTimelineFile: createImportHandlers({ video: onImportVideo }),
  });

  dispatchTimelineFileDrop(trackId, new File(['video'], 'clip.webm', { type: 'video/webm' }), 200);

  expect(project.tracks[0]?.id).toBe(trackId);
  expect(onImportVideo).toHaveBeenCalledTimes(1);
  expectImportPlacement(onImportVideo, trackId, (200 - 20 + 30) / 90);
});

it('auto-routes an incompatible dropped image file while preserving drop time', () => {
  const onImportImage = vi.fn();
  const { project, trackId } = renderCanvas({
    onImportTimelineFile: createImportHandlers({ image: onImportImage }),
  });

  dispatchTimelineFileDrop(trackId, new File(['image'], 'shot.png', { type: 'image/png' }), 290);

  expect(onImportImage).toHaveBeenCalledTimes(1);
  expectImportPlacement(onImportImage, project.tracks[2]!.id, (290 - 20 + 30) / 90);
});

it('surfaces unsupported timeline file drops without importing anything', () => {
  const onImportImage = vi.fn();
  const onUnsupportedTimelineFileDrop = vi.fn();
  const { trackId } = renderCanvas({
    onImportTimelineFile: createImportHandlers({ image: onImportImage }),
    onUnsupportedTimelineFileDrop,
  });

  dispatchTimelineFileDrop(trackId, new File(['text'], 'notes.txt', { type: 'text/plain' }), 180);

  expect(onImportImage).not.toHaveBeenCalled();
  expect(onUnsupportedTimelineFileDrop).toHaveBeenCalledTimes(1);
});

function renderCanvas(options: {
  onImportTimelineFile: ProjectTimelineInsertionActions['onImport'];
  onUnsupportedTimelineFileDrop?: () => void;
}) {
  const project = createEmptyVideoProject('Canvas drop');

  act(() => {
    root?.render(
      <ProjectTimelineCanvas
        {...createCanvasProps(project, options)}
        onImportTimelineFile={options.onImportTimelineFile}
      />
    );
  });

  return {
    project,
    trackId: project.tracks[0]!.id,
  };
}

function createCanvasProps(
  project: ReturnType<typeof createEmptyVideoProject>,
  options: {
    onUnsupportedTimelineFileDrop?: () => void;
  }
): React.ComponentProps<typeof ProjectTimelineCanvas> {
  return {
    currentTime: 0,
    dragGhost: null,
    playbackRange: null,
    pixelsPerSecond: 90,
    project,
    recordingTelemetry: null,
    selection: createSceneSelection(),
    hoveredClipId: null,
    selectedClipId: null,
    selectedEffectSelection: null,
    selectedTrackId: null,
    telemetryLaneVisible: false,
    timelinePreviews: {},
    seekToClientX: vi.fn(),
    timelineRef: { current: null },
    timelineWidth: 900,
    tracks: project.tracks,
    ...createCanvasActionProps(options),
  };
}

function createCanvasActionProps(options: { onUnsupportedTimelineFileDrop?: () => void }) {
  return {
    onBeginClipInteraction: vi.fn(),
    onBeginEffectInteraction: vi.fn(),
    onBeginEffectRangeSelection: vi.fn(),
    onBeginRangeSelection: vi.fn(),
    onBeginTrackRangeSelection: () => vi.fn(),
    onAddMotionRegion: vi.fn(),
    onCloseTrackGap: vi.fn(),
    onImportTimelineFile: createImportHandlers({}),
    onSeek: vi.fn(),
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
    onResizeActionEvent: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onScroll: vi.fn(),
    onUnsupportedTimelineFileDrop: options.onUnsupportedTimelineFileDrop ?? vi.fn(),
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

function dispatchTimelineFileDrop(trackId: string, file: File, clientX: number): void {
  const canvas = container?.querySelector<HTMLDivElement>('.relative.min-w-0.overflow-auto');
  const trackLane = container?.querySelector(`[data-track-lane-id="${trackId}"]`);
  if (!canvas || !trackLane) {
    throw new Error('Expected rendered timeline canvas and track lane');
  }

  canvas.scrollLeft = 30;
  canvas.getBoundingClientRect = () =>
    ({
      bottom: 300,
      height: 300,
      left: 20,
      right: 920,
      top: 0,
      width: 900,
      x: 20,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  act(() => {
    trackLane.dispatchEvent(createDragEvent(file, clientX));
  });
}

function createDragEvent(file: File, clientX: number): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    dataTransfer: {
      value: {
        dropEffect: 'none',
        files: [file],
        items: [{ kind: 'file' }],
        types: ['Files'],
      },
    },
  });
  return event;
}

function expectImportPlacement(
  importMock: ReturnType<typeof vi.fn>,
  trackId: string,
  startTime: number
): void {
  const placement = importMock.mock.calls[0]?.[1] as VideoEditorImportPlacement | undefined;
  expect(placement?.trackId).toBe(trackId);
  expect(placement?.startTime).toBeCloseTo(startTime);
}
