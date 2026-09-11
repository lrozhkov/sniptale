import {
  GUIDE_LIMITS,
  type GuideImageBlock,
} from '@sniptale/runtime-contracts/scenario/types/guide';

type ImageGeometryChange =
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'zoom'; scale: number }
  | { kind: 'frame'; width: number; height: number }
  | { kind: 'fit'; fit: GuideImageBlock['fit'] }
  | { kind: 'reset'; width: number; height: number };
function bound(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new Error('Invalid image geometry.');
  return Math.min(maximum, Math.max(minimum, value));
}
/** Applies bounded frame geometry without changing resource or annotation identity. */
export function changeGuideImageGeometry(
  block: GuideImageBlock,
  change: ImageGeometryChange
): GuideImageBlock {
  switch (change.kind) {
    case 'pan':
      return {
        ...block,
        contentTransform: {
          ...block.contentTransform,
          x: bound(change.x, -100, 100),
          y: bound(change.y, -100, 100),
        },
      };
    case 'zoom':
      return {
        ...block,
        contentTransform: { ...block.contentTransform, scale: bound(change.scale, 0.1, 100) },
      };
    case 'frame':
      return {
        ...block,
        frame: {
          width: bound(change.width, 1, GUIDE_LIMITS.maxDimension),
          height: bound(change.height, 1, GUIDE_LIMITS.maxDimension),
        },
      };
    case 'fit':
      return { ...block, fit: change.fit };
    case 'reset': {
      const ratio = Math.min(1, GUIDE_LIMITS.maxDimension / Math.max(change.width, change.height));
      return {
        ...changeGuideImageGeometry(block, {
          kind: 'frame',
          width: change.width * ratio,
          height: change.height * ratio,
        }),
        fit: 'contain',
        contentTransform: { x: 0, y: 0, scale: 1 },
      };
    }
  }
}
/** Converts a display-space pointer gesture to persisted frame fractions or logical dimensions. */
export function moveGuideImageGesture(
  block: GuideImageBlock,
  kind: 'pan' | 'resize',
  dx: number,
  dy: number,
  displayWidth: number,
  displayHeight: number
): GuideImageBlock {
  if (displayWidth <= 0 || displayHeight <= 0) return block;
  return kind === 'pan'
    ? changeGuideImageGeometry(block, {
        kind: 'pan',
        x: block.contentTransform.x + dx / displayWidth,
        y: block.contentTransform.y + dy / displayHeight,
      })
    : changeGuideImageGeometry(block, {
        kind: 'frame',
        width: block.frame.width * (1 + dx / displayWidth),
        height: block.frame.height * (1 + dy / displayHeight),
      });
}
