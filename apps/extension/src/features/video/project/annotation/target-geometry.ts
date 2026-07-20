import type { VideoProjectAnnotationClip, VideoProjectAnnotationTargetPoint } from '../types/index';

interface RectFrame {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface ResolvedAnnotationConnectorGeometry {
  bendPoint: VideoProjectAnnotationTargetPoint | null;
  labelAttachPoint: VideoProjectAnnotationTargetPoint;
  targetAnchorPoint: VideoProjectAnnotationTargetPoint | null;
}

function unreachableTemplateDirection(value: never): never {
  throw new Error(`Unhandled annotation target direction: ${String(value)}`);
}

function unreachableTargetKind(value: never): never {
  throw new Error(`Unhandled annotation target kind: ${String(value)}`);
}

function getLabelAttachPoint(
  clip: Pick<VideoProjectAnnotationClip, 'leaderLine'>,
  labelFrame: RectFrame
): VideoProjectAnnotationTargetPoint {
  const centerX = labelFrame.x + labelFrame.width / 2;
  const centerY = labelFrame.y + labelFrame.height / 2;

  switch (clip.leaderLine.direction) {
    case 'LEFT':
      return { x: labelFrame.x, y: centerY };
    case 'RIGHT':
      return { x: labelFrame.x + labelFrame.width, y: centerY };
    case 'UP':
      return { x: centerX, y: labelFrame.y };
    case 'DOWN':
      return { x: centerX, y: labelFrame.y + labelFrame.height };
  }

  return unreachableTemplateDirection(clip.leaderLine.direction);
}

function getRectTargetAnchor(
  clip: Pick<VideoProjectAnnotationClip, 'leaderLine' | 'targetRect'>
): VideoProjectAnnotationTargetPoint | null {
  if (clip.targetRect === null) {
    return null;
  }

  const { height, width, x, y } = clip.targetRect;
  switch (clip.leaderLine.direction) {
    case 'LEFT':
      return { x: x + width, y: y + height / 2 };
    case 'RIGHT':
      return { x, y: y + height / 2 };
    case 'UP':
      return { x: x + width / 2, y: y + height };
    case 'DOWN':
      return { x: x + width / 2, y };
  }

  return unreachableTemplateDirection(clip.leaderLine.direction);
}

function getTargetAnchorPoint(
  clip: Pick<VideoProjectAnnotationClip, 'target' | 'targetPoint' | 'targetRect' | 'leaderLine'>
): VideoProjectAnnotationTargetPoint | null {
  switch (clip.target) {
    case 'POINT':
      return clip.targetPoint;
    case 'RECT':
      return getRectTargetAnchor(clip);
    case 'NONE':
      return null;
  }

  return unreachableTargetKind(clip.target);
}

function getElbowBendPoint(
  clip: Pick<VideoProjectAnnotationClip, 'leaderLine'>,
  labelAttachPoint: VideoProjectAnnotationTargetPoint,
  targetAnchorPoint: VideoProjectAnnotationTargetPoint
): VideoProjectAnnotationTargetPoint {
  switch (clip.leaderLine.direction) {
    case 'LEFT':
    case 'RIGHT':
      return { x: targetAnchorPoint.x, y: labelAttachPoint.y };
    case 'UP':
    case 'DOWN':
      return { x: labelAttachPoint.x, y: targetAnchorPoint.y };
  }

  return unreachableTemplateDirection(clip.leaderLine.direction);
}

function collectFrameExtents(
  clip: Pick<
    VideoProjectAnnotationClip,
    'calloutDecor' | 'leaderLine' | 'target' | 'targetPoint' | 'targetRect'
  >,
  labelFrame: RectFrame,
  targetAnchorPoint: VideoProjectAnnotationTargetPoint | null
) {
  const markerRadius =
    clip.calloutDecor.markerKind === 'RING' ? 14 : clip.calloutDecor.markerKind === 'DOT' ? 8 : 0;
  const lineInset = clip.leaderLine.enabled ? Math.max(12, clip.leaderLine.thickness * 4) : 0;
  const frameInset = clip.calloutDecor.frameKind === 'NONE' ? 0 : 10;
  const pulseInset =
    clip.calloutDecor.pulseKind === 'RING' ? 24 : clip.calloutDecor.pulseKind === 'SOFT' ? 18 : 0;
  const targetInset = Math.max(markerRadius, frameInset, pulseInset);
  const minX = Math.min(
    labelFrame.x,
    (targetAnchorPoint?.x ?? labelFrame.x) - targetInset,
    (clip.targetRect?.x ?? labelFrame.x) - targetInset
  );
  const minY = Math.min(
    labelFrame.y,
    (targetAnchorPoint?.y ?? labelFrame.y) - targetInset,
    (clip.targetRect?.y ?? labelFrame.y) - targetInset
  );
  const maxX = Math.max(
    labelFrame.x + labelFrame.width,
    (targetAnchorPoint?.x ?? labelFrame.x + labelFrame.width) + targetInset,
    clip.targetRect === null
      ? labelFrame.x + labelFrame.width
      : clip.targetRect.x + clip.targetRect.width + targetInset
  );
  const maxY = Math.max(
    labelFrame.y + labelFrame.height,
    (targetAnchorPoint?.y ?? labelFrame.y + labelFrame.height) + targetInset,
    clip.targetRect === null
      ? labelFrame.y + labelFrame.height
      : clip.targetRect.y + clip.targetRect.height + targetInset
  );

  return {
    height: maxY - minY + lineInset * 2,
    width: maxX - minX + lineInset * 2,
    x: minX - lineInset,
    y: minY - lineInset,
  };
}

export function resolveAnnotationConnectorGeometry(
  clip: Pick<VideoProjectAnnotationClip, 'leaderLine' | 'target' | 'targetPoint' | 'targetRect'>,
  labelFrame: RectFrame
): ResolvedAnnotationConnectorGeometry {
  const labelAttachPoint = getLabelAttachPoint(clip, labelFrame);
  const targetAnchorPoint =
    clip.leaderLine.enabled && clip.target !== 'NONE' ? getTargetAnchorPoint(clip) : null;

  return {
    bendPoint:
      clip.leaderLine.style === 'ELBOW' && targetAnchorPoint !== null
        ? getElbowBendPoint(clip, labelAttachPoint, targetAnchorPoint)
        : null,
    labelAttachPoint,
    targetAnchorPoint,
  };
}

export function resolveAnnotationFrameBounds(
  clip: Pick<
    VideoProjectAnnotationClip,
    'calloutDecor' | 'leaderLine' | 'target' | 'targetPoint' | 'targetRect'
  >,
  labelFrame: RectFrame
): RectFrame {
  const geometry = resolveAnnotationConnectorGeometry(clip, labelFrame);
  if (
    geometry.targetAnchorPoint === null &&
    clip.targetRect === null &&
    clip.calloutDecor.markerKind === 'NONE'
  ) {
    return labelFrame;
  }

  return collectFrameExtents(clip, labelFrame, geometry.targetAnchorPoint);
}
