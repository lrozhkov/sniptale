import { translate } from '../../../../../../platform/i18n';
import type { VideoProjectAnnotationTargetRect } from '../../../../../../features/video/project/types';
import type { AnnotationTargetControlsProps } from './props';
import { TargetNumberField } from './number-field';

export function renderPointOrRectFields(props: AnnotationTargetControlsProps) {
  if (props.clip.target === 'POINT') {
    return renderPointFields(props);
  }

  if (props.clip.target === 'RECT') {
    return renderRectFields(props);
  }

  return null;
}

function renderPointFields(props: AnnotationTargetControlsProps) {
  const targetPoint = props.clip.targetPoint ?? { x: 0, y: 0 };

  return (
    <>
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetPointXLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetPoint: { x: value, y: targetPoint.y },
          })
        }
        step={10}
        value={targetPoint.x}
      />
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetPointYLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetPoint: { x: targetPoint.x, y: value },
          })
        }
        step={10}
        value={targetPoint.y}
      />
    </>
  );
}

function renderRectFields(props: AnnotationTargetControlsProps) {
  const targetRect: VideoProjectAnnotationTargetRect = props.clip.targetRect ?? {
    height: 0,
    width: 0,
    x: 0,
    y: 0,
  };

  return (
    <>
      {renderRectPositionFields(props, targetRect)}
      {renderRectSizeFields(props, targetRect)}
    </>
  );
}

function renderRectPositionFields(
  props: AnnotationTargetControlsProps,
  targetRect: VideoProjectAnnotationTargetRect
) {
  return (
    <>
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetPointXLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetRect: { ...targetRect, x: value },
          })
        }
        step={10}
        value={targetRect.x}
      />
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetPointYLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetRect: { ...targetRect, y: value },
          })
        }
        step={10}
        value={targetRect.y}
      />
    </>
  );
}

function renderRectSizeFields(
  props: AnnotationTargetControlsProps,
  targetRect: VideoProjectAnnotationTargetRect
) {
  return (
    <>
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetRectWidthLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetRect: { ...targetRect, width: value },
          })
        }
        step={10}
        value={targetRect.width}
      />
      <TargetNumberField
        disabled={props.disabled}
        label={translate('videoEditor.sidebar.annotationTargetRectHeightLabel')}
        min={0}
        onChange={(value) =>
          props.onUpdateAnnotationClipTemplate(props.clip.id, {
            targetRect: { ...targetRect, height: value },
          })
        }
        step={10}
        value={targetRect.height}
      />
    </>
  );
}
