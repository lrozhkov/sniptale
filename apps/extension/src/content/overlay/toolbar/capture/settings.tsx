import React, { useRef } from 'react';
import { Settings2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import type { ToolbarMenuState } from '../state/menu';
import { ToolbarSettingsDropdown } from './settings-content';

type ToolbarSettingsMenuProps = {
  compactMenus: boolean;
  pinToTab: boolean;
  pinToTabLocked: boolean;
  sidebarVisible?: boolean;
  screenshotMode: boolean;
  displayMode: ContentToolbarDisplayMode;
  toolbarMenuState: ToolbarMenuState;
  onClose: () => void;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisableScreenshotMode: () => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onPinToTabChange: (value: boolean) => void;
};

function useToolbarSettingsMenuBindings(props: ToolbarSettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = props.toolbarMenuState.activeMenuType === 'settings';

  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: () => props.toolbarMenuState.closeMenu('settings'),
    open,
    triggerRef,
  });

  return { menuRef, open, triggerRef };
}

export function ToolbarSettingsMenu(props: ToolbarSettingsMenuProps) {
  const bindings = useToolbarSettingsMenuBindings(props);

  return (
    <div className="sniptale-settings-wrapper">
      <ContentToolbarButton
        ref={bindings.triggerRef}
        type="button"
        active={bindings.open}
        dataUi="content.toolbar.settings-button"
        menuIndicator
        title={translate('content.toolbar.settingsLabel')}
        data-menu-open={bindings.open ? 'true' : 'false'}
        onClick={(event) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu('settings');
        }}
        aria-haspopup="menu"
        aria-expanded={bindings.open}
      >
        <Settings2 size={18} strokeWidth={1.8} />
      </ContentToolbarButton>

      {renderToolbarSettingsDropdown({
        menuRef: bindings.menuRef,
        open: bindings.open,
        props,
        triggerRef: bindings.triggerRef,
      })}
    </div>
  );
}

function renderToolbarSettingsDropdown(args: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  props: ToolbarSettingsMenuProps;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}) {
  if (!args.open) {
    return null;
  }

  return (
    <ToolbarSettingsDropdown
      compactMenus={args.props.compactMenus}
      displayMode={args.props.displayMode}
      menuRef={args.menuRef}
      onClose={() => args.props.toolbarMenuState.closeMenu('settings')}
      onCompactMenusChange={args.props.onCompactMenusChange}
      onDisplayModeChange={args.props.onDisplayModeChange}
      onDisableScreenshotMode={args.props.onDisableScreenshotMode}
      onHide={args.props.onClose}
      onPinToTabChange={args.props.onPinToTabChange}
      pinToTab={args.props.pinToTab}
      pinToTabLocked={args.props.pinToTabLocked}
      screenshotMode={args.props.screenshotMode}
      triggerRef={args.triggerRef}
      viewportRightInset={args.props.sidebarVisible ? 348 : 0}
    />
  );
}
