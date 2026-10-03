import { Rect, type FabricObject } from 'fabric';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { parseScenarioBlurMetadata } from './scenario-blur-metadata';
import { parseFrameAnnotationSnapshot } from '../../features/highlighter/frame-annotation/parser';
import { createFrameAnnotationProxy } from '../frame-annotation/proxy';
import { createEditorDrawingFabricObject } from '../drawing/object/vector';
import { CUSTOM_JSON_PROPS } from './model/custom-json-props';

const SCENARIO_KINDS = new Set([
  'scenario-focus-rect',
  'scenario-click-ring',
  'scenario-cursor',
  'scenario-blur-rect',
]);
const FIXED_FIELDS = {
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  skewX: 0,
  skewY: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  shadow: null,
  backgroundColor: '',
  fillRule: 'nonzero',
  paintFirst: 'fill',
  globalCompositeOperation: 'source-over',
  strokeUniform: true,
  strokeLineCap: 'butt',
  strokeLineJoin: 'miter',
  strokeDashOffset: 0,
  strokeMiterLimit: 4,
  strokeDashArray: null,
} as const;
const SCENARIO_FIELDS = new Set([
  ...Object.keys(FIXED_FIELDS),
  'type',
  'version',
  'originX',
  'originY',
  'left',
  'top',
  'width',
  'height',
  'fill',
  'stroke',
  'strokeWidth',
  'rx',
  'ry',
  'visible',
  'sniptaleId',
  'sniptaleType',
  'sniptaleRole',
  'sniptaleLabel',
  'sniptaleLocked',
  'sniptaleMetaKind',
  'sniptaleAutoSource',
  'sniptaleBorderPresetId',
  'sniptaleShapeStrokeStyle',
  'sniptaleShapeRadius',
  'sniptaleShapeShadow',
  'sniptaleBlurAmount',
  'sniptaleBlurType',
  'sniptaleBlurShowBorder',
  'sniptaleBlurStrokeColor',
  'sniptaleBlurStrokeWidth',
  'sniptaleBlurSourceData',
  'sniptaleBlurSourceLeft',
  'sniptaleBlurSourceTop',
  'sniptaleBlurSourceWidth',
  'sniptaleBlurSourceHeight',
]);

function invalid(): never {
  throw new Error('Invalid scenario editor annotation');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 131_072) invalid();
  return value;
}
function size(value: unknown): number {
  const result = number(value);
  if (result < 0) invalid();
  return result;
}
function color(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) invalid();
  return value;
}

function validateObject(value: Record<string, unknown>, point: boolean): string {
  if (
    !Object.keys(value).every((key) => SCENARIO_FIELDS.has(key)) ||
    !Object.entries(FIXED_FIELDS).every(([key, expected]) => value[key] === expected) ||
    value['type'] !== (point ? 'Ellipse' : 'Rect') ||
    value['originX'] !== (point ? 'center' : 'left') ||
    value['originY'] !== (point ? 'center' : 'top') ||
    value['sniptaleRole'] !== 'annotation' ||
    typeof value['visible'] !== 'boolean' ||
    (value['sniptaleLocked'] !== undefined && typeof value['sniptaleLocked'] !== 'boolean') ||
    (value['sniptaleLabel'] !== undefined && typeof value['sniptaleLabel'] !== 'string')
  )
    invalid();
  const id = value['sniptaleId'];
  if (typeof id !== 'string' || !id || id.length > 256) invalid();
  return id;
}

function createScenarioFrame(
  value: Record<string, unknown>,
  bounds: { id: string; x: number; y: number; width: number; height: number },
  ordering: number
): FabricObject {
  const { id, x, y, width, height } = bounds;
  const snapshot = parseFrameAnnotationSnapshot({
    version: 1,
    id,
    ordering,
    x,
    y,
    width,
    height,
    effectMode: 'border',
    borderSettings: {
      color: value['stroke'],
      width: value['strokeWidth'],
      style: value['sniptaleShapeStrokeStyle'],
      radius: value['sniptaleShapeRadius'],
      shadow: value['sniptaleShapeShadow'],
      fillColor: value['fill'],
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      customCss: '',
      inheritCustomCss: false,
    },
  });
  if (!snapshot || typeof value['sniptaleLabel'] !== 'string') invalid();
  return createFrameAnnotationProxy({ frame: snapshot, ordering, label: value['sniptaleLabel'] });
}

