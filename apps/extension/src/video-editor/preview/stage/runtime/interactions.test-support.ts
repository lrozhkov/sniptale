import { vi } from 'vitest';
import { createAnnotationClip } from '../../../../features/video/project/factories/overlay-clip';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import {
  VideoClipLinkMode,
  VideoClipTransitionKind,
  VideoMediaFitMode,
  VideoMotionOverlayZoomMode,
  VideoProjectClipType,
  type VideoProjectClip,
} from '../../../../features/video/project/types';

function createClip(trackId: string): VideoProjectClip {
  return {
    id: 'clip-1',
    trackId,
    type: VideoProjectClipType.VIDEO,
    name: 'Clip 1',
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    volumeEnvelopeStart: 1,
    volumeEnvelopeEnd: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 10,
      y: 15,
      width: 120,
      height: 80,
      rotation: 0,
      opacity: 1,
    },
    assetId: 'asset-1',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: 4,
  };
}

function createInteractionRef() {
  return {
    current: null,
  } as {
    current: {
      clip: VideoProjectClip;
      mode: 'move' | 'nw' | 'ne' | 'sw' | 'se';
      scaleX: number;
      scaleY: number;
      startX: number;
      startY: number;
      transform: VideoProjectClip['transform'];
    } | null;
  };
}

export function createStageRectSpy(stage: HTMLDivElement, width = 400, height = 200) {
  return vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
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
}

export function dispatchPointerMove(clientX: number, clientY: number) {
  const moveEvent = new Event('pointermove');
  Object.defineProperty(moveEvent, 'clientX', { value: clientX });
  Object.defineProperty(moveEvent, 'clientY', { value: clientY });
  window.dispatchEvent(moveEvent);
}

export function createPointerEvent(clientX: number, clientY: number) {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as never;
}

export function createUnlockedStageScenario() {
  const project = createEmptyVideoProject('Stage');
  project.width = 200;
  project.height = 100;

  return {
    camera: {
      focusPoint: { x: 100, y: 50 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: 100,
      viewportWidth: 200,
      viewportX: 0,
      viewportY: 0,
    } as const,
    clip: createClip(project.tracks[0]!.id),
    cleanupRef: { current: null as (() => void) | null },
    interactionRef: createInteractionRef(),
    onSelectClip: vi.fn(),
    onUpdateClipTransform: vi.fn(),
    project,
    stage: document.createElement('div'),
  };
}

export function createLockedStageScenario() {
  const project = createEmptyVideoProject('Locked');
  project.tracks[0] = {
    ...project.tracks[0]!,
    locked: true,
  };

  return {
    camera: {
      focusPoint: { x: project.width / 2, y: project.height / 2 },
      motionBlurAmount: 0,
      regionId: null,
      scale: 1,
      viewportHeight: project.height,
      viewportWidth: project.width,
      viewportX: 0,
      viewportY: 0,
    } as const,
    clip: createClip(project.tracks[0]!.id),
    onUpdateClipTransform: vi.fn(),
    project,
  };
}

export function createLockedOverlayScenario() {
  const project = createEmptyVideoProject('Locked overlay');
  project.width = 200;
  project.height = 100;
  const clip = createAnnotationClip(project.tracks[2]!.id, 200, 100, 0);
  clip.transform = {
    ...clip.transform,
    height: 30,
    width: 80,
    x: 120,
    y: 60,
  };

  return {
    camera: {
      focusPoint: { x: 100, y: 50 },
      motionBlurAmount: 0,
      overlayZoomMode: VideoMotionOverlayZoomMode.LOCK_OVERLAYS,
      regionId: 'motion-1',
      scale: 2,
      viewportHeight: 50,
      viewportWidth: 100,
      viewportX: 40,
      viewportY: 20,
    } as const,
    cleanupRef: { current: null as (() => void) | null },
    clip,
    interactionRef: createInteractionRef(),
    onUpdateClipTransform: vi.fn(),
    project,
    stage: document.createElement('div'),
  };
}
