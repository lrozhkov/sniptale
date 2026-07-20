import { resolveAnnotationRenderMetrics } from '../../../../features/video/project/annotation/render-metrics';
import type { ResolvedAnnotationPresentation } from '../../../../features/video/project/annotation/template';
import type { VideoProjectAnnotationClip } from '../../../../features/video/project/types/index';
import { createPartMotionStyle } from './annotation-motion-style';

function getBracketCornerLength(width: number, height: number, progress: number) {
  return Math.min(width, height) * (0.16 + Math.max(0.2, Math.min(1, progress)) * 0.08);
}

function getTargetRectStyle(
  clip: VideoProjectAnnotationClip,
  presentation: ResolvedAnnotationPresentation,
  displayScale: number
) {
  if (clip.targetRect === null) {
    return null;
  }

  const metrics = resolveAnnotationRenderMetrics(presentation, displayScale);
  const pulseScale = presentation.effects.scaleMultiplier;
  const pulseGap = metrics.targetMetrics.pulseGap * pulseScale;
  const relativeLeft = clip.targetRect.x - presentation.frame.x;
  const relativeTop = clip.targetRect.y - presentation.frame.y;

  return {
    frameKind: clip.calloutDecor.frameKind,
    frame: {
      border: [
        `${metrics.targetMetrics.frameStrokeWidth.toFixed(2)}px solid`,
        presentation.style.accentColor,
      ].join(' '),
      borderRadius: `${metrics.targetMetrics.frameCornerRadius.toFixed(2)}px`,
      height: `${clip.targetRect.height.toFixed(2)}px`,
      left: `${relativeLeft.toFixed(2)}px`,
      opacity: Math.max(
        presentation.effects.connectorProgress,
        presentation.effects.markerProgress
      ),
      top: `${relativeTop.toFixed(2)}px`,
      width: `${clip.targetRect.width.toFixed(2)}px`,
    },
    pulse:
      clip.calloutDecor.pulseKind === 'NONE'
        ? null
        : {
            border: [
              `${metrics.targetMetrics.pulseStrokeWidth.toFixed(2)}px solid`,
              presentation.style.accentColor,
            ].join(' '),
            borderRadius: `${(metrics.targetMetrics.frameCornerRadius + pulseGap * 0.45).toFixed(2)}px`,
            boxShadow: createTargetInsetShadow(presentation),
            height: `${(clip.targetRect.height + pulseGap * 2).toFixed(2)}px`,
            left: `${(relativeLeft - pulseGap).toFixed(2)}px`,
            opacity: 0.18 * presentation.effects.shadowStrength,
            top: `${(relativeTop - pulseGap).toFixed(2)}px`,
            width: `${(clip.targetRect.width + pulseGap * 2).toFixed(2)}px`,
          },
  } as const;
}

function createTargetInsetShadow(presentation: ResolvedAnnotationPresentation) {
  return `0 0 0 1px color-mix(in_srgb, ${presentation.style.accentColor} 22%, transparent) inset`;
}

function renderBracketFrame(targetRect: NonNullable<ReturnType<typeof getTargetRectStyle>>) {
  const frameProgress = Number(targetRect.frame.opacity);
  const width = Number.parseFloat(targetRect.frame.width);
  const height = Number.parseFloat(targetRect.frame.height);
  const cornerLength = getBracketCornerLength(width, height, frameProgress);
  const cornerLengthValue = cornerLength.toFixed(2);
  const strokeWidth = targetRect.frame.border.split('px')[0] ?? '2';
  const strokeColor = targetRect.frame.border.split(' solid ')[1] ?? 'currentColor';
  const bracketPath = [
    `M 0 ${cornerLengthValue} L 0 0 L ${cornerLengthValue} 0`,
    `M ${width - cornerLength} 0 L ${width} 0 L ${width} ${cornerLengthValue}`,
    `M ${width} ${height - cornerLength} L ${width} ${height}`,
    `L ${width - cornerLength} ${height}`,
    `M ${cornerLengthValue} ${height} L 0 ${height} L 0 ${height - cornerLength}`,
  ].join(' ');

  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      data-annotation-focus="bracket"
      style={{
        height: targetRect.frame.height,
        left: targetRect.frame.left,
        top: targetRect.frame.top,
        width: targetRect.frame.width,
        ...createPartMotionStyle(frameProgress, {
          scaleFrom: 0.94,
          transformOrigin: 'center center',
          translateY: 0,
        }),
      }}
      viewBox={`0 0 ${width} ${height}`}
    >
      <path
        d={bracketPath}
        fill="none"
        stroke={strokeColor}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

function getTargetPointStyle(
  clip: VideoProjectAnnotationClip,
  presentation: ResolvedAnnotationPresentation,
  displayScale: number
) {
  if (clip.targetPoint === null || clip.calloutDecor.pulseKind === 'NONE') {
    return null;
  }

  const metrics = resolveAnnotationRenderMetrics(presentation, displayScale);
  const radius = metrics.targetMetrics.ringOuterRadius * presentation.effects.scaleMultiplier;
  const size = radius * 2;

  return {
    border: [
      `${metrics.targetMetrics.pulseStrokeWidth.toFixed(2)}px solid`,
      presentation.style.accentColor,
    ].join(' '),
    borderRadius: '999px',
    height: `${size.toFixed(2)}px`,
    left: `${(clip.targetPoint.x - presentation.frame.x - radius).toFixed(2)}px`,
    opacity: 0.2 * presentation.effects.shadowStrength,
    top: `${(clip.targetPoint.y - presentation.frame.y - radius).toFixed(2)}px`,
    width: `${size.toFixed(2)}px`,
  } as const;
}

export function renderTargetFrameDecorations(props: {
  clip: VideoProjectAnnotationClip;
  displayScale: number;
  presentation: ResolvedAnnotationPresentation;
}) {
  const targetRect = getTargetRectStyle(props.clip, props.presentation, props.displayScale);
  const targetPoint = getTargetPointStyle(props.clip, props.presentation, props.displayScale);

  return (
    <>
      {targetRect?.pulse ? (
        <span
          className="pointer-events-none absolute"
          data-annotation-focus="pulse"
          style={targetRect.pulse}
        />
      ) : null}
      {targetRect ? renderTargetRectFrame(targetRect, props.presentation) : null}
      {targetPoint ? (
        <span
          className="pointer-events-none absolute"
          data-annotation-focus="point"
          style={targetPoint}
        />
      ) : null}
    </>
  );
}

function renderTargetRectFrame(
  targetRect: NonNullable<ReturnType<typeof getTargetRectStyle>>,
  presentation: ResolvedAnnotationPresentation
) {
  if (targetRect.frameKind === 'BRACKET') {
    return renderBracketFrame(targetRect);
  }

  return (
    <span
      className="pointer-events-none absolute"
      data-annotation-focus="frame"
      style={{
        ...targetRect.frame,
        ...createPartMotionStyle(presentation.effects.connectorProgress, {
          scaleFrom: 0.94,
          transformOrigin: 'center center',
          translateY: 0,
        }),
      }}
    />
  );
}