function createScenarioBlur(
  value: Record<string, unknown>,
  bounds: { id: string; x: number; y: number; width: number; height: number }
): FabricObject {
  const metadata = JSON.stringify({
    version: 1,
    id: bounds.id,
    settings: {
      amount: value['sniptaleBlurAmount'],
      blurType: value['sniptaleBlurType'],
      showBorder: value['sniptaleBlurShowBorder'],
      strokeColor: value['sniptaleBlurStrokeColor'],
      strokeWidth: value['sniptaleBlurStrokeWidth'],
      strokeStyle: value['sniptaleShapeStrokeStyle'],
      radius: value['sniptaleShapeRadius'],
      shadow: value['sniptaleShapeShadow'],
      borderPresetId: value['sniptaleBorderPresetId'],
    },
  });
  const source = value['sniptaleBlurSourceData'];
  if (!parseScenarioBlurMetadata(metadata) || typeof source !== 'string' || !isImageDataUrl(source))
    invalid();
  const object = new Rect({
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    originX: 'left',
    originY: 'top',
    fill: 'transparent',
    strokeWidth: 0,
  });
  object.sniptaleId = bounds.id;
  object.sniptaleType = 'blur';
  object.sniptaleRole = 'annotation';
  object.sniptaleScenarioBlurJson = metadata;
  object.sniptaleBlurSourceData = source;
  object.sniptaleBlurSourceLeft = number(value['sniptaleBlurSourceLeft']);
  object.sniptaleBlurSourceTop = number(value['sniptaleBlurSourceTop']);
  object.sniptaleBlurSourceWidth = size(value['sniptaleBlurSourceWidth']);
  object.sniptaleBlurSourceHeight = size(value['sniptaleBlurSourceHeight']);
  return object;
}

function convertObject(value: Record<string, unknown>, ordering: number): unknown {
  const kind = value['sniptaleMetaKind'];
  const point = kind === 'scenario-click-ring' || kind === 'scenario-cursor';
  const id = validateObject(value, point);
  if (
    kind !== 'scenario-blur-rect' &&
    Object.keys(value).some((key) => key.startsWith('sniptaleBlur'))
  )
    invalid();
  const x = number(value['left']);
  const y = number(value['top']);
  const width = size(value['width']);
  const height = size(value['height']);
  let object: FabricObject;
  if (point) {
    if (
      value['sniptaleType'] !== 'ellipse' ||
      size(value['rx']) * 2 !== width ||
      size(value['ry']) * 2 !== height
    )
      invalid();
    object = createEditorDrawingFabricObject(
      {
        id,
        kind: 'ellipse',
        bounds: { x: x - width / 2, y: y - height / 2, width, height },
        color: color(value['stroke']),
        fillColor: color(value['fill']),
        width: size(value['strokeWidth']),
      },
      ordering + 1
    );
  } else {
    const blur = kind === 'scenario-blur-rect';
    if (value['sniptaleType'] !== (blur ? 'blur' : 'rectangle')) invalid();
    object = blur
      ? createScenarioBlur(value, { id, x, y, width, height })
      : createScenarioFrame(value, { id, x, y, width, height }, ordering);
  }
  object.visible = value['visible'] === true;
  if (typeof value['sniptaleLabel'] === 'string') object.sniptaleLabel = value['sniptaleLabel'];
  if (typeof value['sniptaleLocked'] === 'boolean') object.sniptaleLocked = value['sniptaleLocked'];
  return object.toObject([...CUSTOM_JSON_PROPS]);
}

/** Converts only the tagged, untransformed annotations emitted by scenario capture. */
export function normalizeScenarioAnnotationsInCanvasJson(canvasJson: string): string {
  const parsed: unknown = JSON.parse(canvasJson);
  if (!isRecord(parsed) || !Array.isArray(parsed['objects'])) return canvasJson;
  if (parsed['objects'].length > 20_000) invalid();
  let changed = false;
  const objects = parsed['objects'].map((value: unknown, ordering: number) => {
    if (!isRecord(value)) return value;
    const kind = value['sniptaleMetaKind'];
    if (typeof kind !== 'string' || !SCENARIO_KINDS.has(kind)) return value;
    changed = true;
    return convertObject(value, ordering);
  });
  return changed ? JSON.stringify({ ...parsed, objects }) : canvasJson;
}
