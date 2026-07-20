// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { VideoCompositionCameraState } from '../../../../features/video/composition/types';
import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMotionOverlayZoomMode,
  VideoProjectClipType,
} from '../../../../features/video/project/types';
import { handleStagePointerDown, PreviewStageSelectionOverlay } from './selection-overlay';

function createCamera(overrides: Partial<VideoCompositionCameraState> = {}) {
  return {
    focusPoint: { x: 100, y: 50 },
    motionBlurAmount: 0,
    overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
    regionId: null,
    scale: 1,
    viewportHeight: 100,
    viewportWidth: 200,
    viewportX: 0,
    viewportY: 0,
    ...overrides,
  } as const;
}

function createStage(width = 220, height = 140) {
  const stage = document.createElement('div');
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  });
  return stage;
}

function createSelectionProject() {
  const project = createEmptyVideoProject('Selection', 200, 100);
  project.clips = [
    {
      assetId: 'asset-1',
      duration: 4,
      fadeInMs: 0,
      fadeOutMs: 0,
      fitMode: VideoMediaFitMode.CONTAIN,
      groupId: null,
      id: 'clip-1',
      linkMode: VideoClipLinkMode.DETACHED,
      muted: false,
      name: 'Clip 1',
      sourceDuration: 4,
      sourceStart: 0,
      startTime: 0,
      trackId: project.tracks[0]!.id,
      transitionIn: VideoClipTransitionKind.NONE,
      transitionOut: VideoClipTransitionKind.NONE,
      type: VideoProjectClipType.VIDEO,
      volume: 1,
      volumeEnvelopeEnd: 1,
      volumeEnvelopeStart: 1,
      transform: {
        height: 40,
        opacity: 1,
        rotation: 0,
        width: 70,
        x: 30,
        y: 20,
      },
    },
  ] as never;
  return project;
}

function createLockedAnnotationProject() {
  const project = createEmptyVideoProject('Annotation selection', 200, 100);
  const clip = createAnnotationClip(project.tracks[2]!.id, 200, 100, 0);
  clip.transform = {
    ...clip.transform,
    height: 30,
    width: 80,
    x: 120,
    y: 60,
  };
  project.clips = [clip] as never;
  return { clip, project };
}

function createPointerEvent(clientX: number, clientY: number) {
  const target = document.createElement('div');
  return {
    clientX,
    clientY,
    currentTarget: target,
    target,
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('fits the selected clip outline into the centered fullscreen viewport', () => {
  const project = createSelectionProject();
  const selectedClip = project.clips[0]!;
  const stage = createStage();

  act(() => {
    root?.render(
      <PreviewStageSelectionOverlay
        beginInteraction={vi.fn()}
        camera={createCamera()}
        project={project}
        selectedClip={selectedClip}
        selectedClipLocked={false}
        stageRef={{ current: stage }}
      />
    );
  });

  const outline = container?.querySelector('.border-dashed') as HTMLElement | null;
  expect(outline).toBeTruthy();
  expect(parseFloat(outline!.style.top)).toBeCloseTo(26.428571, 4);
  expect(parseFloat(outline!.style.height)).toBeCloseTo(31.428571, 4);
});

it('selects clips using the fitted fullscreen viewport coordinates', () => {
  const project = createSelectionProject();
  const selectedClip = project.clips[0]!;
  const beginInteraction = vi.fn();
  const onSelectClip = vi.fn();
  const stage = createStage();

  handleStagePointerDown(createPointerEvent(44, 48), {
    activeClips: [selectedClip],
    beginInteraction,
    camera: createCamera(),
    onSelectClip,
    project,
    stageRef: { current: stage },
  });

  expect(beginInteraction).toHaveBeenCalledWith(
    expect.objectContaining({ clientX: 44, clientY: 48 }),
    selectedClip,
    'move'
  );
  expect(onSelectClip).not.toHaveBeenCalledWith(null);
});

it('selects the upper-track active clip first when clip bounds overlap', () => {
  const project = createSelectionProject();
  const lowerClip = project.clips[0]!;
  const upperClip = {
    ...lowerClip,
    id: 'upper-clip',
    trackId: project.tracks[0]!.id,
  };
  const beginInteraction = vi.fn();
  const stage = createStage();

  lowerClip.id = 'lower-clip';
  lowerClip.trackId = project.tracks[2]!.id;

  handleStagePointerDown(createPointerEvent(44, 48), {
    activeClips: [lowerClip, upperClip],
    beginInteraction,
    camera: createCamera(),
    onSelectClip: vi.fn(),
    project,
    stageRef: { current: stage },
  });

  expect(beginInteraction).toHaveBeenCalledWith(
    expect.objectContaining({ clientX: 44, clientY: 48 }),
    upperClip,
    'move'
  );
});

it('keeps locked annotation overlays fixed on stage even when the camera zooms and pans', () => {
  const { clip, project } = createLockedAnnotationProject();
  const stage = createStage();

  act(() => {
    root?.render(
      <PreviewStageSelectionOverlay
        beginInteraction={vi.fn()}
        camera={createCamera({ scale: 2, viewportX: 40, viewportY: 20 })}
        project={project}
        selectedClip={clip}
        selectedClipLocked={false}
        stageRef={{ current: stage }}
      />
    );
  });

  const outline = container?.querySelector('.border-dashed') as HTMLElement | null;
  expect(outline).toBeTruthy();
  expect(parseFloat(outline!.style.left)).toBeCloseTo(60, 4);
  expect(parseFloat(outline!.style.top)).toBeCloseTo(57.857143, 4);
  expect(parseFloat(outline!.style.width)).toBeCloseTo(40, 4);
  expect(parseFloat(outline!.style.height)).toBeCloseTo(23.571428, 4);
});

it('rejects points inside axis bounds but outside the rotated clip', () => {
  const project = createSelectionProject();
  const clip = project.clips[0]!;
  clip.transform.rotation = 45;
  const beginInteraction = vi.fn();
  const onSelectClip = vi.fn();

  handleStagePointerDown(createPointerEvent(23.1, 38.1), {
    activeClips: [clip],
    beginInteraction,
    camera: createCamera(),
    onSelectClip,
    project,
    stageRef: { current: createStage() },
  });

  expect(beginInteraction).not.toHaveBeenCalled();
  expect(onSelectClip).toHaveBeenCalledWith(null);
});

it('rotates the selection outline and resize cursors with the clip', () => {
  const project = createSelectionProject();
  const clip = project.clips[0]!;
  clip.transform.rotation = 90;

  act(() => {
    root?.render(
      <PreviewStageSelectionOverlay
        beginInteraction={vi.fn()}
        camera={createCamera()}
        project={project}
        selectedClip={clip}
        selectedClipLocked={false}
        stageRef={{ current: createStage() }}
      />
    );
  });

  const outline = container?.querySelector('.border-dashed') as HTMLElement | null;
  const firstHandle = outline?.querySelector('button') as HTMLButtonElement | null;
  expect(outline?.style.transform).toBe('rotate(90deg)');
  expect(firstHandle?.style.cursor).toBe('ne-resize');
});
