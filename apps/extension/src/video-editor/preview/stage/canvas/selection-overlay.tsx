import type React from 'react';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import {
  getCompositionRectStageStyle,
  mapClientPointToCompositionPoint,
  shouldLockPreviewClipToViewport,
} from './geometry';
import { resolvePreviewClipTransform } from './clip-layout';
import {
  getPreviewTransformResizeCursor,
  isPointInsidePreviewTransform,
  type PreviewTransformResizeHandle,
} from './transform/geometry';
import type { PreviewStageCanvasProps, PreviewStageInteractionMode } from '../types';

const PREVIEW_SELECTION_HANDLE_CLASS_NAME =
  'pointer-events-auto absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border';

const PREVIEW_SELECTION_HANDLE_SURFACE_CLASS_NAME =
  'border-[color:var(--sniptale-color-text-primary-strong)] bg-[var(--sniptale-color-accent-emphasis)]';

const PREVIEW_SELECTION_HANDLE_SHADOW_CLASS_NAME =
  'shadow-[0_0_0_3px_var(--sniptale-color-surface-panel)]';

function getSelectionOverlayStyle(
  project: VideoProject,
  selectedClip: VideoProjectClip,
  camera: PreviewStageCanvasProps['camera'],
  stage: HTMLDivElement
): React.CSSProperties {
  const transform = resolvePreviewClipTransform(project, selectedClip);
  const stageStyle = getCompositionRectStageStyle(
    project,
    transform,
    camera,
    shouldLockPreviewClipToViewport(selectedClip, camera),
    stage
  );
  return {
    ...stageStyle,
    transform: `rotate(${transform.rotation}deg)`,
    transformOrigin: 'center center',
  };
}

function getSelectionHandleStyle(
  handle: PreviewTransformResizeHandle,
  rotation: number
): React.CSSProperties {
  return {
    cursor: getPreviewTransformResizeCursor(handle, rotation),
    left: handle.includes('e') ? '100%' : '0%',
    top: handle.includes('s') ? '100%' : '0%',
  };
}

export function handleStagePointerDown(
  event: React.PointerEvent<HTMLDivElement>,
  params: Pick<
    PreviewStageCanvasProps,
    'activeClips' | 'beginInteraction' | 'camera' | 'onSelectClip' | 'project' | 'stageRef'
  >
): void {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    target !== event.currentTarget &&
    target.dataset['previewStageCanvas'] === undefined
  ) {
    return;
  }

  const stage = params.stageRef.current;
  if (!stage) {
    params.onSelectClip(null);
    return;
  }

  const clip = getTopmostClipAtPointer(
    params.activeClips,
    event,
    stage,
    params.project,
    params.camera
  );
  if (!clip) {
    params.onSelectClip(null);
    return;
  }

  params.beginInteraction(event, clip, 'move');
}

function getTopmostClipAtPointer(
  activeClips: VideoProjectClip[],
  event: React.PointerEvent<HTMLDivElement>,
  stage: HTMLDivElement,
  project: VideoProject,
  camera: PreviewStageCanvasProps['camera']
): VideoProjectClip | null {
  for (const clip of [...activeClips].reverse()) {
    const point = mapClientPointToCompositionPoint({
      camera,
      clientX: event.clientX,
      clientY: event.clientY,
      lockToViewport: shouldLockPreviewClipToViewport(clip, camera),
      project,
      stage,
    });
    if (!point) {
      continue;
    }
    const transform = resolvePreviewClipTransform(project, clip);

    if (isPointInsidePreviewTransform({ point, transform })) {
      return clip;
    }
  }

  return null;
}

export function PreviewStageSelectionOverlay(
  params: Pick<
    PreviewStageCanvasProps,
    'beginInteraction' | 'camera' | 'project' | 'selectedClip' | 'selectedClipLocked' | 'stageRef'
  >
) {
  const stage = params.stageRef.current;
  if (!params.selectedClip || params.selectedClipLocked || !stage) {
    return null;
  }
  const transform = resolvePreviewClipTransform(params.project, params.selectedClip);

  return (
    <div
      className={[
        'pointer-events-none absolute border-2 border-dashed',
        'border-[color:var(--sniptale-color-border-accent-strong)]',
      ].join(' ')}
      style={getSelectionOverlayStyle(params.project, params.selectedClip, params.camera, stage)}
    >
      {(['nw', 'ne', 'sw', 'se'] as const satisfies PreviewStageInteractionMode[]).map((handle) => (
        <button
          key={handle}
          type="button"
          className={[
            PREVIEW_SELECTION_HANDLE_CLASS_NAME,
            PREVIEW_SELECTION_HANDLE_SURFACE_CLASS_NAME,
            PREVIEW_SELECTION_HANDLE_SHADOW_CLASS_NAME,
          ].join(' ')}
          style={getSelectionHandleStyle(handle, transform.rotation)}
          onPointerDown={(event) => params.beginInteraction(event, params.selectedClip!, handle)}
        />
      ))}
    </div>
  );
}
