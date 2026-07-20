import type {
  EditorRichShapeDocumentObject,
  EditorRichShapeFill,
} from '../../../features/editor/document/rich-shape';
import { resolveRichShapeRoughSeed } from '../../../features/editor/document/rich-shape';
import { hexToRgba } from '../../document/model';
import type { RichShapeRenderableStyle } from './style/renderable';
import type { RoughOptions } from './rough-types';

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(0, Math.min(1, value));
}

export function transparencyToOpacity(value: number): number {
  return clampUnit(value > 1 ? 1 - value / 100 : 1 - value);
}

function resolveSolidFill(fill: EditorRichShapeFill): string | null {
  if (fill.type === 'solid') {
    return fill.color;
  }
  return null;
}

export function resolveRoughFill(shape: EditorRichShapeDocumentObject): string | undefined {
  if (shape.rough.fillTransparency >= 1) {
    return undefined;
  }

  const color = shape.rough.fillColor ?? resolveSolidFill(shape.style.fill);
  return color ? hexToRgba(color, transparencyToOpacity(shape.rough.fillTransparency)) : undefined;
}

export function createRoughOptions(args: {
  fill: string | undefined;
  seedOffset: number;
  shape: EditorRichShapeDocumentObject;
  style: RichShapeRenderableStyle;
}): RoughOptions {
  const seed = resolveRichShapeRoughSeed(args.shape) + args.seedOffset;
  return {
    bowing: args.fill === undefined ? args.shape.rough.bowing : args.shape.rough.fillBowing,
    fillStyle: args.shape.rough.fillStyle,
    fillWeight: args.shape.rough.fillWeight,
    hachureAngle: args.shape.rough.hachureAngle,
    hachureGap: args.shape.rough.hachureGap,
    preserveVertices: args.shape.rough.preserveVertices,
    roughness:
      args.fill === undefined ? args.shape.rough.roughness : args.shape.rough.fillRoughness,
    seed: seed > 2147483646 ? (seed % 2147483646) + 1 : seed,
    stroke: args.style.strokeWidth > 0 ? args.style.stroke : 'none',
    strokeWidth: args.style.strokeWidth,
    ...(args.fill === undefined ? {} : { fill: args.fill }),
    ...(args.style.strokeDashArray === undefined
      ? {}
      : { strokeLineDash: args.style.strokeDashArray }),
  };
}
