// policyStateIds: [] - canonical proxy keys are an immutable import allowlist, not authority state.
import { parseSerializedFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation';
import { FRAME_ANNOTATION_PROXY_FILL } from './proxy';

export function assertValidFrameAnnotationsInCanvasJson(canvasJson: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(canvasJson) as unknown;
  } catch {
    throw new Error('Invalid editor canvas JSON');
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['objects'])) return;
  for (const value of parsed['objects']) validateFabricObject(value, false);
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
    value['sniptaleId'] === snapshot.id &&
    value['sniptaleRole'] === 'annotation' &&
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
