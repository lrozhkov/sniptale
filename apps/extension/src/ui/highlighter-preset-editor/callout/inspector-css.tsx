import { HighlighterCssTextarea } from '../fields/sections/css-textarea';
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
    <HighlighterCssTextarea
      error={error}
      hint={translate('content.callout.cssHint')}
      id="sniptale-callout-custom-css"
      label={translate('content.callout.cssLabel')}
      placeholder={translate('content.callout.cssPlaceholder')}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        if (!resolveCalloutCustomCss(nextValue).error) {
          props.onChange({ style: { customCss: nextValue } });
        }
      }}
    />
  );
}
