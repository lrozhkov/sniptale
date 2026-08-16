import { X } from 'lucide-react';

import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import type { FloatingPopoverDrag } from './drag';

export type SettingsPopoverContext = 'element' | 'toolbar';

export function SettingsPopoverHeader(props: {
  action?: { label: string; onClick: () => void };
  closeLabel: string;
  context: SettingsPopoverContext;
  destructiveAction?: { label: string; onClick: () => void };
  sourceAction?: { description: string; label: string; onClick: () => void };
  drag?: FloatingPopoverDrag;
  onClose: () => void;
  title: string;
}) {
  const draggable = props.context === 'element' && props.drag !== undefined;
  return (
    <div
      className="sniptale-settings-popover-header"
      data-draggable={draggable ? 'true' : undefined}
      data-dragging={props.drag?.isDragging ? 'true' : undefined}
      {...(draggable
        ? {
            onPointerDown: props.drag!.onPointerDown,
            onPointerMove: props.drag!.onPointerMove,
            onPointerUp: props.drag!.onPointerUp,
          }
        : {})}
    >
      <ProductToolbarMenuGroupLabel>
        <span>{props.title}</span>
      </ProductToolbarMenuGroupLabel>
      <div
        className="sniptale-settings-popover-header-actions"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {props.sourceAction ? (
          <button
            aria-label={props.sourceAction.description}
            className="sniptale-settings-popover-mode-action"
            onClick={props.sourceAction.onClick}
            title={props.sourceAction.description}
            type="button"
          >
            {props.sourceAction.label}
          </button>
        ) : null}
        {props.destructiveAction ? (
          <button
            className="sniptale-settings-popover-destructive-action"
            onClick={props.destructiveAction.onClick}
            title={props.destructiveAction.label}
            type="button"
          >
            {props.destructiveAction.label}
          </button>
        ) : null}
        {props.action ? (
          <button
            className="sniptale-settings-popover-mode-action"
            onClick={props.action.onClick}
            title={props.action.label}
            type="button"
          >
            {props.action.label}
          </button>
        ) : null}
        {props.context === 'element' ? (
          <button
            aria-label={props.closeLabel}
            className="sniptale-settings-popover-close"
            onClick={props.onClose}
            title={props.closeLabel}
            type="button"
          >
            <X aria-hidden="true" size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
