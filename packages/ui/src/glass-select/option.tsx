import { Check } from 'lucide-react';
import { getGlassSelectCheckClassName, getGlassSelectMenuClassName } from './styles';
import type { GlassSelectOption } from './types';

interface GlassSelectOptionButtonProps<T extends string = string> {
  option: GlassSelectOption<T>;
  value: T | '';
  index: number;
  totalOptions: number;
  size: 'sm' | 'md';
  isPopupFlat: boolean;
  onSelect: (option: GlassSelectOption<T>) => void;
}

export function GlassSelectOptionButton<T extends string = string>({
  option,
  value,
  index,
  totalOptions,
  size,
  isPopupFlat,
  onSelect,
}: GlassSelectOptionButtonProps<T>) {
  const isFirst = index === 0;
  const isLast = index === totalOptions - 1;
  const isSelected = option.value === value;
  const isDisabled = option.disabled ?? false;

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      disabled={isDisabled}
      onClick={() => onSelect(option)}
      className={getGlassSelectMenuClassName({
        isPopupFlat,
        isSelected,
        isDisabled,
        isFirst,
        isLast,
        size,
      })}
    >
      <div className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2 truncate">
          {option.icon}
          {option.label}
        </span>
        {option.description ? (
          <span className="mt-0.5 truncate text-xs text-[var(--sniptale-color-text-dim)]">
            {option.description}
          </span>
        ) : null}
      </div>
      {isSelected ? <Check className={getGlassSelectCheckClassName(isPopupFlat)} /> : null}
    </button>
  );
}
