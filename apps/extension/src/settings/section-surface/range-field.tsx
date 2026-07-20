import type { ReactNode } from 'react';

import { ProductRange, type ProductRangeProps } from '@sniptale/ui/product-form-controls';
import { settingsMetaLabelClassName } from './classes';

type SettingsRangeFieldProps = ProductRangeProps & {
  aside?: ReactNode;
  className?: string;
  displaySuffix?: ReactNode;
  displayValue: ReactNode;
  hint?: ReactNode;
  label: ReactNode;
  rangeClassName?: string;
};

export function SettingsRangeField({
  aside,
  className = '',
  displaySuffix,
  displayValue,
  hint,
  label,
  rangeClassName = '',
  ...props
}: SettingsRangeFieldProps) {
  return (
    <div className={['space-y-3', className].filter(Boolean).join(' ')}>
      <div className="flex items-end justify-between gap-4">
        <label className={[settingsMetaLabelClassName, 'mb-0 block'].join(' ')}>{label}</label>
        <div className="flex items-end gap-3">
          {aside ? <div className="flex-shrink-0">{aside}</div> : null}
          <div className="flex min-w-[64px] items-baseline justify-end gap-1 text-right">
            <span
              className={
                'text-[1.45rem] font-semibold tracking-[-0.03em] ' +
                'text-[var(--sniptale-color-text-primary-strong)]'
              }
            >
              {displayValue}
            </span>
            {displaySuffix ? (
              <span className="text-sm font-medium text-[var(--sniptale-color-text-dim)]">
                {displaySuffix}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ProductRange {...props} className={['w-full', rangeClassName].filter(Boolean).join(' ')} />
      {hint ? (
        <p className="text-xs leading-5 text-[var(--sniptale-color-text-dim)]">{hint}</p>
      ) : null}
    </div>
  );
}
