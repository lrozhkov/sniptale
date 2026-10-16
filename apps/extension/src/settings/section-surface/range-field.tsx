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
    <div className={['settings-range-field', className].filter(Boolean).join(' ')}>
      <div className="settings-range-heading">
        <label className={[settingsMetaLabelClassName, 'mb-0 block'].join(' ')}>{label}</label>
        <div className="flex items-end gap-3">
          {aside ? <div className="flex-shrink-0">{aside}</div> : null}
          <div className="settings-range-value">
            <span
              className={
                'text-[13px] leading-[18px] font-medium ' +
                'text-[var(--sniptale-color-text-primary-strong)]'
              }
            >
              {displayValue}
            </span>
            {displaySuffix ? (
              <span className="text-[13px] font-medium text-[var(--sniptale-color-text-secondary)]">
                {displaySuffix}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ProductRange {...props} className={['w-full', rangeClassName].filter(Boolean).join(' ')} />
      {hint ? (
        <p className="text-xs leading-4 text-[var(--sniptale-color-text-dim)]">{hint}</p>
      ) : null}
    </div>
  );
}
