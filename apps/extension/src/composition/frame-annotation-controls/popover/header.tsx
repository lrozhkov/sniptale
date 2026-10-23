import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, Trash2, X } from 'lucide-react';

import { ProductToolbarMenuGroupLabel } from '@sniptale/ui/product-menus/toolbar';
import type { FloatingPopoverDrag } from './drag';
import type { TemplateSourceHeaderControl } from './template-source';

export type SettingsPopoverContext = 'element' | 'toolbar';

export function SettingsPopoverHeader(props: {
  action?: { label: string; onClick: () => void };
  closeLabel: string;
  context: SettingsPopoverContext;
  destructiveAction?: { label: string; onClick: () => void };
  sourceControl?: TemplateSourceHeaderControl;
  drag?: FloatingPopoverDrag;
  onClose: () => void;
  title: string;
}) {
  const draggable = props.context === 'element' && props.drag !== undefined;
  const sourceControl = props.sourceControl;
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
      <div className="sniptale-settings-popover-heading">
        {props.action ? (
          <ContentToolbarButton
            tone="utility"
            size="compact"
            className="sniptale-settings-popover-icon-action sniptale-settings-popover-mode-action"
            data-settings-action="back-to-templates"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={props.action.onClick}
            title={props.action.label}
          >
            <ArrowLeft aria-hidden="true" size={16} />
          </ContentToolbarButton>
        ) : null}
        <ProductToolbarMenuGroupLabel>
          <span>{props.title}</span>
        </ProductToolbarMenuGroupLabel>
      </div>
      <div
        className="sniptale-settings-popover-header-actions"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {sourceControl ? (
          <div
            role="group"
            aria-label={props.title}
            className="sniptale-settings-popover-source-switch"
            data-ui="shared.annotation-template-source"
          >
            {sourceControl.options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={sourceControl.value === option.value}
                className="sniptale-settings-popover-source-option"
                onClick={() => {
                  if (sourceControl.value !== option.value) {
                    sourceControl.onChange(option.value);
                  }
                }}
                title={option.description}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
        {props.destructiveAction ? (
          <ContentToolbarButton
            tone="utility"
            size="compact"
            className="sniptale-settings-popover-icon-action sniptale-settings-popover-destructive-action"
            data-settings-action="disable"
            onClick={props.destructiveAction.onClick}
            title={props.destructiveAction.label}
            type="button"
          >
            <Trash2 aria-hidden="true" size={16} />
          </ContentToolbarButton>
        ) : null}
        {props.context === 'element' ? (
          <ContentToolbarButton
            tone="utility"
            size="compact"
            aria-label={props.closeLabel}
            className="sniptale-dismiss-button sniptale-settings-popover-icon-action sniptale-settings-popover-close"
            data-settings-action="close"
            onClick={props.onClose}
            title={props.closeLabel}
            type="button"
          >
            <X aria-hidden="true" size={16} />
          </ContentToolbarButton>
        ) : null}
      </div>
    </div>
  );
}
