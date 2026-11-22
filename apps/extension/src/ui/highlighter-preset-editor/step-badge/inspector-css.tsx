import { HighlighterCssTextarea } from '../fields/sections/css-textarea';
import { useEffect, useMemo, useState } from 'react';
import type {
  StepBadgeSettings,
  StepBadgeVisualStyle,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import { resolveStepBadgeCustomCss } from '../../../features/highlighter/step-badge-custom-css';
import { getEffectiveStepBadgeVisualStyle } from '../../../features/highlighter/step-badge-presets/style';
import { translate } from '../../../platform/i18n';

function getValidationMessage(validation: ReturnType<typeof resolveStepBadgeCustomCss>) {
  if (validation.error === 'blocked') {
    return `${translate('content.stepBadge.cssBlockedProperties')} ${validation.blockedProperties.join(', ')}`;
  }
  if (validation.error === 'unsafe') return translate('content.stepBadge.cssUnsafeError');
  if (validation.error === 'syntax') return translate('content.stepBadge.cssSyntaxError');
  return null;
}

export function StepBadgeCssSection(props: {
  onChange: (patch: Partial<StepBadgeSettings>) => void;
  settings: StepBadgeSettings;
}) {
  const style = getEffectiveStepBadgeVisualStyle(props.settings);
  const storedValue = style.customCss ?? '';
  const [value, setValue] = useState(storedValue);
  useEffect(() => setValue(storedValue), [storedValue]);
  const validation = useMemo(() => resolveStepBadgeCustomCss(value), [value]);
  const error = getValidationMessage(validation);
  const updateStyle = (patch: Partial<StepBadgeVisualStyle>) =>
    props.onChange({ style: { ...style, ...patch } });

  return (
    <HighlighterCssTextarea
      error={error}
      hint={translate('content.stepBadge.cssHint')}
      id="sniptale-step-badge-custom-css"
      label={translate('content.stepBadge.cssLabel')}
      placeholder={translate('content.stepBadge.cssPlaceholder')}
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        if (!resolveStepBadgeCustomCss(nextValue).error) updateStyle({ customCss: nextValue });
      }}
    />
  );
}
