import {
  EFFECT_SVG_VECTOR_LIMITS,
  getSerializedSvgVectorPartCharacterCount,
} from '../../../contracts/effect-runtime/svg-vector';

import { inspectEffectSvgBeforeDom } from './preflight';
import type { SerializedSvgVectorPart, SerializedSvgVectorSource } from './source';
import {
  assertBoundedSvgId,
  clampSvgValue,
  normalizeSvgPaint,
  parseSvgViewBox,
  readFiniteSvgAttribute,
  readNonNegativeSvgAttribute,
  readSvgAttribute,
} from './vector-attributes';

interface SvgInheritedState {
  fill: string | null;
  groupId: string | null;
  groupIds: string[];
  opacity: number;
  stroke: string | null;
  strokeLineCap: string;
  strokeLineJoin: string;
  strokeWidth: number;
}

export function serializeEffectSvgVector(
  source: string,
  fallback: { height?: number; width?: number } = {}
): SerializedSvgVectorSource {
  inspectEffectSvgBeforeDom(source);
  const document = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw new Error('EFFECT_SVG_PARSE_FAILED');
  const svg = document.documentElement;
  if (svg.tagName.toLowerCase() !== 'svg') throw new Error('EFFECT_SVG_PARSE_FAILED');
  const viewBox = parseSvgViewBox(svg.getAttribute('viewBox'), fallback);
  const parts: SerializedSvgVectorPart[] = [];
  const serializedCharacters = { value: 0 };
  walkSvgNodes(svg, parts, createInheritedState(svg, null, []), serializedCharacters);
  return { height: viewBox.height, parts, width: viewBox.width };
}

function walkSvgNodes(
  node: Element,
  parts: SerializedSvgVectorPart[],
  inherited: SvgInheritedState,
  serializedCharacters: { value: number }
): void {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'defs' || tag === 'clippath') continue;
    const childState = createInheritedState(child, inherited, inherited.groupIds);
    if (tag === 'path') {
      pushPathPart(child, childState, parts, serializedCharacters);
    } else if (tag === 'rect') {
      pushRectPart(child, childState, parts, serializedCharacters);
    }
    walkSvgNodes(child, parts, childState, serializedCharacters);
  }
}

function pushPathPart(
  child: Element,
  state: SvgInheritedState,
  parts: SerializedSvgVectorPart[],
  serializedCharacters: { value: number }
): void {
  const pathData = child.getAttribute('d');
  if (!pathData || (!state.fill && !state.stroke)) return;
  const part: SerializedSvgVectorPart = {
    cx: 61.5,
    cy: 18,
    fill: state.fill,
    groupId: state.groupId,
    groupIds: state.groupIds,
    id: readPartId(child, state, 'path', parts.length),
    opacity: state.opacity,
    pathData,
    stroke: state.stroke,
    strokeLineCap: state.strokeLineCap,
    strokeLineJoin: state.strokeLineJoin,
    strokeWidth: state.strokeWidth,
    type: 'path',
  };
  pushBoundedPart(parts, part, serializedCharacters);
}

function pushRectPart(
  child: Element,
  state: SvgInheritedState,
  parts: SerializedSvgVectorPart[],
  serializedCharacters: { value: number }
): void {
  if (!state.fill && !state.stroke) return;
  const x = readFiniteSvgAttribute(child, 'x', 0);
  const y = readFiniteSvgAttribute(child, 'y', 0);
  const width = readNonNegativeSvgAttribute(child, 'width', 0);
  const height = readNonNegativeSvgAttribute(child, 'height', 0);
  const rx = readNonNegativeSvgAttribute(child, 'rx', 0);
  const part: SerializedSvgVectorPart = {
    cx: x + width * 0.5,
    cy: y + height * 0.5,
    fill: state.fill,
    groupId: state.groupId,
    groupIds: state.groupIds,
    height,
    id: readPartId(child, state, 'rect', parts.length),
    opacity: state.opacity,
    rx,
    stroke: state.stroke,
    strokeLineCap: state.strokeLineCap,
    strokeLineJoin: state.strokeLineJoin,
    strokeWidth: state.strokeWidth,
    type: 'rect',
    width,
    x,
    y,
  };
  pushBoundedPart(parts, part, serializedCharacters);
}

function createInheritedState(
  node: Element,
  inherited: SvgInheritedState | null,
  parentGroupIds: readonly string[]
): SvgInheritedState {
  const nodeId = node.getAttribute('id');
  const groupIds =
    node.tagName.toLowerCase() === 'g' && nodeId
      ? [...parentGroupIds, assertBoundedSvgId(nodeId)]
      : [...parentGroupIds];
  const fill = normalizeSvgPaint(readSvgAttribute(node, 'fill', inherited?.fill ?? null));
  const stroke = normalizeSvgPaint(readSvgAttribute(node, 'stroke', inherited?.stroke ?? null));
  const opacity = clampSvgValue(
    readFiniteSvgAttribute(node, 'opacity', 1) *
      readFiniteSvgAttribute(node, 'fill-opacity', 1) *
      readFiniteSvgAttribute(node, 'stroke-opacity', 1) *
      (inherited?.opacity ?? 1),
    0,
    1
  );
  return {
    fill,
    groupId: groupIds.at(-1) ?? null,
    groupIds,
    opacity,
    stroke,
    strokeLineCap: readSvgAttribute(node, 'stroke-linecap', inherited?.strokeLineCap ?? 'butt')!,
    strokeLineJoin: readSvgAttribute(
      node,
      'stroke-linejoin',
      inherited?.strokeLineJoin ?? 'miter'
    )!,
    strokeWidth: readNonNegativeSvgAttribute(node, 'stroke-width', inherited?.strokeWidth ?? 1),
  };
}

function readPartId(
  child: Element,
  state: SvgInheritedState,
  tag: 'path' | 'rect',
  index: number
): string {
  const value = child.getAttribute('id');
  if (value) return assertBoundedSvgId(value);
  return `${state.groupId ? `${state.groupId}.` : ''}${tag}-${index}`;
}

function pushBoundedPart(
  parts: SerializedSvgVectorPart[],
  part: SerializedSvgVectorPart,
  serializedCharacters: { value: number }
): void {
  const nextCharacters =
    serializedCharacters.value + getSerializedSvgVectorPartCharacterCount(part);
  if (
    parts.length >= EFFECT_SVG_VECTOR_LIMITS.maxParts ||
    nextCharacters > EFFECT_SVG_VECTOR_LIMITS.maxSerializedStringCharacters
  ) {
    throw new Error('EFFECT_SVG_BUDGET_EXCEEDED');
  }
  serializedCharacters.value = nextCharacters;
  parts.push(part);
}
