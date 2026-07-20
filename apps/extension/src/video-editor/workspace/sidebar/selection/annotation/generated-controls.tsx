import {
  VideoAnnotationControlType,
  createTemplateRefKey,
  createVideoAnnotationTemplateSnapshot,
  getLegacyAnnotationTemplateRefs,
  resolveVideoAnnotationTemplate,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationControlSection,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateControl,
  type VideoAnnotationTemplateControlValues,
} from '../../../../../features/video/project/annotation-engine';
import { resolveLocalizedText } from '../../../../../platform/i18n/localized-text';
import { TextareaField, TextField } from '../../../../../ui/compact-inspector-controls';
import type { WorkspaceSidebarProps } from '../../contracts/props';
import type { AnnotationFieldsSectionProps } from './field-sections';
import { ColorField, SelectInput, ToggleField } from '../shared/controls';
import { SliderField } from '../shared/sliders';
import { createGeneratedControlCompatibilityPatch } from './generated-compatibility';
import { getVisibleTemplateControls, resolveControlSection } from './control-sections';

type SelectedAnnotationClip = Extract<
  NonNullable<WorkspaceSidebarProps['selectedClip']>,
  { type: 'ANNOTATION' }
>;

export function AnnotationGeneratedControls(props: AnnotationGeneratedControlsProps) {
  const resolution = resolveVideoAnnotationTemplate(props.clip);
  const template =
    resolution.status === 'resolved' ? resolution.template : resolution.fallbackTemplate;

  if (!template || shouldUseLegacyControls(props.clip)) {
    return null;
  }

  const controls = getVisibleControls(template, props.section);

  return (
    <>
      {controls.map((control) => (
        <GeneratedControlField
          key={control.id}
          clip={props.clip}
          control={control}
          disabled={props.disabled}
          recentColors={props.recentColors}
          template={template}
          onRememberRecentColor={props.onRememberRecentColor}
          onUpdateAnnotationClipTemplate={props.onUpdateAnnotationClipTemplate}
        />
      ))}
    </>
  );
}

interface AnnotationGeneratedControlsProps extends AnnotationFieldsSectionProps {
  section?: VideoAnnotationControlSection | undefined;
}

type GeneratedControlFieldProps = {
  clip: SelectedAnnotationClip;
  control: VideoAnnotationTemplateControl;
  disabled: boolean;
  onRememberRecentColor?: WorkspaceSidebarProps['onRememberRecentColor'];
  onUpdateAnnotationClipTemplate: AnnotationFieldsSectionProps['onUpdateAnnotationClipTemplate'];
  recentColors?: WorkspaceSidebarProps['recentColors'];
  template: VideoAnnotationTemplate;
};

function GeneratedControlField(props: GeneratedControlFieldProps) {
  const value = readControlValue(props.clip, props.control);
  const label = resolveLocalizedText(props.control.label);
  const onChange = (nextValue: VideoAnnotationPrimitiveValue) => {
    props.onUpdateAnnotationClipTemplate(
      props.clip.id,
      createGeneratedControlPatch(props, nextValue)
    );
  };

  return renderGeneratedControlField({ label, onChange, props, value });
}

function renderGeneratedControlField(args: GeneratedControlRenderArgs) {
  const { label, onChange, props, value } = args;
  if (props.control.type === VideoAnnotationControlType.COLOR) {
    return renderGeneratedColorControl({ label, onChange, props, value });
  }
  if (props.control.type === VideoAnnotationControlType.NUMBER) {
    return renderGeneratedNumberControl({ label, onChange, props, value });
  }
  if (props.control.type === VideoAnnotationControlType.SELECT) {
    return renderGeneratedSelectControl({ label, onChange, props, value });
  }
  if (props.control.type === VideoAnnotationControlType.BOOLEAN) {
    return renderGeneratedBooleanControl({ label, onChange, props, value });
  }

  return renderGeneratedTextControl({ label, onChange, props, value });
}

type GeneratedControlRenderArgs = {
  label: string;
  onChange: (nextValue: VideoAnnotationPrimitiveValue) => void;
  props: GeneratedControlFieldProps;
  value: VideoAnnotationPrimitiveValue | undefined;
};

function renderGeneratedColorControl(args: GeneratedControlRenderArgs) {
  return (
    <ColorField
      label={args.label}
      disabled={args.props.disabled}
      value={typeof args.value === 'string' ? args.value : String(args.props.control.defaultValue)}
      recentColors={args.props.recentColors}
      onRememberRecentColor={args.props.onRememberRecentColor}
      onChange={args.onChange}
    />
  );
}

