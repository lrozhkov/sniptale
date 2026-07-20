import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioStageLayout } from '../../../features/scenario/stage/layout';
import {
  projectPoint as projectSourcePoint,
  projectRect as projectSourceRect,
} from '../../project/stage-render/svg-overlays.helpers';

export type ScenarioQuickEditTool = 'select' | 'pan' | ScenarioOverlay['kind'];

export type RectHandle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export { projectSourcePoint, projectSourceRect };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isRectOverlay(
  overlay: ScenarioOverlay
): overlay is Extract<ScenarioOverlay, { rect: ScenarioRect }> {
  return (
    overlay.kind === 'focus-rect' ||
    overlay.kind === 'rectangle' ||
    overlay.kind === 'ellipse' ||
    overlay.kind === 'blur-rect'
  );
}

export function unprojectStagePoint(
  layout: ScenarioStageLayout,
  point: ScenarioPoint
): ScenarioPoint {
  const scaleX = layout.sourceViewport.width / layout.imageRect.width;
  const scaleY = layout.sourceViewport.height / layout.imageRect.height;

  return {
    x: clamp((point.x - layout.imageRect.x) * scaleX, 0, layout.sourceViewport.width),
    y: clamp((point.y - layout.imageRect.y) * scaleY, 0, layout.sourceViewport.height),
  };
}

function toSourceDelta(layout: ScenarioStageLayout, deltaX: number, deltaY: number): ScenarioPoint {
  return {
    x: deltaX * (layout.sourceViewport.width / layout.imageRect.width),
    y: deltaY * (layout.sourceViewport.height / layout.imageRect.height),
  };
}

export function updateOverlayPoint(
  overlay: Extract<ScenarioOverlay, { point: ScenarioPoint }>,
  point: ScenarioPoint
): ScenarioOverlay {
  return {
    ...overlay,
    point,
  };
}

export function moveOverlayByStageDelta(
  layout: ScenarioStageLayout,
  overlay: ScenarioOverlay,
  deltaX: number,
  deltaY: number
): ScenarioOverlay {
  const sourceDelta = toSourceDelta(layout, deltaX, deltaY);

  if (overlay.kind === 'click-ring' || overlay.kind === 'cursor' || overlay.kind === 'text') {
    return {
      ...overlay,
      point: {
        x: clamp(overlay.point.x + sourceDelta.x, 0, layout.sourceViewport.width),
        y: clamp(overlay.point.y + sourceDelta.y, 0, layout.sourceViewport.height),
      },
    };
  }

  if (overlay.kind === 'arrow') {
    return {
      ...overlay,
      start: {
        x: overlay.start.x + sourceDelta.x,
        y: overlay.start.y + sourceDelta.y,
      },
      end: {
        x: overlay.end.x + sourceDelta.x,
        y: overlay.end.y + sourceDelta.y,
      },
    };
  }

  if (isRectOverlay(overlay)) {
    return {
      ...overlay,
      rect: {
        ...overlay.rect,
        x: overlay.rect.x + sourceDelta.x,
        y: overlay.rect.y + sourceDelta.y,
      },
    };
  }

  return overlay;
}

export function resizeRectOverlayByStageDelta(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { rect: ScenarioRect }>,
  handle: RectHandle,
  deltaX: number,
  deltaY: number
): ScenarioOverlay {
  const delta = toSourceDelta(layout, deltaX, deltaY);
  const rect = { ...overlay.rect };

  if (handle.includes('w')) {
    rect.x += delta.x;
    rect.width -= delta.x;
  }
  if (handle.includes('e')) {
    rect.width += delta.x;
  }
  if (handle.includes('n')) {
    rect.y += delta.y;
    rect.height -= delta.y;
  }
  if (handle.includes('s')) {
    rect.height += delta.y;
  }

  if (rect.width < 24) {
    if (handle.includes('w')) {
      rect.x -= 24 - rect.width;
    }
    rect.width = 24;
  }
  if (rect.height < 24) {
    if (handle.includes('n')) {
      rect.y -= 24 - rect.height;
    }
    rect.height = 24;
  }

  return {
    ...overlay,
    rect,
  };
}

export function moveArrowEndpointByStageDelta(
  layout: ScenarioStageLayout,
  overlay: Extract<ScenarioOverlay, { kind: 'arrow' }>,
  endpoint: 'start' | 'end',
  deltaX: number,
  deltaY: number
): ScenarioOverlay {
  const delta = toSourceDelta(layout, deltaX, deltaY);

  return {
    ...overlay,
    [endpoint]: {
      x: overlay[endpoint].x + delta.x,
      y: overlay[endpoint].y + delta.y,
    },
  };
}

export function zoomImageTransform(
  step: ScenarioCaptureStep,
  delta: number
): ScenarioCaptureStep['imageTransform'] {
  return {
    ...step.imageTransform,
    scale: clamp(Number((step.imageTransform.scale + delta).toFixed(2)), 0.4, 3),
  };
}
