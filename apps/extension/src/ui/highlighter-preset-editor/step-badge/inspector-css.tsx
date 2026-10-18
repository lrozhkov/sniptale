import { ProductTextarea } from '@sniptale/ui/product-form-controls';
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
    <div className="grid gap-2">
      <label
        className="text-[13px] leading-[18px] font-normal text-[var(--sniptale-color-text-secondary)]"
        htmlFor="sniptale-step-badge-custom-css"
      >
        {translate('content.stepBadge.cssLabel')}
      </label>
      <ProductTextarea
        invalid={Boolean(error)}
        title={translate('content.stepBadge.cssHint')}
        id="sniptale-step-badge-custom-css"
        aria-describedby="sniptale-step-badge-custom-css-help"
        aria-invalid={Boolean(error)}
        className="min-h-44 w-full resize-y font-mono text-[12px] leading-5"
        maxLength={4_000}
        placeholder={translate('content.stepBadge.cssPlaceholder')}
        spellCheck={false}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          setValue(nextValue);
          if (!resolveStepBadgeCustomCss(nextValue).error) updateStyle({ customCss: nextValue });
        }}
      />
      <div
        id="sniptale-step-badge-custom-css-help"
        className={
          error ? 'text-[13px] leading-[18px] text-[var(--sniptale-color-danger)]' : 'sr-only'
        }
      >
        {error ?? translate('content.stepBadge.cssHint')}
      </div>
    </div>
  );
}
