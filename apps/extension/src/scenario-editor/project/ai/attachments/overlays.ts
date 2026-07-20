import {
  createScenarioBlurOverlay,
  createScenarioClickOverlay,
  createScenarioCursorOverlay,
  createScenarioFocusOverlay,
} from '../../stage-render/overlays';
import type { ScenarioOverlay } from '../../../../features/scenario/contracts/types/overlays';
import type {
  ScenarioPoint,
  ScenarioRect,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioAIAnnotation } from '../../../../contracts/ai/scenario';

const DEFAULT_SHAPE_STROKE_COLOR = '#f97316';
const DEFAULT_SHAPE_FILL_COLOR = 'rgba(249,115,22,0.14)';
const DEFAULT_TEXT_COLOR = '#111827';
const DEFAULT_TEXT_FONT_FAMILY = 'system-ui';

function createArrowOverlay(start: ScenarioPoint, end: ScenarioPoint): ScenarioOverlay {
  return {
    color: DEFAULT_SHAPE_STROKE_COLOR,
    end,
    id: crypto.randomUUID(),
    kind: 'arrow',
    start,
    strokeWidth: 6,
  };
}

function createShapeOverlay(
  kind: Extract<ScenarioOverlay['kind'], 'rectangle' | 'ellipse'>,
  rect: ScenarioRect
): ScenarioOverlay {
  return {
    fillColor: DEFAULT_SHAPE_FILL_COLOR,
    id: crypto.randomUUID(),
    kind,
    rect,
    strokeColor: DEFAULT_SHAPE_STROKE_COLOR,
    strokeWidth: 4,
  };
}

function createTextOverlay(point: ScenarioPoint, text: string): ScenarioOverlay {
  return {
    color: DEFAULT_TEXT_COLOR,
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontSize: 24,
    fontWeight: 600,
    id: crypto.randomUUID(),
    kind: 'text',
    point,
    text,
  };
}

export function createScenarioOverlayFromAIAnnotation(
  annotation: ScenarioAIAnnotation
): ScenarioOverlay | null {
  switch (annotation.tool) {
    case 'focus-rect':
      return createScenarioFocusOverlay(annotation.rect);
    case 'click-ring':
      return createScenarioClickOverlay(annotation.point);
    case 'cursor':
      return createScenarioCursorOverlay(annotation.point);
    case 'blur-rect':
      return createScenarioBlurOverlay(annotation.rect);
    case 'arrow':
      return createArrowOverlay(annotation.start, annotation.end);
    case 'rectangle':
      return createShapeOverlay('rectangle', annotation.rect);
    case 'ellipse':
      return createShapeOverlay('ellipse', annotation.rect);
    case 'text': {
      const text = annotation.text.trim();
      return text ? createTextOverlay(annotation.point, text) : null;
    }
  }
}

export function summarizeScenarioOverlay(overlay: ScenarioOverlay) {
  switch (overlay.kind) {
    case 'focus-rect':
    case 'rectangle':
    case 'ellipse':
    case 'blur-rect':
      return { kind: overlay.kind, rect: overlay.rect } as const;
    case 'click-ring':
    case 'cursor':
      return { kind: overlay.kind, point: overlay.point } as const;
    case 'arrow':
      return { end: overlay.end, kind: overlay.kind, start: overlay.start } as const;
    case 'text':
      return { kind: overlay.kind, point: overlay.point, text: overlay.text } as const;
  }
}
