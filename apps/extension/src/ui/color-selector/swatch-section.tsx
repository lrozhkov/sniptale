const SWATCH_BUTTON_CLASS = [
  'relative grid h-6 w-full max-w-6 cursor-pointer place-items-center rounded-full',
  'bg-transparent p-[3px] hover:bg-[var(--sniptale-color-surface-hover)]',
  'focus-visible:outline-1 focus-visible:outline-offset-1',
  'focus-visible:outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

const SWATCH_RING_CLASS = [
  'sniptale-picker-checker block h-[18px] w-[18px] shrink-0 rounded-full',
].join(' ');

const ACTIVE_SWATCH_CLASS = [
  'outline-1 outline-offset-2 outline-[var(--sniptale-color-text-secondary)]',
].join(' ');

export function ColorSelectorSwatchSection(props: {
  colors: readonly string[];
  label: string;
  showLabel?: boolean;
  selectedColor: string;
  title: string;
  onSelect: (color: string) => void;
  gridClassName?: string;
  optionClassName?: string;
}) {
  if (props.colors.length === 0) return null;
  return (
    <div className="space-y-1">
      {props.showLabel === false ? null : (
        <div className="text-xs text-[var(--sniptale-color-text-secondary)]">{props.label}</div>
      )}
      <div className={props.gridClassName ?? 'grid grid-cols-10 justify-items-center gap-1'}>
        {props.colors.map((color) => (
          <button
            key={color}
            type="button"
            title={`${props.title}: ${color}`}
            aria-label={`${props.title}: ${color}`}
            aria-pressed={props.selectedColor.toLowerCase() === color.toLowerCase()}
            onClick={() => props.onSelect(color)}
            className={props.optionClassName ?? SWATCH_BUTTON_CLASS}
          >
            <span
              className={[
                SWATCH_RING_CLASS,
                props.selectedColor.toLowerCase() === color.toLowerCase()
                  ? ACTIVE_SWATCH_CLASS
                  : '',
              ].join(' ')}
            >
              <span
                className="block h-full w-full rounded-[inherit] shadow-[inset_0_0_0_1px_#7776]"
                style={{ backgroundColor: color }}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
