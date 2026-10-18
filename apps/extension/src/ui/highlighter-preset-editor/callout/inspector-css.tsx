import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { useEffect, useMemo, useState } from 'react';
import { resolveCalloutCustomCss } from '../../../features/highlighter/callout-custom-css';
import { translate } from '../../../platform/i18n';
import type { ManualContentProps } from './inspector-fields';

function getValidationMessage(
  validation: ReturnType<typeof resolveCalloutCustomCss>
): string | null {
  if (validation.error === 'blocked') {
    return `${translate('content.callout.cssBlockedProperties')} ${validation.blockedProperties.join(', ')}`;
  }
  if (validation.error === 'unsafe') return translate('content.callout.cssUnsafeError');
  if (validation.error === 'syntax') return translate('content.callout.cssSyntaxError');
  return null;
}

export function CalloutCssSettings(props: ManualContentProps) {
  const storedValue = props.settings.style.customCss;
  const [value, setValue] = useState(storedValue);
  useEffect(() => setValue(storedValue), [storedValue]);
  const validation = useMemo(() => resolveCalloutCustomCss(value), [value]);
  const error = getValidationMessage(validation);
  return (
    <div className="grid gap-2">
      <label
        className="text-[13px] leading-[18px] font-normal text-[var(--sniptale-color-text-secondary)]"
        htmlFor="sniptale-callout-custom-css"
      >
        {translate('content.callout.cssLabel')}
      </label>
      <ProductTextarea
        invalid={Boolean(error)}
        title={translate('content.callout.cssHint')}
        id="sniptale-callout-custom-css"
        aria-describedby="sniptale-callout-custom-css-help"
        aria-invalid={Boolean(error)}
        className="min-h-44 w-full resize-y font-mono text-[12px] leading-5"
        maxLength={4_000}
        placeholder={translate('content.callout.cssPlaceholder')}
        spellCheck={false}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (!resolveCalloutCustomCss(nextValue).error) {
            props.onChange({ style: { customCss: nextValue } });
          }
        }}
      />
      <div
        id="sniptale-callout-custom-css-help"
        className={
          error ? 'text-[13px] leading-[18px] text-[var(--sniptale-color-danger)]' : 'sr-only'
        }
      >
        {error ?? translate('content.callout.cssHint')}
      </div>
    </div>
  );
}
