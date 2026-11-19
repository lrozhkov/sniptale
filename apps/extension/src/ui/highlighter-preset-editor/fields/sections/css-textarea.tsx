import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { useRef } from 'react';
import { InspectorFieldClear } from '../../../compact-inspector-controls/text-field';

/** Edits a CSS draft while leaving validation and acceptance to the preset editor. */
export function HighlighterCssTextarea(props: {
  error: string | null;
  hint: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const labelId = props.id + '-label';
  const helpId = props.id + '-help';
  return (
    <div className="grid min-w-0 gap-1">
      <span
        className="text-[13px] leading-[18px] font-normal text-[var(--sniptale-color-text-secondary)]"
        id={labelId}
      >
        {props.label}
      </span>
      <div className="sniptale-text-value sniptale-highlighter-css-draft">
        <ProductTextarea
          ref={input}
          invalid={Boolean(props.error)}
          title={props.hint}
          id={props.id}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          aria-invalid={Boolean(props.error)}
          className="sniptale-compact-text-scroll font-mono"
          maxLength={4_000}
          placeholder={props.placeholder}
          spellCheck={false}
          value={props.value}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        {props.value ? <InspectorFieldClear label={props.label} target={input} /> : null}
      </div>
      <div
        id={helpId}
        className={
          props.error ? 'text-xs leading-4 text-[var(--sniptale-color-danger)]' : 'sr-only'
        }
      >
        {props.error ?? props.hint}
      </div>
    </div>
  );
}
