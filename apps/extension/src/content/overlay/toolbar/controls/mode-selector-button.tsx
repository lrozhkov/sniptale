import type React from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';

export function ModeSelectorButton(props: {
  children: React.ReactNode;
  label: string;
  menuIndicator?: boolean;
  onToggle: () => void;
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <ContentToolbarButton
      ref={props.triggerRef}
      type="button"
      active
      className="sniptale-mode-selector-btn"
      dataUi="content.toolbar.mode-selector-button"
      menuIndicator={props.menuIndicator ?? false}
      title={props.label}
      data-menu-open={props.open ? 'true' : 'false'}
      onClick={(event) => {
        event.stopPropagation();
        props.onToggle();
      }}
      aria-haspopup="menu"
      aria-expanded={props.open}
    >
      {props.children}
    </ContentToolbarButton>
  );
}
