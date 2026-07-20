export type VideoAnnotationNodeProperty =
  | 'align'
  | 'arrowEnd'
  | 'backgroundFill'
  | 'drawProgress'
  | 'fill'
  | 'fontFamily'
  | 'fontSize'
  | 'height'
  | 'lineHeight'
  | 'maskDirection'
  | 'maskProgress'
  | 'opacity'
  | 'path'
  | 'progress'
  | 'radius'
  | 'shadowBlur'
  | 'shadowColor'
  | 'shadowY'
  | 'stroke'
  | 'strokeWidth'
  | 'text'
  | 'weight'
  | 'width'
  | 'x'
  | 'y';

export const VIDEO_ANNOTATION_NODE_PROPERTIES = [
  'align',
  'arrowEnd',
  'backgroundFill',
  'drawProgress',
  'fill',
  'fontFamily',
  'fontSize',
  'height',
  'lineHeight',
  'maskDirection',
  'maskProgress',
  'opacity',
  'path',
  'progress',
  'radius',
  'shadowBlur',
  'shadowColor',
  'shadowY',
  'stroke',
  'strokeWidth',
  'text',
  'weight',
  'width',
  'x',
  'y',
] as const satisfies readonly VideoAnnotationNodeProperty[];