function renderGeneratedNumberControl(args: GeneratedControlRenderArgs) {
  const stepProps = args.props.control.step === undefined ? {} : { step: args.props.control.step };
  return (
    <SliderField
      label={args.label}
      disabled={args.props.disabled}
      value={
        typeof args.value === 'number' ? args.value : Number(args.props.control.defaultValue) || 0
      }
      min={args.props.control.min ?? 0}
      max={args.props.control.max ?? 100}
      {...stepProps}
      onChange={args.onChange}
    />
  );
}

function renderGeneratedSelectControl(args: GeneratedControlRenderArgs) {
  return (
    <SelectInput
      label={args.label}
      disabled={args.props.disabled}
      value={typeof args.value === 'string' ? args.value : String(args.props.control.defaultValue)}
      options={(args.props.control.options ?? []).map((option) => ({
        label: resolveLocalizedText(option.label),
        value: option.value,
      }))}
      onChange={args.onChange}
    />
  );
}

function renderGeneratedBooleanControl(args: GeneratedControlRenderArgs) {
  return (
    <ToggleField
      checked={args.value === true}
      disabled={args.props.disabled}
      label={args.label}
      onChange={args.onChange}
    />
  );
}

function renderGeneratedTextControl(args: GeneratedControlRenderArgs) {
  const { label, onChange, props, value } = args;
  const textValue = value ?? props.control.defaultValue ?? '';
  if (String(textValue).length > 72) {
    return (
      <TextareaField
        disabled={props.disabled}
        label={label}
        value={formatTextControlValue(textValue, props.control)}
        onChange={onChange}
      />
    );
  }

  const formattedValue = formatTextControlValue(textValue, props.control);
  return (
    <TextField
      key={formattedValue}
      defaultValue={formattedValue}
      disabled={props.disabled}
      label={label}
      onValueCommit={onChange}
    />
  );
}

function createGeneratedControlPatch(
  props: GeneratedControlFieldProps,
  nextValue: VideoAnnotationPrimitiveValue
) {
  const templateControlValues = {
    ...(props.clip.templateControlValues ?? {}),
    [props.control.id]: nextValue,
  };
  const templateRef = props.clip.templateRef ??
    props.clip.templateSnapshot?.templateRef ?? {
      packId: 'unknown',
      templateId: props.template.id,
    };
  return {
    ...createGeneratedControlCompatibilityPatch(props.clip, props.control, nextValue),
    templateControlValues,
    templateRef: props.clip.templateRef,
    templateSnapshot: createVideoAnnotationTemplateSnapshot(
      templateRef,
      templateControlValues,
      props.template,
      {
        label: props.clip.templateSnapshot?.packLabel,
        theme: props.clip.templateSnapshot?.packTheme,
      }
    ),
  };
}

function getVisibleControls(
  template: VideoAnnotationTemplate,
  section: VideoAnnotationControlSection | undefined
): readonly VideoAnnotationTemplateControl[] {
  if (!section) {
    return getVisibleTemplateControls(template);
  }
  return getVisibleTemplateControls(template).filter(
    (control) => resolveControlSection(control) === section
  );
}

function formatTextControlValue(
  value: VideoAnnotationPrimitiveValue,
  control: VideoAnnotationTemplateControl
): string {
  if (typeof value === 'string') {
    return value;
  }
  return value === null || typeof control.defaultValue !== 'string' ? '' : control.defaultValue;
}

function readControlValue(
  clip: SelectedAnnotationClip,
  control: VideoAnnotationTemplateControl
): VideoAnnotationPrimitiveValue {
  const values: VideoAnnotationTemplateControlValues = {
    ...Object.fromEntries([[control.id, control.defaultValue]]),
    ...(clip.templateSnapshot?.controls ?? {}),
    ...(clip.templateControlValues ?? {}),
  };
  return values[control.id] ?? control.defaultValue;
}

function shouldUseLegacyControls(clip: SelectedAnnotationClip): boolean {
  const templateRef = clip.templateRef ?? clip.templateSnapshot?.templateRef;
  if (!templateRef) {
    return true;
  }
  const refKey = createTemplateRefKey(templateRef);
  return Object.values(getLegacyAnnotationTemplateRefs()).some(
    (legacyRef) => createTemplateRefKey(legacyRef) === refKey
  );
}
