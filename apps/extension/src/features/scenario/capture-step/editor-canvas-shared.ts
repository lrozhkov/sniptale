const CANVAS_JSON_VERSION = '7.2.0';
const DEFAULT_FILL_RULE = 'nonzero';
const DEFAULT_PAINT_FIRST = 'fill';
const DEFAULT_BLEND_MODE = 'source-over';

export type ScenarioEditorCanvasObject = Record<
  string,
  number | string | boolean | null | number[]
>;

export function createCanvasBaseObject(args: {
  angle?: number;
  fill: string;
  height: number;
  left: number;
  opacity?: number;
  originX: 'center' | 'left';
  originY: 'center' | 'top';
  stroke: string | null;
  strokeDashArray?: number[] | null;
  strokeWidth: number;
  top: number;
  type: 'Ellipse' | 'Rect';
  width: number;
}) {
  return {
    type: args.type,
    version: CANVAS_JSON_VERSION,
    originX: args.originX,
    originY: args.originY,
    left: args.left,
    top: args.top,
    width: args.width,
    height: args.height,
    fill: args.fill,
    stroke: args.stroke,
    strokeWidth: args.strokeWidth,
    strokeDashArray: args.strokeDashArray ?? null,
    strokeLineCap: 'butt',
    strokeDashOffset: 0,
    strokeLineJoin: 'miter',
    strokeUniform: true,
    strokeMiterLimit: 4,
    scaleX: 1,
    scaleY: 1,
    angle: args.angle ?? 0,
    flipX: false,
    flipY: false,
    opacity: args.opacity ?? 1,
    shadow: null,
    visible: true,
    backgroundColor: '',
    fillRule: DEFAULT_FILL_RULE,
    paintFirst: DEFAULT_PAINT_FIRST,
    globalCompositeOperation: DEFAULT_BLEND_MODE,
    skewX: 0,
    skewY: 0,
  };
}

export function createScenarioEditorCanvasDocument(objects: ScenarioEditorCanvasObject[]) {
  return {
    version: CANVAS_JSON_VERSION,
    objects,
  };
}
