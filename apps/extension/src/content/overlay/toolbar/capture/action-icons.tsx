import type { MouseEvent, ReactNode } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import type { CaptureActionType } from '../../../../contracts/settings';

type CaptureActionOption<T extends string = CaptureActionType> = {
  value: T;
  label: string;
  hint: string;
  icon: ReactNode;
};

export function CaptureActionIcons<T extends string>(props: {
  label: string;
  options: readonly CaptureActionOption<T>[];
  selected?: string;
  disabled?: boolean;
  dataUiPrefix: string;
  onSelect: (action: T, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="sniptale-capture-action-icons" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <ProductActionButton
          key={option.value}
          tone={props.selected === undefined ? 'secondary' : 'toggle'}
          compact
          active={props.selected === option.value}
          aria-pressed={props.selected === undefined ? undefined : props.selected === option.value}
          aria-label={option.label}
          title={option.label}
          disabled={props.disabled}
          data-ui={`${props.dataUiPrefix}.${option.value}`}
          data-sniptale-activation-bridge="defer"
          className="sniptale-capture-action-icon"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onSelect(option.value, event);
          }}
        >
          {option.icon}
        </ProductActionButton>
      ))}
    </div>
  );
}
