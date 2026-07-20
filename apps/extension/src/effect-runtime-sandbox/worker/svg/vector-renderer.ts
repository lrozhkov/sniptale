import type { SerializedSvgVectorPart } from '../../../contracts/effect-runtime/svg-vector';
import type { EffectRuntimeWorkerSvgAsset } from '../../../contracts/effect-runtime/types';
import type { RuntimeCanvasContext } from '../model/types.js';
import { roundRect } from '../math.js';
import { parseSvgAsset, type HydratedSvgVector } from './vector-parser.js';

type HydratedSvgPart = HydratedSvgVector['parts'][number];

interface SvgPartFilters {
  partFilter: DrawSvgVectorArgs['partFilter'] | undefined;
  partGroups: string[] | undefined;
  partIds: string[] | undefined;
}

export interface SvgPartTransformResult {
  alpha?: number;
  composite?: GlobalCompositeOperation;
  filter?: string;
  originX?: number;
  originY?: number;
  rotate?: number;
  scale?: number;
  x?: number;
  y?: number;
}

export type SvgPartTransform = (
  part: HydratedSvgPart,
  index: number,
  vector: HydratedSvgVector
) => SvgPartTransformResult | undefined;

export interface DrawSvgVectorArgs {
  alpha?: number;
  composite?: GlobalCompositeOperation;
  filter?: string;
  height?: number;
  partFilter?: (part: HydratedSvgPart) => boolean;
  partGroups?: string[];
  partIds?: string[];
  partTransform?: SvgPartTransform;
  shadowBlur?: number;
  shadowColor?: string;
  width?: number;
  x?: number;
  y?: number;
}

export function drawSvgVectorAsset(
  context: RuntimeCanvasContext,
  asset: EffectRuntimeWorkerSvgAsset,
  args: DrawSvgVectorArgs = {}
): void {
  const parsed = parseSvgAsset(asset);
  const {
    alpha = 1,
    composite = 'source-over',
    filter = 'none',
    height = asset.height || parsed.height,
    partFilter,
    partGroups,
    partIds,
    partTransform,
    shadowBlur = 0,
    shadowColor = 'transparent',
    width = asset.width || parsed.width,
    x = 0,
    y = 0,
  } = args;
  context.save();
  context.globalAlpha *= alpha;
  context.globalCompositeOperation = composite;
  context.filter = filter;
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;
  context.translate(x, y);
  context.scale(width / parsed.width, height / parsed.height);
  parsed.parts.forEach((part, index) => {
    if (matchesSvgPart(part, { partFilter, partGroups, partIds })) {
      drawSvgPart(context, part, index, parsed, partTransform);
    }
  });
  context.restore();
}

function drawSvgPart(
  context: RuntimeCanvasContext,
  part: HydratedSvgPart,
  index: number,
  parsed: HydratedSvgVector,
  partTransform?: SvgPartTransform
): void {
  const transform = partTransform?.(part, index, parsed) ?? {};
  const partAlpha = (transform.alpha ?? 1) * part.opacity;
  if (partAlpha <= 0) return;
  context.save();
  context.globalAlpha *= partAlpha;
  if (transform.composite) context.globalCompositeOperation = transform.composite;
  if (transform.filter) context.filter = transform.filter;
  context.translate(transform.x ?? 0, transform.y ?? 0);
  applyPartOriginTransform(context, part, parsed, transform);
  context.lineCap = readLineCap(part.strokeLineCap);
  context.lineJoin = readLineJoin(part.strokeLineJoin);
  context.lineWidth = part.strokeWidth;
  if (part.fill) context.fillStyle = part.fill;
  if (part.stroke) context.strokeStyle = part.stroke;
  if (part.type === 'path') drawPathPart(context, part);
  else drawRectPart(context, part);
  context.restore();
}

function applyPartOriginTransform(
  context: RuntimeCanvasContext,
  part: HydratedSvgPart,
  parsed: HydratedSvgVector,
  transform: SvgPartTransformResult
): void {
  if (!transform.rotate && !transform.scale) return;
  const originX = transform.originX ?? part.cx ?? parsed.width * 0.5;
  const originY = transform.originY ?? part.cy ?? parsed.height * 0.5;
  context.translate(originX, originY);
  context.rotate(transform.rotate ?? 0);
  const scale = transform.scale ?? 1;
  context.scale(scale, scale);
  context.translate(-originX, -originY);
}

function drawPathPart(context: RuntimeCanvasContext, part: HydratedSvgPart): void {
  if (part.type !== 'path' || !part.path) return;
  if (part.fill) context.fill(part.path);
  if (part.stroke) context.stroke(part.path);
}

function drawRectPart(context: RuntimeCanvasContext, part: SerializedSvgVectorPart): void {
  if (part.type !== 'rect') return;
  roundRect(context, part.x ?? 0, part.y ?? 0, part.width ?? 0, part.height ?? 0, part.rx ?? 0);
  if (part.fill) context.fill();
  if (part.stroke) context.stroke();
}

function matchesSvgPart(part: HydratedSvgPart, filters: SvgPartFilters): boolean {
  if (filters.partFilter && !filters.partFilter(part)) return false;
  if (filters.partIds?.length && !filters.partIds.includes(part.id)) return false;
  if (filters.partGroups?.length && !filters.partGroups.some((id) => part.groupIds.includes(id))) {
    return false;
  }
  return true;
}

function readLineCap(value: string): CanvasLineCap {
  return value === 'round' || value === 'square' ? value : 'butt';
}

function readLineJoin(value: string): CanvasLineJoin {
  return value === 'round' || value === 'bevel' ? value : 'miter';
}
