import { translate } from '../../../../../../platform/i18n';
import { resolveAnnotationTemplateControls } from '../../../../../../features/video/project/annotation/template-controls';
import type { AnnotationTargetControlsProps } from './props';
import {
  getAnnotationArrowKindOptions,
  getAnnotationLeaderLineStyleOptions,
  getAnnotationMarkerKindOptions,
} from '../options';
import { NumberInput } from '../../inputs/number';
import { OptionButtonsField } from '../../shared/option-buttons';

export function renderTargetDecorFields(props: AnnotationTargetControlsProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.supportsLeaderLineStyle ? renderLeaderLineStyleField(props) : null}
      {controls.supportsLeaderLineThickness ? renderLeaderLineThicknessField(props) : null}
      {controls.supportsMarkerKind ? renderMarkerField(props) : null}
      {controls.supportsArrowKind ? renderArrowField(props) : null}
    </>
  );
}

function renderLeaderLineStyleField(props: AnnotationTargetControlsProps) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.annotationLeaderLineStyleLabel')}
      value={props.clip.leaderLine.style}
      disabled={props.disabled}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          leaderLine: { style: value },
        })
      }
      options={getAnnotationLeaderLineStyleOptions()}
    />
  );
}

function renderLeaderLineThicknessField(props: AnnotationTargetControlsProps) {
  return (
    <NumberInput
      label={translate('videoEditor.sidebar.annotationLeaderLineThicknessLabel')}
      value={props.clip.leaderLine.thickness}
      min={1}
      max={32}
      step={1}
      disabled={props.disabled}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          leaderLine: { thickness: value },
        })
      }
    />
  );
}

function renderMarkerField(props: AnnotationTargetControlsProps) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.annotationMarkerKindLabel')}
      value={props.clip.calloutDecor.markerKind}
      disabled={props.disabled}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          calloutDecor: { markerKind: value },
        })
      }
      options={getAnnotationMarkerKindOptions()}
    />
  );
}

function renderArrowField(props: AnnotationTargetControlsProps) {
  return (
    <OptionButtonsField
      label={translate('videoEditor.sidebar.annotationArrowKindLabel')}
      value={props.clip.calloutDecor.arrowKind}
      disabled={props.disabled}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          calloutDecor: { arrowKind: value },
        })
      }
      options={getAnnotationArrowKindOptions()}
    />
  );
}
