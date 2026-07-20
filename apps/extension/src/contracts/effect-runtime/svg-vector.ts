export interface SerializedSvgVectorPart {
  cx: number;
  cy: number;
  fill: string | null;
  groupId: string | null;
  groupIds: string[];
  height?: number;
  id: string;
  opacity: number;
  pathData?: string;
  rx?: number;
  stroke: string | null;
  strokeLineCap: string;
  strokeLineJoin: string;
  strokeWidth: number;
  type: 'path' | 'rect';
  width?: number;
  x?: number;
  y?: number;
}

export interface SerializedSvgVector {
  height: number;
  parts: SerializedSvgVectorPart[];
  width: number;
}

export const EFFECT_SVG_VECTOR_LIMITS = {
  maxCommonStringCharacters: 512,
  maxGroupDepth: 64,
  maxLineStyleCharacters: 32,
  maxParts: 2_048,
  maxPathDataCharacters: 1_500_000,
  maxSerializedStringCharacters: 2_000_000,
} as const;

export function getSerializedSvgVectorPartCharacterCount(part: SerializedSvgVectorPart): number {
  return (
    part.id.length +
    (part.groupId?.length ?? 0) +
    part.groupIds.reduce((total, value) => total + value.length, 0) +
    (part.fill?.length ?? 0) +
    (part.stroke?.length ?? 0) +
    part.strokeLineCap.length +
    part.strokeLineJoin.length +
    (part.pathData?.length ?? 0)
  );
}
