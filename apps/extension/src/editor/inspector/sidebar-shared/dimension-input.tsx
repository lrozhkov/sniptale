import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { createDimensionDraftActions } from './dimension-input.helpers';

const dimensionInputShellClassName = [
  'group rounded-[14px] border border-[color:var(--sniptale-color-border-soft)]',
  'border-t-[color:var(--sniptale-color-border-strong)]',
  'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-surface-panel)_86%,transparent),',
  'color-mix(in_srgb,var(--sniptale-color-surface-panel)_58%,transparent)_100%)]',
  'p-1.5 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-strong)_28%,transparent)] transition',
  'focus-within:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
].join(' ');
const dimensionStepperButtonClassName = [
  'flex h-[18px] w-7 items-center justify-center rounded-[8px]',
  'border border-[color:var(--sniptale-color-border-soft)] border-t-[color:var(--sniptale-color-border-strong)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_82%,transparent)]',
  'text-[color:var(--sniptale-color-text-muted)] transition',
  'hover:border-[color:var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[color:var(--sniptale-color-surface-hover)]',
  'hover:text-[color:var(--sniptale-color-accent)] active:translate-y-px',
].join(' ');

interface DimensionInputProps {
  label: string;
  value: number;
  min?: number;
  step?: number;
  onChange: (value: number) => void;
}

interface DimensionInputFieldProps {
  label: string;
  value: number;
  draft: string;
  commitDraft: () => void;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  applyStep: (direction: 1 | -1) => void;
}

interface DimensionStepperButtonsProps {
  label: string;
  applyStep: (direction: 1 | -1) => void;
}

const DimensionStepperButtons: React.FC<DimensionStepperButtonsProps> = ({ label, applyStep }) => (
  <div className="flex shrink-0 flex-col gap-1">
    <button
      type="button"
      className={dimensionStepperButtonClassName}
      onClick={() => applyStep(1)}
      aria-label={`${label} ${translate('editor.compact.increaseAriaSuffix')}`}
    >
      <ChevronUp size={12} strokeWidth={2.3} />
    </button>
    <button
      type="button"
      className={dimensionStepperButtonClassName}
      onClick={() => applyStep(-1)}
      aria-label={`${label} ${translate('editor.compact.decreaseAriaSuffix')}`}
    >
      <ChevronDown size={12} strokeWidth={2.3} />
    </button>
  </div>
);

const DimensionInputField: React.FC<DimensionInputFieldProps> = ({
  label,
  value,
  draft,
  commitDraft,
  setDraft,
  applyStep,
}) => (
  <label className="group block">
    <div className={dimensionInputShellClassName}>
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[12px] font-semibold uppercase text-[color:var(--sniptale-color-text-secondary)]">
          {label}
        </span>
      </div>
      <div
        className={[
          'flex items-center gap-2 rounded-[11px] px-2.5 py-1',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_88%,transparent)]',
          'shadow-[inset_0_1px_0_color-mix(in_srgb,var(--sniptale-color-border-strong)_22%,transparent)]',
        ].join(' ')}
      >
        <input
          aria-label={label}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitDraft();
            }

            if (event.key === 'Escape') {
              setDraft(String(value));
            }
          }}
          className={[
            'h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg',
            'font-semibold text-[color:var(--sniptale-color-text-primary)] outline-none',
          ].join(' ')}
        />
        <DimensionStepperButtons label={label} applyStep={applyStep} />
      </div>
    </div>
  </label>
);

export const DimensionInput: React.FC<DimensionInputProps> = ({
  label,
  value,
  min = 1,
  step = 1,
  onChange,
}) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const { commitDraft, applyStep } = createDimensionDraftActions({
    draft,
    value,
    min,
    step,
    onChange,
    setDraft,
  });

  return (
    <DimensionInputField
      label={label}
      value={value}
      draft={draft}
      commitDraft={commitDraft}
      setDraft={(nextDraft) => setDraft(nextDraft)}
      applyStep={applyStep}
    />
  );
};
