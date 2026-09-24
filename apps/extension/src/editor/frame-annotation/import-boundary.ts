// policyStateIds: [] - canonical proxy keys are an immutable import allowlist, not authority state.
import { parseSerializedFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import { CUSTOM_JSON_PROPS } from '../document/model/custom-json-props';
import { createFrameAnnotationProxy, FRAME_ANNOTATION_PROXY_FILL } from './proxy';

export function normalizeFrameAnnotationsInCanvasJson(canvasJson: string): string {
  const parsed = parseCanvasJson(canvasJson);
  if (!isRecord(parsed) || !Array.isArray(parsed['objects'])) return canvasJson;
  const objects = parsed['objects'].map((value) => normalizeTopLevelFrameProxy(value));
  const normalized = JSON.stringify({ ...parsed, objects });
  assertValidFrameAnnotationsInCanvasJson(normalized);
  return normalized;
}

export function assertValidFrameAnnotationsInCanvasJson(canvasJson: string): void {
  const parsed = parseCanvasJson(canvasJson);
  if (!isRecord(parsed) || !Array.isArray(parsed['objects'])) return;
  for (const value of parsed['objects']) validateFabricObject(value, false);
}

function parseCanvasJson(canvasJson: string): unknown {
  try {
    return JSON.parse(canvasJson) as unknown;
  } catch {
    throw new Error('Invalid editor canvas JSON');
  }
}

const CANONICAL_PROXY_KEYS = new Set([
  'angle',
  'backgroundColor',
  'fill',
  'fillRule',
  'flipX',
  'flipY',
  'globalCompositeOperation',
  'height',
  'left',
  'opacity',
  'originX',
  'originY',
  'paintFirst',
  'rx',
  'ry',
  'scaleX',
  'scaleY',
  'shadow',
  'skewX',
  'skewY',
  'sniptaleFrameAnnotationJson',
  'sniptaleFrameAnnotationRevision',
  'sniptaleId',
  'sniptaleLabel',
  'sniptaleLocked',
  'sniptaleRole',
  'sniptaleType',
  'stroke',
  'strokeDashArray',
  'strokeDashOffset',
  'strokeLineCap',
  'strokeLineJoin',
  'strokeMiterLimit',
  'strokeUniform',
  'strokeWidth',
  'top',
  'type',
  'version',
  'visible',
  'width',
]);

function normalizeTopLevelFrameProxy(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const hasFrameMetadata =
    value['sniptaleType'] === 'frame-annotation' ||
    value['sniptaleFrameAnnotationJson'] !== undefined ||
    value['sniptaleFrameAnnotationRevision'] !== undefined;
  if (!hasFrameMetadata) {
    validateFabricObject(value, false);
    return value;
  }
  if (isCanonicalFrameProxy(value)) return value;

  const snapshot = parseSerializedFrameAnnotationSnapshot(value['sniptaleFrameAnnotationJson']);
  if (
    !snapshot ||
    value['type'] !== 'Rect' ||
    value['sniptaleType'] !== 'frame-annotation' ||
    value['sniptaleId'] !== snapshot.id ||
    value['sniptaleRole'] !== 'annotation' ||
    typeof value['sniptaleLabel'] !== 'string' ||
    typeof value['visible'] !== 'boolean' ||
    (value['sniptaleLocked'] !== undefined && typeof value['sniptaleLocked'] !== 'boolean') ||
    !Number.isSafeInteger(value['sniptaleFrameAnnotationRevision']) ||
    Number(value['sniptaleFrameAnnotationRevision']) < 1 ||
    !Object.keys(value).every((key) => CANONICAL_PROXY_KEYS.has(key)) ||
    value['objects'] !== undefined ||
    value['clipPath'] !== undefined
  ) {
    throw new Error('Invalid frame annotation metadata');
  }

  const proxy = createFrameAnnotationProxy({
    frame: snapshot,
    ordering: snapshot.ordering,
    label: value['sniptaleLabel'],
  });
  proxy.visible = value['visible'];
  if (typeof value['sniptaleLocked'] === 'boolean') {
    proxy.sniptaleLocked = value['sniptaleLocked'];
  }
  proxy.sniptaleFrameAnnotationRevision = Number(value['sniptaleFrameAnnotationRevision']);
  return proxy.toObject([...CUSTOM_JSON_PROPS]);
}

function validateFabricObject(value: unknown, nested: boolean): void {
  if (!isRecord(value)) return;
  const hasFrameMetadata =
    value['sniptaleType'] === 'frame-annotation' ||
    value['sniptaleFrameAnnotationJson'] !== undefined ||
    value['sniptaleFrameAnnotationRevision'] !== undefined;
  if (hasFrameMetadata && (nested || !isCanonicalFrameProxy(value))) {
    throw new Error('Invalid frame annotation metadata');
  }
  if (Array.isArray(value['objects'])) {
    for (const child of value['objects']) validateFabricObject(child, true);
  }
  if (value['clipPath'] !== undefined) validateFabricObject(value['clipPath'], true);
}

function isCanonicalFrameProxy(value: Record<string, unknown>): boolean {
  const snapshot = parseSerializedFrameAnnotationSnapshot(value['sniptaleFrameAnnotationJson']);
  return Boolean(
    snapshot &&
    Object.keys(value).every((key) => CANONICAL_PROXY_KEYS.has(key)) &&
    value['type'] === 'Rect' &&
    value['sniptaleType'] === 'frame-annotation' &&
    value['sniptaleId'] === snapshot.id &&
    value['sniptaleRole'] === 'annotation' &&
    typeof value['sniptaleLabel'] === 'string' &&
    value['fill'] === FRAME_ANNOTATION_PROXY_FILL &&
    value['stroke'] === null &&
    value['strokeWidth'] === 0 &&
    value['strokeDashArray'] === null &&
    value['strokeDashOffset'] === 0 &&
    value['strokeLineCap'] === 'butt' &&
    value['strokeLineJoin'] === 'miter' &&
    value['strokeMiterLimit'] === 4 &&
    value['strokeUniform'] === false &&
    value['originX'] === 'left' &&
    value['originY'] === 'top' &&
    value['left'] === snapshot.x &&
    value['top'] === snapshot.y &&
    value['width'] === snapshot.width &&
    value['height'] === snapshot.height &&
    value['scaleX'] === 1 &&
    value['scaleY'] === 1 &&
    value['angle'] === 0 &&
    value['skewX'] === 0 &&
    value['skewY'] === 0 &&
    value['flipX'] === false &&
    value['flipY'] === false &&
    value['opacity'] === 1 &&
    value['shadow'] === null &&
    value['backgroundColor'] === '' &&
    value['fillRule'] === 'nonzero' &&
    value['paintFirst'] === 'fill' &&
    value['globalCompositeOperation'] === 'source-over' &&
    value['rx'] === 0 &&
    value['ry'] === 0 &&
    typeof value['visible'] === 'boolean' &&
    (value['sniptaleLocked'] === undefined || typeof value['sniptaleLocked'] === 'boolean') &&
    Number.isSafeInteger(value['sniptaleFrameAnnotationRevision']) &&
    Number(value['sniptaleFrameAnnotationRevision']) >= 1
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
