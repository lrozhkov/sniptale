import type { RefObject } from 'react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { translate } from '../../../../platform/i18n';
import { InspectorFieldClear } from '../../../../ui/compact-inspector-controls/text-field';

/** Resource editors retain their own name draft, input ref, and save authority. */
export function ResourcePresetNameField(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  disabled: boolean;
  onChange: (name: string) => void;
}) {
  const label = translate('settings.editor.presetName');
  return (
    <label
      className={[
        'grid gap-1 text-[13px] leading-[18px] font-medium',
        'text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      {label}
      <div className="sniptale-text-value">
        <ProductInput
          ref={props.inputRef}
          aria-label={label}
          disabled={props.disabled}
          maxLength={80}
          onChange={(event) => props.onChange(event.target.value)}
          value={props.value}
        />
        {!props.disabled && props.value.length > 0 ? (
          <InspectorFieldClear label={label} target={props.inputRef} />
        ) : null}
      </div>
    </label>
  );
}
