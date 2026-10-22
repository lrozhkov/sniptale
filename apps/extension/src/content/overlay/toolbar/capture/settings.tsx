import React, { useContext, useRef } from 'react';
import { PageToolbarControlsContext } from '../state/page-controls';
import { Settings2 } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { useToolbarFloatingMenuDismissal } from '../menu/floating.helpers';
import type { ToolbarMenuState } from '../state/menu';
import { ToolbarSettingsDropdown, useToolbarSettingsDropdownLayout } from './settings-content';
import { useToolbarMenuDirection } from '../menu/direction';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';

type ToolbarSettingsMenuProps = {
  compactMenus: boolean;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  pinToTabLocked: boolean;
  autoBlurEnabled?: boolean;
  sidebarVisible?: boolean;
  screenshotMode: boolean;
  showPinItem?: boolean;
  showHideItem?: boolean;
  displayMode: ContentToolbarDisplayMode;
  freePlacement?: boolean;
  onFreePlacementChange?: ((value: boolean) => void) | undefined;
  toolbarMenuState: ToolbarMenuState;
  onClose: (restoreFocus?: boolean) => void;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisableScreenshotMode: (activationEvent?: Event) => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onPinToTabChange: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
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
  const visibility = useContext(PageToolbarControlsContext);
  const bindings = useToolbarSettingsMenuBindings(props);
  const resolveLayout = useToolbarSettingsDropdownLayout({
    ...bindings,
    displayMode: props.displayMode,
    freePlacement: props.freePlacement ?? true,
    compactMenus: props.compactMenus,
    viewportRightInset: props.sidebarVisible ? 348 : 0,
  });
  const menuSide = useToolbarMenuDirection(resolveLayout);

  return (
    <div className="sniptale-settings-wrapper">
      <ContentToolbarButton
        ref={bindings.triggerRef}
        type="button"
        tone="property"
        dataUi="content.toolbar.settings-button"
        disabled={visibility?.editing}
        menuIndicator
        data-menu-side={menuSide}
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
        layout: resolveLayout(),
      })}
    </div>
  );
}

function renderToolbarSettingsDropdown(args: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  props: ToolbarSettingsMenuProps;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  layout: ReturnType<ReturnType<typeof useToolbarSettingsDropdownLayout>>;
}) {
  if (!args.open) {
    return null;
  }

  return (
    <ToolbarSettingsDropdown
      layout={args.layout}
      compactMenus={args.props.compactMenus}
      displayMode={args.props.displayMode}
      menuRef={args.menuRef}
      onClose={() => args.props.toolbarMenuState.closeMenu('settings')}
      onCompactMenusChange={args.props.onCompactMenusChange}
      onDisplayModeChange={args.props.onDisplayModeChange}
      freePlacement={args.props.freePlacement ?? true}
      onFreePlacementChange={args.props.onFreePlacementChange}
      onDisableScreenshotMode={args.props.onDisableScreenshotMode}
      onHide={args.props.onClose}
      onPinToTabChange={args.props.onPinToTabChange}
      pinToTab={args.props.pinToTab}
      pinToTabAvailable={args.props.pinToTabAvailable}
      pinToTabLocked={args.props.pinToTabLocked}
      autoBlurEnabled={args.props.autoBlurEnabled ?? false}
      screenshotMode={args.props.screenshotMode}
      {...(args.props.showPinItem === undefined ? {} : { showPinItem: args.props.showPinItem })}
      {...(args.props.showHideItem === undefined ? {} : { showHideItem: args.props.showHideItem })}
      triggerRef={args.triggerRef}
      viewportRightInset={args.props.sidebarVisible ? 348 : 0}
    />
  );
}
