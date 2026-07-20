import { useLayoutEffect, useState } from 'react';
import type React from 'react';

import { translate } from '../../../../platform/i18n';
import {
  resolveVideoAnnotationTemplate,
  VideoAnnotationTargetBindingKind,
} from '../../../../features/video/project/annotation-engine';
import { getAnnotationInteractionScale } from '../../../../features/video/project/annotation/render-metrics';
import { resolveAnnotationTemplateControls } from '../../../../features/video/project/annotation/template-controls';
import {
  type VideoProjectAnnotationClip,
  VideoProjectClipType,
} from '../../../../features/video/project/types/index';
import { startWindowPointerSession } from '../../../interaction/pointer-session';
import {
  getCompositionPointStageStyle,
  getCompositionRectStageStyle,
  getPreviewStageInteractionScale,
  mapClientPointToCompositionPoint,
  shouldLockPreviewClipToViewport,
} from '../canvas/geometry';
import type { PreviewStageAnnotationTargetOverlayProps } from '../types';

const TARGET_POINT_HANDLE_CLASS_NAME = [
  'pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2',
  'border-[color:var(--sniptale-color-text-primary-strong)] bg-[var(--sniptale-color-info)]',
  'shadow-[0_0_0_3px_var(--sniptale-color-surface-panel)]',
].join(' ');

const TARGET_RECT_CLASS_NAME = [
  'pointer-events-auto absolute border border-dashed opacity-60',
  [
    'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_68%,transparent)]',
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_5%,transparent)]',
  ].join(' '),
].join(' ');

const MOVE_ANNOTATION_TARGET_LABEL = translate('videoEditor.stage.moveAnnotationTarget');
const MOVE_ANNOTATION_TARGET_AREA_LABEL = translate('videoEditor.stage.moveAnnotationTargetArea');

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getSelectedTargetAwareAnnotation(
  props: PreviewStageAnnotationTargetOverlayProps
): VideoProjectAnnotationClip | null {
  if (props.selectedClipLocked || props.selectedClip?.type !== VideoProjectClipType.ANNOTATION) {
    return null;
  }

  if (doesAnnotationSupportTarget(props.selectedClip)) {
    return props.selectedClip;
  }

  return null;
}

function doesAnnotationSupportTarget(clip: VideoProjectAnnotationClip): boolean {
  const resolution = resolveVideoAnnotationTemplate(clip);
  const template =
    resolution.status === 'resolved' ? resolution.template : resolution.fallbackTemplate;
  if (template) {
    return template.target.kind !== VideoAnnotationTargetBindingKind.NONE;
  }

  return resolveAnnotationTemplateControls(clip.templateKind).supportsTarget;
}

function resolvePointerPoint(
  event: Pick<PointerEvent, 'clientX' | 'clientY'>,
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps
) {
  const stage = props.stageRef.current;
  if (!stage) {
    return null;
  }

  return mapClientPointToCompositionPoint({
    camera: props.camera,
    clientX: event.clientX,
    clientY: event.clientY,
    lockToViewport: shouldLockPreviewClipToViewport(clip, props.camera),
    project: props.project,
    stage,
  });
}

function clampPoint(
  project: PreviewStageAnnotationTargetOverlayProps['project'],
  point: { x: number; y: number }
) {
  return {
    x: clampNumber(point.x, 0, project.width),
    y: clampNumber(point.y, 0, project.height),
  };
}

function clampRect(
  project: PreviewStageAnnotationTargetOverlayProps['project'],
  rect: NonNullable<VideoProjectAnnotationClip['targetRect']>
) {
  return {
    ...rect,
    x: clampNumber(rect.x, 0, Math.max(0, project.width - rect.width)),
    y: clampNumber(rect.y, 0, Math.max(0, project.height - rect.height)),
  };
}

function getTargetHandleMetrics(
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps,
  stage: HTMLDivElement
) {
  const interactionScale = getAnnotationInteractionScale(
    getPreviewStageInteractionScale(
      stage,
      props.project,
      props.camera,
      shouldLockPreviewClipToViewport(clip, props.camera)
    ).scaleX
  );

  return {
    borderWidth: clampNumber(interactionScale * 2, 2, 4),
    ringWidth: clampNumber(interactionScale * 3, 3, 6),
    size: clampNumber(interactionScale * 16, 14, 26),
  };
}

