import { CompactColorOption } from '../compact-inspector-controls/primitives';

export function ColorSelectorSwatchSection(props: {
  colors: readonly string[];
  label: string;
  selectedColor: string;
  title: string;
  onSelect: (color: string) => void;
  gridClassName?: string;
  optionClassName?: string;
}) {
  if (props.colors.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="text-[12px] font-semibold uppercase text-[var(--sniptale-color-text-secondary)]">
        {props.label}
      </div>
      <div className={props.gridClassName ?? 'grid grid-cols-10 justify-items-center gap-1.5'}>
        {props.colors.map((color) => (
          <CompactColorOption
            key={color}
            title={`${props.title}: ${color}`}
            aria-label={`${props.title}: ${color}`}
            active={props.selectedColor.toLowerCase() === color.toLowerCase()}
            onClick={() => props.onSelect(color)}
            className={
              props.optionClassName ?? 'h-auto w-full max-w-6 aspect-square hover:-translate-y-px'
            }
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}
