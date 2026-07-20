import { CompactColorSelector } from '../../../../../ui/color-selector';
import { CompactInput, CompactSelect } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import { Field } from '../field-shell';
import {
  createDefaultLinearGradient,
  resolveCssGradient,
  serializeCssLinearGradient,
  type CssLinearGradient,
} from './css-gradient';

const COLOR_PALETTE = ['#ffffff', '#000000', '#f97316', '#2563eb', '#059669', '#e11d48'];

function getGradientModeOptions() {
  return [
    { value: 'none', label: translate('content.pageStyleInspector.optionNone') },
    { value: 'linear', label: translate('content.pageStyleInspector.gradientLinear') },
  ] as const;
}

function parseAngleInput(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

type GradientFieldModel = {
  gradient: CssLinearGradient;
  mode: 'linear' | 'none';
  unsupported: boolean;
  updateGradient: (patch: Partial<CssLinearGradient>) => void;
};

function useGradientFieldModel(
  value: string,
  onChange: (value: string) => void
): GradientFieldModel {
  const resolved = resolveCssGradient(value);
  const gradient =
    resolved.mode === 'unsupported' ? createDefaultLinearGradient() : resolved.gradient;
  const updateGradient = (patch: Partial<CssLinearGradient>) =>
    onChange(serializeCssLinearGradient({ ...gradient, ...patch }));

  return {
    gradient,
    mode: resolved.mode === 'none' ? 'none' : 'linear',
    unsupported: resolved.mode === 'unsupported',
    updateGradient,
  };
}

export function GradientField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  value: string;
}) {
  const model = useGradientFieldModel(props.value, props.onChange);

  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <GradientFieldBody
        disabled={props.disabled}
        label={props.label}
        model={model}
        onChange={props.onChange}
      />
    </Field>
  );
}

function GradientFieldBody(props: {
  disabled: boolean;
  label: string;
  model: GradientFieldModel;
  onChange: (value: string) => void;
}) {
  return (
    <div data-ui="content.page-style-inspector.gradient-field" className="grid gap-2">
      <GradientPreview gradient={props.model.gradient} mode={props.model.mode} />
      <GradientModeSelect {...props} />
      {props.model.mode === 'linear' ? (
        <GradientSubControls disabled={props.disabled} model={props.model} />
      ) : null}
      {props.model.unsupported ? <UnsupportedValueNotice /> : null}
    </div>
  );
}

function GradientPreview(props: { gradient: CssLinearGradient; mode: 'linear' | 'none' }) {
  return (
    <div
      aria-hidden="true"
      className={[
        'h-10 rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-input)]',
      ].join(' ')}
      style={{
        backgroundImage:
          props.mode === 'linear' ? serializeCssLinearGradient(props.gradient) : undefined,
      }}
    />
  );
}

function GradientModeSelect(props: {
  disabled: boolean;
  label: string;
  model: GradientFieldModel;
  onChange: (value: string) => void;
}) {
  return (
    <CompactSelect
      aria-label={props.label}
      disabled={props.disabled}
      options={getGradientModeOptions()}
      value={props.model.mode}
      onChange={(nextMode) =>
        props.onChange(
          nextMode === 'none' ? 'none' : serializeCssLinearGradient(createDefaultLinearGradient())
        )
      }
    />
  );
}

function GradientSubControls(props: { disabled: boolean; model: GradientFieldModel }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <GradientColorField
        label={translate('content.pageStyleInspector.gradientStartColor')}
        recentColors={[props.model.gradient.from, props.model.gradient.to]}
        value={props.model.gradient.from}
        onChange={(from) => props.model.updateGradient({ from })}
      />
      <GradientColorField
        label={translate('content.pageStyleInspector.gradientEndColor')}
        recentColors={[props.model.gradient.to, props.model.gradient.from]}
        value={props.model.gradient.to}
        onChange={(to) => props.model.updateGradient({ to })}
      />
      <div className="col-span-2">
        <GradientAngleInput disabled={props.disabled} model={props.model} />
      </div>
    </div>
  );
}

function GradientColorField(props: {
  label: string;
  onChange: (value: string) => void;
  recentColors: readonly string[];
  value: string;
}) {
  return (
    <CompactColorSelector
      label={props.label}
      title={props.label}
      palette={COLOR_PALETTE}
      recentColors={props.recentColors}
      value={props.value}
      onChange={props.onChange}
    />
  );
}

function GradientAngleInput(props: { disabled: boolean; model: GradientFieldModel }) {
  return (
    <CompactInput
      aria-label={translate('content.pageStyleInspector.gradientAngle')}
      disabled={props.disabled}
      inputMode="numeric"
      value={String(props.model.gradient.angle)}
      onChange={(event) =>
        props.model.updateGradient({
          angle: parseAngleInput(event.currentTarget.value, props.model.gradient.angle),
        })
      }
    />
  );
}

function UnsupportedValueNotice() {
  return (
    <div className="text-[11px] font-semibold text-[var(--sniptale-color-warning)]">
      {translate('content.pageStyleInspector.unsupportedCssValue')}
    </div>
  );
}