function beginTargetPointDrag(
  event: React.PointerEvent<HTMLElement>,
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps
) {
  event.preventDefault();
  event.stopPropagation();

  startWindowPointerSession({
    onMove: (moveEvent) => {
      const nextPoint = resolvePointerPoint(moveEvent, clip, props);
      if (!nextPoint) {
        return;
      }

      props.onUpdateAnnotationClipTemplate(clip.id, {
        targetPoint: clampPoint(props.project, nextPoint),
      });
    },
  });
}

function beginTargetRectDrag(
  event: React.PointerEvent<HTMLElement>,
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps
) {
  if (clip.targetRect === null) {
    return;
  }

  const startPoint = resolvePointerPoint(event, clip, props);
  if (!startPoint) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const startRect = clip.targetRect;
  startWindowPointerSession({
    onMove: (moveEvent) => {
      const nextPoint = resolvePointerPoint(moveEvent, clip, props);
      if (!nextPoint) {
        return;
      }

      props.onUpdateAnnotationClipTemplate(clip.id, {
        targetRect: clampRect(props.project, {
          ...startRect,
          x: startRect.x + (nextPoint.x - startPoint.x),
          y: startRect.y + (nextPoint.y - startPoint.y),
        }),
      });
    },
  });
}

function renderPointTarget(
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps,
  stage: HTMLDivElement
) {
  if (clip.targetPoint === null) {
    return null;
  }

  const metrics = getTargetHandleMetrics(clip, props, stage);

  return (
    <button
      type="button"
      aria-label={MOVE_ANNOTATION_TARGET_LABEL}
      data-preview-annotation-target-handle="point"
      className={TARGET_POINT_HANDLE_CLASS_NAME}
      style={{
        ...getCompositionPointStageStyle(
          props.project,
          clip.targetPoint,
          props.camera,
          shouldLockPreviewClipToViewport(clip, props.camera),
          stage
        ),
        borderWidth: `${metrics.borderWidth}px`,
        boxShadow: `0 0 0 ${metrics.ringWidth}px var(--sniptale-color-surface-panel)`,
        height: `${metrics.size}px`,
        width: `${metrics.size}px`,
      }}
      onPointerDown={(event) => beginTargetPointDrag(event, clip, props)}
    />
  );
}

function renderRectTarget(
  clip: VideoProjectAnnotationClip,
  props: PreviewStageAnnotationTargetOverlayProps,
  stage: HTMLDivElement
) {
  if (clip.targetRect === null) {
    return null;
  }

  const metrics = getTargetHandleMetrics(clip, props, stage);

  return (
    <button
      type="button"
      aria-label={MOVE_ANNOTATION_TARGET_AREA_LABEL}
      data-preview-annotation-target-rect="true"
      className={TARGET_RECT_CLASS_NAME}
      style={{
        ...getCompositionRectStageStyle(
          props.project,
          clip.targetRect,
          props.camera,
          shouldLockPreviewClipToViewport(clip, props.camera),
          stage
        ),
        borderWidth: `${metrics.borderWidth}px`,
        cursor: 'grab',
      }}
      onPointerDown={(event) => beginTargetRectDrag(event, clip, props)}
    />
  );
}

export function PreviewStageAnnotationTargetOverlay(
  props: PreviewStageAnnotationTargetOverlayProps
) {
  const [, setStageReadyTick] = useState(0);

  useLayoutEffect(() => {
    setStageReadyTick((tick) => tick + 1);
  }, [props.stageRef]);

  const clip = getSelectedTargetAwareAnnotation(props);
  const stage = props.stageRef.current;
  if (!clip || !stage || clip.target === 'NONE') {
    return null;
  }

  return (
    <>
      {clip.target === 'POINT' ? renderPointTarget(clip, props, stage) : null}
      {clip.target === 'RECT' ? renderRectTarget(clip, props, stage) : null}
    </>
  );
}
