/** A scene-relative split keeps the screen and camera on disjoint panels. */
export type CameraSplitSide = 'left' | 'right' | 'top' | 'bottom';

export type CameraPanel = { x: number; y: number; width: number; height: number };

export const FULL_CAMERA_PANEL: CameraPanel = { x: 0, y: 0, width: 1, height: 1 };

export function isCameraSplitSide(value: unknown): value is CameraSplitSide {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
}

/** Both editors use the same 2% gutter and equal-size panels. */
export function cameraSplitPanels(side: CameraSplitSide): {
  screen: CameraPanel;
  camera: CameraPanel;
} {
  const half = 0.49;
  switch (side) {
    case 'left':
      return {
        camera: { x: 0, y: 0, width: half, height: 1 },
        screen: { x: 0.51, y: 0, width: half, height: 1 },
      };
    case 'right':
      return {
        screen: { x: 0, y: 0, width: half, height: 1 },
        camera: { x: 0.51, y: 0, width: half, height: 1 },
      };
    case 'top':
      return {
        camera: { x: 0, y: 0, width: 1, height: half },
        screen: { x: 0, y: 0.51, width: 1, height: half },
      };
    case 'bottom':
      return {
        screen: { x: 0, y: 0, width: 1, height: half },
        camera: { x: 0, y: 0.51, width: 1, height: half },
      };
  }
}

export function interpolateCameraPanel(
  from: CameraPanel,
  to: CameraPanel,
  weight: number
): CameraPanel {
  const mix = (a: number, b: number) => a + (b - a) * weight;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
  };
}

import type { VideoProjectTransform } from '../types/layout';

type SceneSize = { width: number; height: number };

/** Geometry and source timing needed to project a camera split. */
interface CameraSplitPresentationInput {
  startTime: number;
  sourceStart: number;
  duration: number;
  playbackRate?: number;
  transform: VideoProjectTransform;
  cameraSplit?: CameraSplitSide | undefined;
  cameraTiming?: { transitions: 'bounded' };
  cameraPositions?: readonly {
    sourceTime: number;
    cameraSplit?: CameraSplitSide | null;
    transform: VideoProjectTransform;
    transition: { kind: 'instant' | 'smooth' | 'shrink'; duration: number };
  }[];
}

/** Evaluate the screen and camera panes from authored destinations, including docked returns. */
export function resolveCameraSplitPresentation(
  scene: SceneSize,
  clip: CameraSplitPresentationInput,
  time: number
): { screen: CameraPanel; camera: VideoProjectTransform } | null {
  const sourceTime =
    clip.sourceStart +
    Math.max(0, Math.min(clip.duration, time - clip.startTime)) * (clip.playbackRate ?? 1);
  const positions = clip.cameraPositions ?? [];
  const index = positions.findLastIndex((position) => position.sourceTime <= sourceTime);
  const current = positions[index];
  const previous = positions[index - 1];
  const fromSide = previous?.cameraSplit ?? (index === 0 ? clip.cameraSplit : null);
  const toSide = current?.cameraSplit ?? (current ? null : clip.cameraSplit);
  if (!fromSide && !toSide) return null;
  const fromTransform = previous?.transform ?? clip.transform;
  const toTransform = current?.transform ?? clip.transform;
  const normalize = (transform: VideoProjectTransform): CameraPanel => ({
    x: transform.x / scene.width,
    y: transform.y / scene.height,
    width: transform.width / scene.width,
    height: transform.height / scene.height,
  });
  const fromCamera = fromSide ? cameraSplitPanels(fromSide).camera : normalize(fromTransform);
  const toCamera = toSide ? cameraSplitPanels(toSide).camera : normalize(toTransform);
  const fromScreen = fromSide ? cameraSplitPanels(fromSide).screen : FULL_CAMERA_PANEL;
  const toScreen = toSide ? cameraSplitPanels(toSide).screen : FULL_CAMERA_PANEL;
  const duration =
    current && current.transition.kind !== 'instant'
      ? Math.min(
          current.transition.duration,
          clip.cameraTiming?.transitions === 'bounded'
            ? (positions[index + 1]?.sourceTime ?? Infinity) - current.sourceTime
            : Infinity
        )
      : 0;
  const progress =
    current && duration > 0
      ? Math.min(1, Math.max(0, (sourceTime - current.sourceTime) / duration))
      : 1;
  const eased = progress * progress * (3 - 2 * progress);
  const panel = interpolateCameraPanel(fromCamera, toCamera, eased);
  const scale =
    current?.transition.kind === 'shrink' ? 1 - 0.55 * Math.sin(Math.PI * progress) ** 2 : 1;
  const width = panel.width * scene.width * scale;
  const height = panel.height * scene.height * scale;
  return {
    screen: interpolateCameraPanel(fromScreen, toScreen, eased),
    camera: {
      x: (panel.x + panel.width / 2) * scene.width - width / 2,
      y: (panel.y + panel.height / 2) * scene.height - height / 2,
      width,
      height,
      rotation: fromTransform.rotation + (toTransform.rotation - fromTransform.rotation) * eased,
      opacity: fromTransform.opacity + (toTransform.opacity - fromTransform.opacity) * eased,
    },
  };
}
