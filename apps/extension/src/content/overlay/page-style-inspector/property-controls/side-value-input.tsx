import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { CompactColorSelector } from '../../../../ui/color-selector';
import { CompactInput, CompactSelect } from '../../../../ui/compact-inspector-controls';
import type { PageStyleProperty } from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../platform/i18n';
import {
  isCssNumericLength,
  normalizeCssLengthInput,
  splitCssLength,
  stepCssLength,
} from './css-length';

type SideValueKind = 'color' | 'length' | 'select' | 'text';

const COLOR_PALETTE = ['#27272a', '#09090b', '#6b7280', '#f97316', '#2563eb', '#059669'];

const BORDER_STYLE_OPTIONS = [
  { value: 'none', label: translate('content.pageStyleInspector.optionNone') },
  { value: 'solid', label: translate('content.pageStyleInspector.optionSolid') },
  { value: 'dashed', label: translate('content.pageStyleInspector.optionDashed') },
  { value: 'dotted', label: translate('content.pageStyleInspector.optionDotted') },
  { value: 'double', label: translate('content.pageStyleInspector.optionDouble') },
] as const;

function normalizeBorderStyleValue(value: string): string {
  return value.trim() || 'none';
}

function getBorderStyleOptions(value: string) {
  const normalizedValue = normalizeBorderStyleValue(value);
  if (BORDER_STYLE_OPTIONS.some((option) => option.value === normalizedValue)) {
    return BORDER_STYLE_OPTIONS;
  }

  return [{ value: normalizedValue, label: normalizedValue }, ...BORDER_STYLE_OPTIONS];
}

export function resolveSideValueKind(property: PageStyleProperty): SideValueKind {
  if (property.endsWith('-color')) {
    return 'color';
  }
  if (property.endsWith('-style')) {
    return 'select';
  }

  return 'length';
}

export function SideValueInput(props: {
  ariaLabel?: string;
  disabled: boolean;
  fallbackValue?: string | undefined;
  kind: SideValueKind;
  onChange: (value: string) => void;
  showUnit?: boolean | undefined;
  value: string;
}) {
  if (props.kind === 'select') {
    return <SideSelectInput {...props} />;
  }

  if (props.kind === 'color') {
    return <SideColorInput {...props} />;
  }

  if (props.kind !== 'length') {
    return <SideTextInput {...props} />;
  }

  return <SideLengthInput {...props} />;
}

function SideSelectInput(props: {
  ariaLabel?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CompactSelect
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      options={getBorderStyleOptions(props.value)}
      value={normalizeBorderStyleValue(props.value)}
      onChange={props.onChange}
    />
  );
}

function SideColorInput(props: {
  ariaLabel?: string;
  fallbackValue?: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CompactColorSelector
      label={props.ariaLabel ?? ''}
      title={props.ariaLabel ?? ''}
      palette={COLOR_PALETTE}
      recentColors={[props.fallbackValue ?? '', props.value].filter(Boolean)}
      value={props.value || props.fallbackValue || '#27272a'}
      onChange={props.onChange}
    />
  );
}

function SideTextInput(props: {
  ariaLabel?: string;
  disabled: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <CompactInput
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    />
  );
}

function SideLengthInput(props: {
  ariaLabel?: string;
  disabled: boolean;
  fallbackValue?: string | undefined;
  onChange: (value: string) => void;
  showUnit?: boolean | undefined;
  value: string;
}) {
  const parsed = splitCssLength(props.value);
  const fallbackUnit = splitCssLength(props.fallbackValue ?? '').unit;
  const showUnit =
    props.showUnit !== false &&
    (isCssNumericLength(props.value) || (!props.value.trim() && Boolean(fallbackUnit)));
  const unit = parsed.unit || fallbackUnit || 'px';
  const inputValue = showUnit ? parsed.numberText : props.value;

  return (
    <div className="group/side-number relative min-w-0">
      <CompactInput
        aria-label={props.ariaLabel}
        className={showUnit ? 'pr-14' : 'pr-7'}
        disabled={props.disabled}
        inputMode="decimal"
        value={inputValue}
        onChange={(event) =>
          props.onChange(
            showUnit
              ? `${event.currentTarget.value}${unit}`
              : normalizeCssLengthInput(event.currentTarget.value, props.fallbackValue)
          )
        }
      />
      {showUnit ? <SideLengthUnit unit={unit} /> : null}
      <SideLengthStepper {...props} />
    </div>
  );
}

function SideLengthUnit({ unit }: { unit: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute right-9 top-1/2 -translate-y-1/2',
        'text-[10px] font-semibold text-[var(--sniptale-color-text-dim)]',
      ].join(' ')}
    >
      {unit}
    </span>
  );
}

function SideLengthStepper(props: {
  ariaLabel?: string;
  disabled: boolean;
  fallbackValue?: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div
      className={[
        'absolute right-1 top-1/2 grid h-8 w-5 -translate-y-1/2 overflow-hidden rounded-[7px]',
        'border border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
        'opacity-0 transition-opacity',
        'group-hover/side-number:opacity-100 group-focus-within/side-number:opacity-100',
      ].join(' ')}
    >
      <SideStepButton {...props} direction={1}>
        <ChevronUp size={11} />
      </SideStepButton>
      <SideStepButton {...props} direction={-1}>
        <ChevronDown size={11} />
      </SideStepButton>
    </div>
  );
}

function SideStepButton(props: {
  children: ReactNode;
  ariaLabel?: string;
  direction: -1 | 1;
  disabled: boolean;
  fallbackValue?: string | undefined;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      className={[
        'inline-flex items-center justify-center',
        'text-[var(--sniptale-color-text-secondary)] hover:text-[var(--sniptale-color-accent)]',
      ].join(' ')}
      aria-label={`${props.ariaLabel ?? ''}: ${props.direction > 0 ? '+1' : '-1'}`}
      onClick={(event) => {
        event.preventDefault();
        props.onChange(stepCssLength(props.value, props.fallbackValue, props.direction));
      }}
    >
      {props.children}
    </button>
  );
}
