import type React from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

export function ModeSelectorButton(props: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  title?: string;
  menuIndicator?: boolean;
  onToggle: () => void;
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ContentToolbarButton
      tone="property"
      ref={props.triggerRef}
      type="button"
      className="sniptale-mode-selector-btn"
      dataUi="content.toolbar.mode-selector-button"
      disabled={props.disabled ?? false}
      menuIndicator={props.menuIndicator ?? false}
      title={props.title ?? props.label}
      data-menu-open={props.open ? 'true' : 'false'}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle();
      }}
      aria-label={props.label}
      aria-keyshortcuts="1 2 3 4 5 6"
      aria-haspopup="menu"
      aria-expanded={props.open}
    >
      {props.children}
      <span className="sniptale-mode-selector-label">{props.label}</span>
    </ContentToolbarButton>
  );
}
