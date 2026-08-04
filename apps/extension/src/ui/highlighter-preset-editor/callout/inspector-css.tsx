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
        className="text-[11px] font-semibold text-[var(--sniptale-color-text-secondary)]"
        htmlFor="sniptale-callout-custom-css"
      >
        {translate('content.callout.cssLabel')}
      </label>
      <textarea
        id="sniptale-callout-custom-css"
        aria-describedby="sniptale-callout-custom-css-help"
        aria-invalid={Boolean(error)}
        className={[
          'min-h-44 w-full resize-y rounded-[8px] border bg-[var(--sniptale-color-surface-input)]',
          'px-2.5 py-2 font-mono text-[11px] leading-5 text-[var(--sniptale-color-text-primary)]',
          'outline-none focus:border-[var(--sniptale-color-accent)]',
          error
            ? 'border-[var(--sniptale-color-danger)]'
            : 'border-[var(--sniptale-color-border-soft)]',
        ].join(' ')}
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
          error
            ? 'text-[10px] leading-4 text-[var(--sniptale-color-danger)]'
            : 'text-[10px] leading-4 text-[var(--sniptale-color-text-dim)]'
        }
      >
        {error ?? translate('content.callout.cssHint')}
      </div>
    </div>
  );
}
