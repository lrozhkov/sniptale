import { translate } from '../../../../../platform/i18n';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import { ColorField } from '../shared/controls';
import { SliderField } from '../shared/sliders';

type SelectedAnnotationClip = Extract<
  NonNullable<WorkspaceSidebarProps['selectedClip']>,
  { type: 'ANNOTATION' }
>;

type AnnotationStyleControlsProps = {
  clip: SelectedAnnotationClip;
  controls: {
    showBadgeTextColor: boolean;
    showBorderRadius: boolean;
    showDepthAmount: boolean;
    showHeadlineColor: boolean;
    showPadding: boolean;
    showShimmerAmount: boolean;
    showSublineColor: boolean;
  };
  disabled: boolean;
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'];
  onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>;
  recentColors?: WorkspaceSidebarProps['recentColors'];
};

function renderStyleTextInput(props: {
  clip: SelectedAnnotationClip;
  disabled: boolean;
  field: 'badgeTextColor' | 'headlineColor' | 'sublineColor';
  label: string;
  onUpdateAnnotationClipStyle: AnnotationStyleControlsProps['onUpdateAnnotationClipStyle'];
  onRememberRecentColor?: AnnotationStyleControlsProps['onRememberRecentColor'];
  recentColors?: AnnotationStyleControlsProps['recentColors'];
}) {
  return (
    <ColorField
      label={props.label}
      disabled={props.disabled}
      recentColors={props.recentColors}
      onRememberRecentColor={props.onRememberRecentColor}
      value={props.clip.style[props.field]}
      onChange={(value) =>
        props.onUpdateAnnotationClipStyle(props.clip.id, {
          [props.field]: value,
        })
      }
    />
  );
}

function renderStyleNumberInput(props: {
  clip: SelectedAnnotationClip;
  disabled: boolean;
  field: 'borderRadius' | 'depthAmount' | 'padding' | 'shimmerAmount';
  formatValue?: (value: number) => string;
  label: string;
  max?: number;
  min?: number;
  onUpdateAnnotationClipStyle: AnnotationStyleControlsProps['onUpdateAnnotationClipStyle'];
  step?: number;
}) {
  return (
    <SliderField
      label={props.label}
      value={props.clip.style[props.field]}
      disabled={props.disabled}
      min={props.min ?? 0}
      max={props.max ?? 100}
      {...(props.formatValue ? { formatValue: props.formatValue } : {})}
      {...(props.step === undefined ? {} : { step: props.step })}
      onChange={(value) =>
        props.onUpdateAnnotationClipStyle(props.clip.id, {
          [props.field]: value,
        })
      }
    />
  );
}

function renderTextColorFields(props: AnnotationStyleControlsProps) {
  return (
    <>
      {props.controls.showHeadlineColor
        ? renderStyleTextInput({
            ...props,
            field: 'headlineColor',
            label: translate('videoEditor.sidebar.annotationHeadlineColorLabel'),
          })
        : null}
      {props.controls.showSublineColor
        ? renderStyleTextInput({
            ...props,
            field: 'sublineColor',
            label: translate('videoEditor.sidebar.annotationSublineColorLabel'),
          })
        : null}
      {props.controls.showBadgeTextColor
        ? renderStyleTextInput({
            ...props,
            field: 'badgeTextColor',
            label: translate('videoEditor.sidebar.annotationBadgeTextColorLabel'),
          })
        : null}
    </>
  );
}

function renderLayoutFields(props: AnnotationStyleControlsProps) {
  return (
    <>
      {props.controls.showPadding
        ? renderStyleNumberInput({
            ...props,
            field: 'padding',
            label: translate('videoEditor.sidebar.annotationPaddingLabel'),
            min: 0,
            max: 80,
            step: 1,
            formatValue: (value) => `${Math.round(value)} px`,
          })
        : null}
      {props.controls.showBorderRadius
        ? renderStyleNumberInput({
            ...props,
            field: 'borderRadius',
            label: translate('videoEditor.sidebar.annotationBorderRadiusLabel'),
            min: 0,
            max: 64,
            step: 1,
            formatValue: (value) => `${Math.round(value)} px`,
          })
        : null}
    </>
  );
}

function renderEffectFields(props: AnnotationStyleControlsProps) {
  return (
    <>
      {props.controls.showDepthAmount
        ? renderStyleNumberInput({
            ...props,
            field: 'depthAmount',
            label: translate('videoEditor.sidebar.annotationDepthAmountLabel'),
            min: 0,
            max: 1,
            step: 0.01,
            formatValue: (value) => `${Math.round(value * 100)}%`,
          })
        : null}
      {props.controls.showShimmerAmount
        ? renderStyleNumberInput({
            ...props,
            field: 'shimmerAmount',
            label: translate('videoEditor.sidebar.annotationShimmerAmountLabel'),
            min: 0,
            max: 1,
            step: 0.01,
            formatValue: (value) => `${Math.round(value * 100)}%`,
          })
        : null}
    </>
  );
}

export function AnnotationStyleControls(props: AnnotationStyleControlsProps) {
  return (
    <>
      {renderTextColorFields(props)}
      {renderLayoutFields(props)}
      {renderEffectFields(props)}
    </>
  );
}
