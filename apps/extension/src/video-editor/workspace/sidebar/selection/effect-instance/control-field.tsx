import {
  resolveEffectLocaleText,
  type ControlDefinition,
} from '@sniptale/runtime-contracts/effect-v1';
import { useAppLocale } from '../../../../../platform/i18n';
import { useInspectorLayout } from '../../../../../ui/compact-inspector-controls/layout';
import { TextField } from '../../../../../ui/compact-inspector-controls';
import {
  EffectControlChoices,
  EffectControlFrame,
  EffectControlTextarea,
  effectControlUnit,
  effectControlSliderRange,
} from '../../../../../ui/effect-control-presentation/controls';
import type { VideoProjectEffectInstancePatch } from '../../../../contracts/commands/patches';
import { NumberInput } from '../inputs/number';
import { ColorField } from '../shared/controls';
import { useEffectPresetEditing } from './editing';

type FieldProps = {
  disabled: boolean;
  label: string;
  value: number | string;
  onChange(value: number | string): void;
};

/** Native command ownership stays outside the metadata-driven field presentation. */
export function EffectControl(props: {
  control: ControlDefinition;
  controls: Readonly<Record<string, number | string>>;
  disabled: boolean;
  instanceId: string;
  onUpdate(instanceId: string, patch: VideoProjectEffectInstancePatch): void;
  value: number | string;
}) {
  const locale = useAppLocale();
  const editing = useEffectPresetEditing(props.instanceId, props.controls);
  const control = props.control;
  const field = {
    disabled: props.disabled,
    label: resolveEffectLocaleText(control.label, locale) || control.id,
    value: props.value,
    onChange: (value: number | string) =>
      props.onUpdate(props.instanceId, { controls: { [control.id]: value } }),
  };
  let input;
  if (control.options?.length)
    input = <EffectControlChoices {...field} control={control} locale={locale} />;
  else if (control.kind === 'number')
    input = (
      <EffectNumberControl
        {...field}
        control={control}
        onPreview={editing.begin}
        onCommit={editing.finish}
      />
    );
  else if (control.kind === 'color')
    input = (
      <ColorField
        className="border-transparent! bg-transparent! px-0! py-0!"
        disabled={field.disabled}
        label={field.label}
        value={typeof props.value === 'string' ? props.value : control.defaultValue}
        onChange={field.onChange}
        onRememberRecentColor={undefined}
        recentColors={undefined}
      />
    );
  else input = <EffectTextControl {...field} control={control} instanceId={props.instanceId} />;
  return <EffectControlFrame control={control}>{input}</EffectControlFrame>;
}

/** Numeric preview and commit remain one existing editor gesture. */
function EffectNumberControl(
  props: FieldProps & {
    control: Extract<ControlDefinition, { kind: 'number' }>;
    onPreview(): void;
    onCommit(): void;
  }
) {
  const { control } = props;
  const value = typeof props.value === 'number' ? props.value : control.defaultValue;
  const range =
    control.presentation === 'slider' ? effectControlSliderRange(control, value) : undefined;
  return (
    <NumberInput
      disabled={props.disabled}
      label={props.label}
      value={value}
      onChange={props.onChange}
      onPreview={props.onPreview}
      onCommit={props.onCommit}
      unit={effectControlUnit(control.unit)}
      scrub={control.presentation !== 'number'}
      scrubRange={range}
      revealScrub={control.presentation === 'slider'}
      {...(control.min === undefined ? {} : { min: control.min })}
      {...(control.max === undefined ? {} : { max: control.max })}
      {...(control.step === undefined ? {} : { step: control.step })}
    />
  );
}

/** Text accepts a local draft; it does not use numeric preview transactions. */
function EffectTextControl(
  props: FieldProps & {
    control: Extract<ControlDefinition, { defaultValue: string }>;
    instanceId: string;
  }
) {
  const inspector = useInspectorLayout();
  const value = typeof props.value === 'string' ? props.value : props.control.defaultValue;
  if (props.control.presentation === 'textarea')
    return (
      <EffectControlTextarea
        label={props.label}
        value={value}
        disabled={props.disabled}
        onCommit={props.onChange}
      />
    );
  return (
    <TextField
      className={
        inspector
          ? undefined
          : '!min-h-9 !bg-transparent !px-0 !py-0 data-[editing=false]:!border-transparent'
      }
      defaultValue={value}
      disabled={props.disabled}
      key={`${props.instanceId}:${props.control.id}:${value}`}
      label={props.label}
      onValueCommit={props.onChange}
    />
  );
}
