import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { getGlassSelectChevronClassName } from './styles';

interface GlassSelectTriggerProps {
  disabled: boolean;
  isOpen: boolean;
  triggerClassName: string;
  selectedOption?: {
    icon?: ReactNode;
    label: string;
  };
  placeholder: string;
  onToggle: () => void;
}

export function GlassSelectTrigger({
  disabled,
  isOpen,
  triggerClassName,
  selectedOption,
  placeholder,
  onToggle,
}: GlassSelectTriggerProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={triggerClassName}
      aria-expanded={isOpen}
      aria-haspopup="listbox"
    >
      <span
        className={
          selectedOption
            ? 'text-[var(--sniptale-color-text-primary)]'
            : 'text-[var(--sniptale-color-text-dim)]'
        }
      >
        {selectedOption ? (
          <span className="flex items-center gap-2">
            {selectedOption.icon}
            {selectedOption.label}
          </span>
        ) : (
          placeholder
        )}
      </span>
      <ChevronDown className={getGlassSelectChevronClassName(isOpen)} />
    </button>
  );
}
