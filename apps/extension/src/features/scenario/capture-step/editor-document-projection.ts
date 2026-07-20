import type { EditorDocument } from '../../editor/document/public';
import type { ScenarioOverlay, ScenarioOverlayAutoSource } from '../contracts/types/overlays';
import type { ScenarioPoint } from '@sniptale/runtime-contracts/scenario/types/geometry';
import { parseScenarioEditorCanvasJson } from './editor-canvas-json';

function parseCanvasObjects(document: EditorDocument): Record<string, unknown>[] {
  return parseScenarioEditorCanvasJson(document.canvasJson)?.objects ?? [];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getObjectRect(object: Record<string, unknown>) {
  const left = asNumber(object['left']);
  const top = asNumber(object['top']);
  const width = asNumber(object['width']);
  const height = asNumber(object['height']);

  return left !== null && top !== null && width !== null && height !== null
    ? { x: left, y: top, width, height }
    : null;
}

function asAutoSource(value: unknown): ScenarioOverlayAutoSource | undefined {
  return value === 'capture-target' || value === 'capture-click' ? value : undefined;
}

function projectRectObject(
  object: Record<string, unknown>
): Extract<ScenarioOverlay, { kind: 'focus-rect' }> | null {
  const id = asString(object['sniptaleId']) ?? crypto.randomUUID();
  const autoSource = asAutoSource(object['sniptaleAutoSource']);
  const rect = getObjectRect(object);

  return rect
    ? {
        id,
        ...(autoSource ? { autoSource } : {}),
        kind: 'focus-rect',
        rect,
      }
    : null;
}

function projectBlurOverlay(
  object: Record<string, unknown>
): Extract<ScenarioOverlay, { kind: 'blur-rect' }> | null {
  const id = asString(object['sniptaleId']) ?? crypto.randomUUID();
  const rect = getObjectRect(object);
  const amount = asNumber(object['sniptaleBlurAmount']);
  const blurType = asString(object['sniptaleBlurType']);
  const autoSource = asAutoSource(object['sniptaleAutoSource']);

  if (
    !rect ||
    amount === null ||
    (blurType !== 'gaussian' &&
      blurType !== 'distortion' &&
      blurType !== 'pixelate' &&
      blurType !== 'solid')
  ) {
    return null;
  }

  return {
    id,
    ...(autoSource ? { autoSource } : {}),
    kind: 'blur-rect',
    rect,
    blurSettings: {
      amount,
      blurType,
      showBorder: object['sniptaleBlurShowBorder'] === true,
    },
  };
}

function projectEllipsePoint(object: Record<string, unknown>): ScenarioPoint | null {
  const left = asNumber(object['left']);
  const top = asNumber(object['top']);

  return left !== null && top !== null ? { x: left, y: top } : null;
}

function projectTaggedOverlay(object: Record<string, unknown>): ScenarioOverlay | null {
  const metaKind = asString(object['sniptaleMetaKind']);
  const id = asString(object['sniptaleId']) ?? crypto.randomUUID();
  const autoSource = asAutoSource(object['sniptaleAutoSource']);

  if (metaKind === 'scenario-focus-rect') {
    return projectRectObject({ ...object, sniptaleId: id });
  }

  if (metaKind === 'scenario-blur-rect' || object['sniptaleType'] === 'blur') {
    return projectBlurOverlay({ ...object, sniptaleId: id });
  }

  const point = projectEllipsePoint(object);
  if (!point) {
    return null;
  }

  if (metaKind === 'scenario-click-ring') {
    return { id, ...(autoSource ? { autoSource } : {}), kind: 'click-ring', point };
  }

  if (metaKind === 'scenario-cursor') {
    return { id, ...(autoSource ? { autoSource } : {}), kind: 'cursor', point };
  }

  return null;
}

export function projectCompatOverlaysFromEditorDocument(
  document: EditorDocument
): ScenarioOverlay[] {
  return parseCanvasObjects(document)
    .map(projectTaggedOverlay)
    .filter((overlay): overlay is ScenarioOverlay => overlay !== null);
}
