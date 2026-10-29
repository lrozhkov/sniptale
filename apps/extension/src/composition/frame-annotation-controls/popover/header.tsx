import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ArrowLeft, Link2, Unlink2, Trash2, X } from 'lucide-react';

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
  const currentSource = sourceControl?.options.find(
    (option) => option.value === sourceControl.value
  );
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
            <ContentToolbarButton
              tone="utility"
              size="compact"
              className="sniptale-settings-popover-icon-action sniptale-settings-popover-source-toggle"
              data-settings-action="toggle-template-source"
              aria-pressed={sourceControl.value === 'frame-default'}
              aria-label={currentSource?.description}
              title={currentSource?.description}
              onClick={() =>
                sourceControl.onChange(
                  sourceControl.value === 'frame-default' ? 'forced' : 'frame-default'
                )
              }
            >
              {sourceControl.value === 'frame-default' ? (
                <Link2 aria-hidden="true" size={16} />
              ) : (
                <Unlink2 aria-hidden="true" size={16} />
              )}
            </ContentToolbarButton>
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
