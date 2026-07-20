import { CompactColorSelector } from '../../../../../ui/color-selector';
import { CompactInput, CompactSelect } from '../../../../../ui/compact-inspector-controls';
import { translate } from '../../../../../platform/i18n';
import { Field } from '../field-shell';
import {
  createDefaultBoxShadow,
  resolveCssBoxShadow,
  serializeCssBoxShadow,
  type CssBoxShadow,
} from './css-shadow';

const COLOR_PALETTE = ['rgba(0, 0, 0, 0.2)', '#000000', '#27272a', '#6b7280', '#f97316'];

function getShadowModeOptions() {
  return [
    { value: 'none', label: translate('content.pageStyleInspector.optionNone') },
    { value: 'enabled', label: translate('content.pageStyleInspector.shadowEnabled') },
  ] as const;
}

function normalizeLengthInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '0px';
  }

  return trimmed.endsWith('px') ? trimmed : `${trimmed}px`;
}

type ShadowFieldModel = {
  mode: 'enabled' | 'none';
  shadow: CssBoxShadow;
  unsupported: boolean;
  updateShadow: (patch: Partial<CssBoxShadow>) => void;
};

function useShadowFieldModel(value: string, onChange: (value: string) => void): ShadowFieldModel {
  const resolved = resolveCssBoxShadow(value);
  const shadow = resolved.mode === 'unsupported' ? createDefaultBoxShadow() : resolved.shadow;
  const updateShadow = (patch: Partial<CssBoxShadow>) =>
    onChange(serializeCssBoxShadow({ ...shadow, ...patch }));

  return {
    mode: resolved.mode === 'none' ? 'none' : 'enabled',
    shadow,
    unsupported: resolved.mode === 'unsupported',
    updateShadow,
  };
}

export function ShadowField(props: {
  defaultValue?: string | undefined;
  disabled: boolean;
  label: string;
  modified?: boolean | undefined;
  onChange: (value: string) => void;
  onReset?: (() => void) | undefined;
  value: string;
}) {
  const model = useShadowFieldModel(props.value, props.onChange);

  return (
    <Field
      defaultValue={props.defaultValue}
      label={props.label}
      modified={props.modified}
      onReset={props.onReset}
    >
      <ShadowFieldBody
        disabled={props.disabled}
        label={props.label}
        model={model}
        onChange={props.onChange}
      />
    </Field>
  );
}

function ShadowFieldBody(props: {
  disabled: boolean;
  label: string;
  model: ShadowFieldModel;
  onChange: (value: string) => void;
}) {
  return (
    <div data-ui="content.page-style-inspector.shadow-field" className="grid gap-2">
      <ShadowModeRow {...props} />
      {props.model.mode === 'enabled' ? (
        <ShadowSubControls disabled={props.disabled} model={props.model} />
      ) : null}
      {props.model.unsupported ? <UnsupportedValueNotice /> : null}
    </div>
  );
}

function ShadowModeRow(props: {
  disabled: boolean;
  label: string;
  model: ShadowFieldModel;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
      <ShadowPreview model={props.model} />
      <CompactSelect
        aria-label={props.label}
        disabled={props.disabled}
        options={getShadowModeOptions()}
        value={props.model.mode}
        onChange={(nextMode) =>
          props.onChange(
            nextMode === 'none' ? 'none' : serializeCssBoxShadow(createDefaultBoxShadow())
          )
        }
      />
    </div>
  );
}

function ShadowPreview(props: { model: ShadowFieldModel }) {
  return (
    <div
      aria-hidden="true"
      className={[
        'h-10 rounded-[10px] border bg-[var(--sniptale-color-surface-panel)]',
        'border-[color:var(--sniptale-color-border-soft)]',
      ].join(' ')}
      style={{
        boxShadow:
          props.model.mode === 'enabled' ? serializeCssBoxShadow(props.model.shadow) : undefined,
      }}
    />
  );
}

function ShadowSubControls(props: { disabled: boolean; model: ShadowFieldModel }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <ShadowLengthInput
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.shadowOffsetX')}
        value={props.model.shadow.x}
        onChange={(x) => props.model.updateShadow({ x })}
      />
      <ShadowLengthInput
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.shadowOffsetY')}
        value={props.model.shadow.y}
        onChange={(y) => props.model.updateShadow({ y })}
      />
      <ShadowLengthInput
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.shadowBlur')}
        value={props.model.shadow.blur}
        onChange={(blur) => props.model.updateShadow({ blur })}
      />
      <ShadowLengthInput
        disabled={props.disabled}
        label={translate('content.pageStyleInspector.shadowSpread')}
        value={props.model.shadow.spread}
        onChange={(spread) => props.model.updateShadow({ spread })}
      />
      <div className="col-span-2">
        <CompactColorSelector
          label={translate('content.pageStyleInspector.shadowColor')}
          title={translate('content.pageStyleInspector.shadowColor')}
          palette={COLOR_PALETTE}
          recentColors={[props.model.shadow.color]}
          value={props.model.shadow.color}
          onChange={(color) => props.model.updateShadow({ color })}
        />
      </div>
    </div>
  );
}

function ShadowLengthInput(props: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CompactInput
      aria-label={props.label}
      disabled={props.disabled}
      inputMode="decimal"
      value={props.value.replace(/px$/, '')}
      onChange={(event) => props.onChange(normalizeLengthInput(event.currentTarget.value))}
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
