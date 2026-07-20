import { useDimensionDraftState } from './state';

const fieldShellClassName = [
  'flex min-h-10 min-w-0 items-center gap-2 rounded-[10px] border',
  'border-[color:var(--sniptale-color-border-soft)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_88%,transparent)] px-2.5',
  'text-sm font-semibold text-[color:var(--sniptale-color-text-primary)] transition',
  'focus-within:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus-within:shadow-[0_0_0_1px_color-mix(in_srgb,var(--sniptale-color-accent)_12%,transparent)]',
].join(' ');

interface SizeControlInputProps {
  dataUi?: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}

/**
 * Renders the inline numeric dimension field used by editor-owned size surfaces.
 */
export function SizeControlInput(props: SizeControlInputProps) {
  const { commitDraft, draft, handleKeyDown, setDraft } = useDimensionDraftState(
    props.value,
    props.onChange
  );

  return (
    <div className={fieldShellClassName}>
      <input
        aria-label={props.label}
        className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-center outline-none"
        data-ui={props.dataUi}
        inputMode="numeric"
        type="text"
        value={draft}
        onBlur={commitDraft}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
