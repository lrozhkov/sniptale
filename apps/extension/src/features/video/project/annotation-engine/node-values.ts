import type {
  ResolvedAnnotationFrame,
  ResolvedAnnotationRenderNode,
  ResolvedAnnotationTimelineTrackState,
  ResolvedAnnotationTransform,
} from './scene';
import type { VideoAnnotationPrimitiveValue, VideoAnnotationRenderNode } from './types';

export const DEFAULT_NODE_TRANSFORM: ResolvedAnnotationTransform = {
  blurPx: 0,
  rotation: 0,
  scale: 1,
  x: 0,
  y: 0,
};

export function resolveNodeFrame(
  node: VideoAnnotationRenderNode,
  parentFrame: ResolvedAnnotationFrame
): ResolvedAnnotationFrame {
  return {
    height: resolveFrameSize(node.frame?.height, parentFrame.height),
    opacity: 1,
    rotation: 0,
    width: resolveFrameSize(node.frame?.width, parentFrame.width),
    x: parentFrame.x + resolveFrameOffset(node.frame?.x, parentFrame.width),
    y: parentFrame.y + resolveFrameOffset(node.frame?.y, parentFrame.height),
  };
}

export function applyNodeValues(
  node: ResolvedAnnotationRenderNode,
  values: readonly Pick<ResolvedAnnotationTimelineTrackState, 'property' | 'value'>[],
  parentFrame: Pick<ResolvedAnnotationFrame, 'x' | 'y'> = { x: 0, y: 0 },
  coordinateMode: 'frame' | 'transform' = 'frame'
): ResolvedAnnotationRenderNode {
  return values.reduce(
    (current, update) => applyNodeValue(current, update, parentFrame, coordinateMode),
    node
  );
}

export function readNumber(
  value: VideoAnnotationPrimitiveValue | undefined,
  fallback: number
): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function resolveFrameSize(value: number | string | undefined, parentSize: number): number {
  return resolveFrameValue(value, parentSize, parentSize);
}

function resolveFrameOffset(value: number | string | undefined, parentSize: number): number {
  return resolveFrameValue(value, parentSize, 0);
}

function resolveFrameValue(
  value: number | string | undefined,
  parentSize: number,
  fallback: number
): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = parsePercentFrameValue(value);
  if (!parsed) {
    return 0;
  }
  return parentSize * parsed.percent + parsed.offset;
}

function parsePercentFrameValue(value: string): { offset: number; percent: number } | null {
  const percentMarker = value.indexOf('%');
  if (percentMarker <= 0) {
    return null;
  }
  const percent = parseFinitePositiveNumber(value.slice(0, percentMarker));
  if (percent === null) {
    return null;
  }
  const offsetSource = value.slice(percentMarker + 1);
  const offset = parseSignedOffset(offsetSource);
  return offset === null ? null : { offset, percent: percent / 100 };
}

function parseSignedOffset(value: string): number | null {
  if (!value) {
    return 0;
  }
  const sign = value[0];
  if (sign !== '+' && sign !== '-') {
    return null;
  }
  const parsed = parseFinitePositiveNumber(value.slice(1));
  if (parsed === null) {
    return null;
  }
  return sign === '-' ? -parsed : parsed;
}

function parseFinitePositiveNumber(value: string): number | null {
  if (!value || ![...value].every(isNumberTokenCharacter)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isNumberTokenCharacter(value: string): boolean {
  return value === '.' || (value >= '0' && value <= '9');
}

function applyNodeValue(
  node: ResolvedAnnotationRenderNode,
  update: Pick<ResolvedAnnotationTimelineTrackState, 'property' | 'value'>,
  parentFrame: Pick<ResolvedAnnotationFrame, 'x' | 'y'>,
  coordinateMode: 'frame' | 'transform'
): ResolvedAnnotationRenderNode {
  if (update.property === 'x') {
    return applyNodePositionValue(
      node,
      { property: 'x', value: update.value },
      parentFrame.x,
      coordinateMode
    );
  }
  if (update.property === 'y') {
    return applyNodePositionValue(
      node,
      { property: 'y', value: update.value },
      parentFrame.y,
      coordinateMode
    );
  }
  if (isFrameSizeProperty(update.property)) {
    return { ...node, frame: { ...node.frame, [update.property]: readNumber(update.value, 0) } };
  }
  if (isNumericRenderProperty(update.property)) {
    return applyNumericRenderValue(node, update);
  }
  if (update.property === 'progress' || update.property === 'drawProgress') {
    return { ...node, props: { ...node.props, progress: update.value } };
  }
  if (update.property === 'maskProgress') {
    return { ...node, props: { ...node.props, maskProgress: update.value } };
  }
  if (update.property === 'text' && typeof update.value === 'string') {
    return { ...node, props: { ...node.props, text: update.value } };
  }
  if (isStyleProperty(update.property)) {
    return { ...node, style: { ...node.style, [update.property]: update.value } };
  }
  return { ...node, props: { ...node.props, [update.property]: update.value } };
}

function applyNodePositionValue(
  node: ResolvedAnnotationRenderNode,
  update: Pick<ResolvedAnnotationTimelineTrackState, 'property' | 'value'> & {
    property: 'x' | 'y';
  },
  parentOffset: number,
  coordinateMode: 'frame' | 'transform'
): ResolvedAnnotationRenderNode {
  if (coordinateMode === 'transform') {
    return {
      ...node,
      transform: {
        ...node.transform,
        [update.property]: readNumber(update.value, node.transform[update.property]),
      },
    };
  }
  return {
    ...node,
    frame: {
      ...node.frame,
      [update.property]:
        parentOffset + readNumber(update.value, node.frame[update.property] - parentOffset),
    },
  };
}

function applyNumericRenderValue(
  node: ResolvedAnnotationRenderNode,
  update: Pick<ResolvedAnnotationTimelineTrackState, 'property' | 'value'>
): ResolvedAnnotationRenderNode {
  if (update.property === 'opacity') {
    return { ...node, opacity: readNumber(update.value, node.opacity) };
  }
  if (update.property === 'scale') {
    return {
      ...node,
      transform: { ...node.transform, scale: readNumber(update.value, node.transform.scale) },
    };
  }
  return {
    ...node,
    transform: { ...node.transform, [update.property]: readNumber(update.value, 0) },
  };
}

function isFrameSizeProperty(property: string): property is 'height' | 'width' {
  return property === 'height' || property === 'width';
}

function isNumericRenderProperty(
  property: string
): property is 'blurPx' | 'opacity' | 'rotation' | 'scale' {
  return (
    property === 'opacity' ||
    property === 'scale' ||
    property === 'rotation' ||
    property === 'blurPx'
  );
}

function isStyleProperty(property: string): boolean {
  return (
    property === 'align' ||
    property === 'backgroundFill' ||
    property === 'fill' ||
    property === 'fontFamily' ||
    property === 'fontSize' ||
    property === 'lineHeight' ||
    property === 'radius' ||
    property === 'shadowBlur' ||
    property === 'shadowColor' ||
    property === 'shadowY' ||
    property === 'stroke' ||
    property === 'strokeWidth' ||
    property === 'weight'
  );
}
