import { ProductTextarea, type ProductTextareaProps } from '@sniptale/ui/product-form-controls';
import { useRef } from 'react';
import { InspectorFieldClear } from '../../ui/compact-inspector-controls/text-field';

/** Gives Settings drafts the same resize and Clear behavior without owning acceptance. */
export function SettingsDraftTextarea({
  label,
  value,
  ...props
}: Omit<ProductTextareaProps, 'value' | 'defaultValue'> & { label: string; value: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="sniptale-text-value settings-draft-textarea">
      <ProductTextarea {...props} ref={field} aria-label={label} value={value} />
      {value && !props.readOnly && !props.disabled ? (
        <InspectorFieldClear label={label} target={field} />
      ) : null}
    </div>
  );
}
