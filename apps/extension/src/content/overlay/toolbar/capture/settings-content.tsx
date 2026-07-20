import React from 'react';
import { Columns2, EyeOff, Pin, PinOff, Rows3, X } from 'lucide-react';
import { translate } from '../../../../platform/i18n';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';

function stopMenuEvent(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function CompactModeIcon() {
  return (
    <svg className="sniptale-popover-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M4 7h16" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h10" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h16" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ToolbarSettingsItem(props: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  selected?: boolean;
}) {
  const itemProps = {
    onMouseDown: props.onSelect,
    onClick: stopMenuEvent,
    ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
    ...(props.selected === undefined ? {} : { selected: props.selected }),
  };

  return (
    <ProductToolbarMenuItem {...itemProps}>
      {props.icon}
      <ProductToolbarMenuItemCopy hint={props.hint} label={props.label} />
    </ProductToolbarMenuItem>
  );
}

function renderDisplayModeItem(params: {
  displayMode: ContentToolbarDisplayMode;
  nextDisplayMode: ContentToolbarDisplayMode;
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClose: () => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
}) {
  return (
    <ToolbarSettingsItem
      icon={params.icon}
      label={params.label}
      hint={params.hint}
      selected={params.displayMode === params.nextDisplayMode}
      onSelect={(event) => {
        stopMenuEvent(event);
        params.onDisplayModeChange(params.nextDisplayMode);
        params.onClose();
      }}
    />
  );
}

function renderActionItem(params: {
  icon: React.ReactNode;
  label: string;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <ToolbarSettingsItem
      icon={params.icon}
      label={params.label}
      onSelect={(event) => {
        stopMenuEvent(event);
        params.onAction();
        params.onClose();
      }}
    />
  );
}

function renderDisplayModeItems(props: {
  displayMode: ContentToolbarDisplayMode;
  onClose: () => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
}) {
  return (
    <>
      {renderDisplayModeItem({
        displayMode: props.displayMode,
        nextDisplayMode: 'horizontal',
        icon: <Columns2 className="sniptale-popover-icon" />,
        label: translate('content.toolbar.panelHorizontal'),
        hint: translate('content.toolbar.panelHorizontalHint'),
        onClose: props.onClose,
        onDisplayModeChange: props.onDisplayModeChange,
      })}
      {renderDisplayModeItem({
        displayMode: props.displayMode,
        nextDisplayMode: 'vertical',
        icon: <Rows3 className="sniptale-popover-icon" />,
        label: translate('content.toolbar.panelVertical'),
        hint: translate('content.toolbar.panelVerticalHint'),
        onClose: props.onClose,
        onDisplayModeChange: props.onDisplayModeChange,
      })}
    </>
  );
}

function renderToolbarSettingsUtilityItems(props: {
  compactMenus: boolean;
  onClose: () => void;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisableScreenshotMode: () => void;
  onHide: () => void;
  onPinToTabChange: (value: boolean) => void;
  pinToTab: boolean;
  pinToTabLocked: boolean;
  screenshotMode: boolean;
}) {
  return (
    <>
      <ProductToolbarMenuDivider />
      <ToolbarSettingsItem
        icon={<CompactModeIcon />}
        label={translate('content.toolbar.compactMenus')}
        hint={translate('content.toolbar.compactMenusHint')}
        selected={props.compactMenus}
        onSelect={(event) => {
          stopMenuEvent(event);
          props.onCompactMenusChange(!props.compactMenus);
        }}
      />
      {renderPinToTabItem(props)}
      <ProductToolbarMenuDivider />
      {renderActionItem({
        icon: <EyeOff className="sniptale-popover-icon" />,
        label: translate('content.toolbar.hideToolbar'),
        onAction: props.onHide,
        onClose: props.onClose,
      })}
      {renderDisableScreenshotModeItem(props)}
    </>
  );
}

function renderPinToTabItem(props: {
  onPinToTabChange: (value: boolean) => void;
  pinToTab: boolean;
  pinToTabLocked: boolean;
}) {
  return (
    <ToolbarSettingsItem
      icon={
        props.pinToTab || props.pinToTabLocked ? (
          <Pin className="sniptale-popover-icon" />
        ) : (
          <PinOff className="sniptale-popover-icon" />
        )
      }
      label={translate('content.toolbar.pinToTab')}
      hint={
        props.pinToTabLocked
          ? translate('content.toolbar.pinToTabLockedHint')
          : translate('content.toolbar.pinToTabHint')
      }
      disabled={props.pinToTabLocked}
      selected={props.pinToTab || props.pinToTabLocked}
      onSelect={(event) => {
        stopMenuEvent(event);
        if (props.pinToTabLocked) {
          return;
        }

        props.onPinToTabChange(!props.pinToTab);
      }}
    />
  );
}

function renderDisableScreenshotModeItem(props: {
  onClose: () => void;
  onDisableScreenshotMode: () => void;
  screenshotMode: boolean;
}) {
  if (!props.screenshotMode) {
    return null;
  }

  return renderActionItem({
    icon: <X className="sniptale-popover-icon" />,
    label: translate('content.toolbar.screenshotDisable'),
    onAction: props.onDisableScreenshotMode,
    onClose: props.onClose,
  });
}

function ToolbarSettingsDropdownContent(props: ToolbarSettingsDropdownProps) {
  const placement = getToolbarMenuPosition(props.triggerRef.current, 340);
  const menuPlacement = resolveToolbarMenuPlacement(props.displayMode, placement);
  const menuProps = {
    compact: props.compactMenus,
    title: translate('content.toolbar.settingsMenuTitle'),
    variant: 'capture' as const,
    placement: menuPlacement,
    ...(props.menuStyle === undefined ? {} : { style: props.menuStyle }),
  };

  return (
    <ProductToolbarMenu {...menuProps}>
      {renderDisplayModeItems({
        displayMode: props.displayMode,
        onClose: props.onClose,
        onDisplayModeChange: props.onDisplayModeChange,
      })}
      {renderToolbarSettingsUtilityItems(props)}
    </ProductToolbarMenu>
  );
}

type ToolbarSettingsDropdownProps = {
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuStyle?: React.CSSProperties;
  onClose: () => void;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onDisableScreenshotMode: () => void;
  onHide: () => void;
  onPinToTabChange: (value: boolean) => void;
  pinToTab: boolean;
  pinToTabLocked: boolean;
  screenshotMode: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  viewportRightInset?: number;
};

export function ToolbarSettingsDropdown(props: ToolbarSettingsDropdownProps) {
  const placement = getToolbarMenuPosition(props.triggerRef.current, 340);
  const menuStyle = resolveToolbarFloatingMenuStyle({
    anchorEl: props.triggerRef.current,
    displayMode: props.displayMode,
    menuHeight: 340,
    menuWidth: 280,
    placement,
    preferredAlign: 'end',
    ...(props.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: props.viewportRightInset }),
  });
  if (!menuStyle) {
    return null;
  }

  return (
    <div ref={props.menuRef as React.Ref<HTMLDivElement>}>
      <ToolbarSettingsDropdownContent {...props} menuStyle={menuStyle} />
    </div>
  );
}
