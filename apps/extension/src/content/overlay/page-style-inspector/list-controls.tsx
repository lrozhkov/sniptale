import { Search } from 'lucide-react';
import { CompactInput } from '../../../ui/compact-inspector-controls';

export function InspectorEmptyList(props: { copy: string }) {
  return (
    <div
      className={[
        'rounded-[10px] border border-[color:var(--sniptale-color-border-soft)] p-3',
        'text-xs text-[var(--sniptale-color-text-secondary)]',
      ].join(' ')}
    >
      {props.copy}
    </div>
  );
}

export function InspectorSearchInput(props: {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="relative">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sniptale-color-text-dim)]"
      />
      <CompactInput
        aria-label={props.placeholder}
        className="pl-9"
        style={{ paddingLeft: 36 }}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    </label>
  );
}
