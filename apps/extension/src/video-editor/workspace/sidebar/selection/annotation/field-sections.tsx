import { translate } from '../../../../../platform/i18n';
import { TextareaField, TextField } from '../../../../../ui/compact-inspector-controls';
import { resolveAnnotationTemplateControls } from '../../../../../features/video/project/annotation/template-controls';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import {
  ANNOTATION_ANIMATION_OPTIONS,
  getAnnotationDirectionOptions,
  getAnnotationIntensityOptions,
} from './options';
import { AnnotationStyleControls } from './style-controls';
import { ColorField, SelectInput } from '../shared/controls';
import { OptionButtonsField } from '../shared/option-buttons';
import { SliderField } from '../shared/sliders';

type SelectedAnnotationClip = Extract<
  NonNullable<WorkspaceSidebarProps['selectedClip']>,
  { type: 'ANNOTATION' }
>;

export type AnnotationFieldsSectionProps = {
  clip: SelectedAnnotationClip;
  disabled: boolean;
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'];
  onUpdateAnnotationClipContent: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipContent']
  >;
  onUpdateAnnotationClipStyle: NonNullable<WorkspaceSidebarProps['onUpdateAnnotationClipStyle']>;
  onUpdateAnnotationClipTemplate: NonNullable<
    WorkspaceSidebarProps['onUpdateAnnotationClipTemplate']
  >;
  recentColors?: WorkspaceSidebarProps['recentColors'];
};

export function renderAnnotationContentFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.showHeadline ? (
        <TextareaField
          disabled={props.disabled}
          label={translate('videoEditor.sidebar.annotationHeadlineLabel')}
          minHeightClassName="min-h-[72px]"
          value={props.clip.content.headline}
          onChange={(value) =>
            props.onUpdateAnnotationClipContent(props.clip.id, { headline: value })
          }
        />
      ) : null}
      {controls.showSubline ? (
        <TextareaField
          disabled={props.disabled}
          label={translate('videoEditor.sidebar.annotationSublineLabel')}
          minHeightClassName="min-h-[84px]"
          value={props.clip.content.subline}
          onChange={(value) =>
            props.onUpdateAnnotationClipContent(props.clip.id, { subline: value })
          }
        />
      ) : null}
    </>
  );
}

export function renderAnnotationContentMetaFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  if (!controls.showBadge) {
    return null;
  }

  return (
    <TextField
      key={props.clip.content.badge ?? ''}
      defaultValue={props.clip.content.badge ?? ''}
      disabled={props.disabled}
      label={translate('videoEditor.sidebar.annotationBadgeLabel')}
      onValueCommit={(value) =>
        props.onUpdateAnnotationClipContent(props.clip.id, {
          badge: value.trim() ? value : null,
        })
      }
    />
  );
}

export function renderAnnotationAppearanceFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.showAccentColor ? (
        <ColorField
          label={translate('videoEditor.sidebar.annotationAccentColorLabel')}
          disabled={props.disabled}
          recentColors={props.recentColors}
          onRememberRecentColor={props.onRememberRecentColor}
          value={props.clip.style.accentColor}
          onChange={(value) =>
            props.onUpdateAnnotationClipStyle(props.clip.id, { accentColor: value })
          }
        />
      ) : null}
      {controls.showBackgroundColor ? (
        <ColorField
          label={translate('videoEditor.sidebar.annotationBackgroundColorLabel')}
          disabled={props.disabled}
          recentColors={props.recentColors}
          onRememberRecentColor={props.onRememberRecentColor}
          value={props.clip.style.backgroundColor}
          onChange={(value) =>
            props.onUpdateAnnotationClipStyle(props.clip.id, {
              backgroundColor: value,
            })
          }
        />
      ) : null}
      <AnnotationStyleControls
        clip={props.clip}
        controls={controls}
        disabled={props.disabled}
        recentColors={props.recentColors}
        onRememberRecentColor={props.onRememberRecentColor}
        onUpdateAnnotationClipStyle={props.onUpdateAnnotationClipStyle}
      />
    </>
  );
}

export function renderAnnotationMotionFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.showIntensity ? (
        <OptionButtonsField
          label={translate('videoEditor.sidebar.annotationIntensityLabel')}
          value={props.clip.intensity}
          disabled={props.disabled}
          onChange={(value) =>
            props.onUpdateAnnotationClipTemplate(props.clip.id, { intensity: value })
          }
          options={getAnnotationIntensityOptions()}
        />
      ) : null}
      {controls.showDirection ? renderDirectionField(props) : null}
      {controls.showIntroAnimation || controls.showIntroDuration ? renderIntroFields(props) : null}
      {controls.showOutroAnimation || controls.showOutroDuration ? renderOutroFields(props) : null}
    </>
  );
}

function renderDirectionField(props: AnnotationFieldsSectionProps) {
  return (
    <SelectInput
      label={translate('videoEditor.sidebar.annotationDirectionLabel')}
      value={props.clip.direction}
      disabled={props.disabled}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, { direction: value })
      }
      options={getAnnotationDirectionOptions()}
    />
  );
}

function renderIntroFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.showIntroAnimation ? (
        <SelectInput
          label={translate('videoEditor.sidebar.annotationIntroLabel')}
          value={props.clip.introAnimation}
          disabled={props.disabled}
          onChange={(value) =>
            props.onUpdateAnnotationClipTemplate(props.clip.id, { introAnimation: value })
          }
          options={getAnnotationAnimationOptions()}
        />
      ) : null}
      {controls.showIntroDuration
        ? renderAnimationDurationField(props, {
            label: translate('videoEditor.sidebar.annotationIntroDurationLabel'),
            valueMs: props.clip.introDurationMs,
            field: 'introDurationMs',
          })
        : null}
    </>
  );
}

function renderOutroFields(props: AnnotationFieldsSectionProps) {
  const controls = resolveAnnotationTemplateControls(props.clip.templateKind);

  return (
    <>
      {controls.showOutroAnimation ? (
        <SelectInput
          label={translate('videoEditor.sidebar.annotationOutroLabel')}
          value={props.clip.outroAnimation}
          disabled={props.disabled}
          onChange={(value) =>
            props.onUpdateAnnotationClipTemplate(props.clip.id, { outroAnimation: value })
          }
          options={getAnnotationAnimationOptions()}
        />
      ) : null}
      {controls.showOutroDuration
        ? renderAnimationDurationField(props, {
            label: translate('videoEditor.sidebar.annotationOutroDurationLabel'),
            valueMs: props.clip.outroDurationMs,
            field: 'outroDurationMs',
          })
        : null}
    </>
  );
}

function renderAnimationDurationField(
  props: AnnotationFieldsSectionProps,
  params: {
    field: 'introDurationMs' | 'outroDurationMs';
    label: string;
    valueMs: number;
  }
) {
  return (
    <SliderField
      label={params.label}
      value={params.valueMs / 1000}
      min={0}
      max={5}
      step={0.05}
      disabled={props.disabled}
      formatValue={(value) => `${value.toFixed(2)} s`}
      onChange={(value) =>
        props.onUpdateAnnotationClipTemplate(props.clip.id, {
          [params.field]: Math.round(value * 1000),
        })
      }
    />
  );
}

function getAnnotationAnimationOptions() {
  return ANNOTATION_ANIMATION_OPTIONS.map((option) => ({
    value: option.value,
    label: translate(option.labelKey),
  }));
}
