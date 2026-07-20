import { Check } from 'lucide-react';
import type { KeyboardEventHandler, ReactNode, Ref } from 'react';

export function ProductSelectMenuOption(props: {
  className: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  id?: string;
  isSelected: boolean;
  label: string;
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>;
  onMouseEnter?: () => void;
  optionRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      id={props.id}
      role="option"
      aria-selected={props.isSelected}
      disabled={props.disabled}
      className={props.className}
      ref={props.optionRef}
      onKeyDown={props.onKeyDown}
      onMouseEnter={props.onMouseEnter}
      onClick={props.onSelect}
    >
      <span className="sniptale-select-option-copy">
        <span className="sniptale-select-value">
          {props.icon ? <span className="sniptale-select-value-icon">{props.icon}</span> : null}
          <span className="sniptale-select-value-label sniptale-select-value-label-menu">
            {props.label}
          </span>
        </span>
        {props.description ? (
          <span className="sniptale-select-option-description">{props.description}</span>
        ) : null}
      </span>
      {props.isSelected ? (
        <Check className="sniptale-select-option-check" aria-hidden="true" />
      ) : null}
    </button>
  );
}
