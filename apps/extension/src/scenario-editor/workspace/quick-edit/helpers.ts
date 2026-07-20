import {
  createScenarioBlurOverlay,
  createScenarioClickOverlay,
  createScenarioCursorOverlay,
  createScenarioFocusOverlay,
} from '../../project/stage-render/overlays';
import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioOverlay } from '../../../features/scenario/contracts/types/overlays';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';

type SupportedOverlayKind = ScenarioOverlay['kind'];

function createCenteredPoint(step: ScenarioCaptureStep): ScenarioPoint {
  const width = Math.max(step.page.viewport.width, 240);
  const height = Math.max(step.page.viewport.height, 180);

  return {
    x: Math.round(width / 2),
    y: Math.round(height / 2),
  };
}

function createCenteredRect(step: ScenarioCaptureStep): ScenarioRect {
  const width = Math.max(step.page.viewport.width, 480);
  const height = Math.max(step.page.viewport.height, 320);
  const rectWidth = Math.max(Math.round(width * 0.28), 120);
  const rectHeight = Math.max(Math.round(height * 0.2), 80);

  return {
    x: Math.round((width - rectWidth) / 2),
    y: Math.round((height - rectHeight) / 2),
    width: rectWidth,
    height: rectHeight,
  };
}

function createArrowOverlay(rect: ScenarioRect): ScenarioOverlay {
  return {
    id: crypto.randomUUID(),
    kind: 'arrow',
    start: { x: rect.x, y: rect.y + rect.height },
    end: { x: rect.x + rect.width, y: rect.y },
    color: '#f97316',
    strokeWidth: 6,
  };
}

function createShapeOverlay(
  kind: Extract<SupportedOverlayKind, 'rectangle' | 'ellipse'>,
  rect: ScenarioRect
): ScenarioOverlay {
  return {
    id: crypto.randomUUID(),
    kind,
    rect,
    strokeColor: '#f97316',
    fillColor: 'rgba(249,115,22,0.14)',
    strokeWidth: 4,
  };
}

function createTextOverlay(point: ScenarioPoint): ScenarioOverlay {
  return {
    id: crypto.randomUUID(),
    kind: 'text',
    point,
    text: 'Text',
    color: '#111827',
    fontSize: 24,
    fontFamily: 'system-ui',
    fontWeight: 600,
  };
}

export function createScenarioOverlayDraft(
  step: ScenarioCaptureStep,
  kind: SupportedOverlayKind
): ScenarioOverlay {
  const center = createCenteredPoint(step);
  const rect = createCenteredRect(step);

  switch (kind) {
    case 'focus-rect':
      return createScenarioFocusOverlay(rect);
    case 'click-ring':
      return createScenarioClickOverlay(center);
    case 'cursor':
      return createScenarioCursorOverlay(center);
    case 'blur-rect':
      return createScenarioBlurOverlay(rect);
    case 'arrow':
      return createArrowOverlay(rect);
    case 'rectangle':
      return createShapeOverlay('rectangle', rect);
    case 'ellipse':
      return createShapeOverlay('ellipse', rect);
    case 'text':
      return createTextOverlay(center);
  }
}

export function updateScenarioOverlay(
  overlays: ScenarioOverlay[],
  overlayId: string,
  updater: (overlay: ScenarioOverlay) => ScenarioOverlay
): ScenarioOverlay[] {
  return overlays.map((overlay) => (overlay.id === overlayId ? updater(overlay) : overlay));
}
