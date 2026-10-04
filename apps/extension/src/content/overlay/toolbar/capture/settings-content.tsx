import React, { useLayoutEffect, useState } from 'react';
import { Move, Columns2, PanelBottomClose, Pin, PinOff, Rows3, X } from 'lucide-react';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import { PopoverCheckIcon } from '../../icons/icons';
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
import {
  createTrustedContentActionIntentSource,
  type ContentPrivilegedActionIntentSource,
} from '../../../application/privileged-action-intent';

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
  checked?: boolean;
}) {
  const itemProps = {
    onMouseDown: props.onSelect,
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      if (event.detail === 0 && !isBridgedMouseEvent(event.nativeEvent)) props.onSelect(event);
      else stopMenuEvent(event);
    },
    ...(props.disabled === undefined ? {} : { disabled: props.disabled }),
    ...(props.selected === undefined ? {} : { selected: props.selected }),
  };

  return (
    <ProductToolbarMenuItem {...itemProps}>
      {props.icon}
      <ProductToolbarMenuItemCopy hint={props.hint} label={props.label} />
      {props.checked ? <PopoverCheckIcon /> : null}
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
  onAction: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onClose: () => void;
}) {
  return (
    <ToolbarSettingsItem
      icon={params.icon}
      label={params.label}
      onSelect={(event) => {
        stopMenuEvent(event);
        params.onAction(event);
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
  onDisableScreenshotMode: (activationEvent?: Event) => void;
  onHide: () => void;
  onPinToTabChange: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  pinToTabLocked: boolean;
  autoBlurEnabled?: boolean;
  screenshotMode: boolean;
  showPinItem?: boolean;
  showHideItem?: boolean;
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
      {props.showPinItem !== false ? renderPinToTabItem(props) : null}
      <ProductToolbarMenuDivider />
      {props.showHideItem === false
        ? null
        : renderActionItem({
            icon: <PanelBottomClose className="sniptale-popover-icon" />,
            label: translate('content.toolbar.hideToolbar'),
            onAction: () => props.onHide(),
            onClose: props.onClose,
          })}
      {renderDisableScreenshotModeItem(props)}
    </>
  );
}

function renderPinToTabItem(props: {
  onPinToTabChange: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  pinToTabLocked: boolean;
  autoBlurEnabled?: boolean;
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
          ? translate(
              props.autoBlurEnabled
                ? 'content.toolbar.pinToTabAutoBlurLockedHint'
                : 'content.toolbar.pinToTabLockedHint'
            )
          : !props.pinToTabAvailable
            ? translate('content.toolbar.pinToTabUnavailableHint')
            : translate('content.toolbar.pinToTabHint')
      }
      disabled={props.pinToTabLocked || !props.pinToTabAvailable}
      selected={props.pinToTab || props.pinToTabLocked}
      onSelect={(event) => {
        stopMenuEvent(event);
        if (props.pinToTabLocked || !props.pinToTabAvailable) {
          return;
        }

        props.onPinToTabChange(
          !props.pinToTab,
          createTrustedContentActionIntentSource(event.nativeEvent) ?? undefined
        );
      }}
    />
  );
}

function renderDisableScreenshotModeItem(props: {
  onClose: () => void;
  onDisableScreenshotMode: (activationEvent?: Event) => void;
  screenshotMode: boolean;
}) {
  if (!props.screenshotMode) {
    return null;
  }

  return renderActionItem({
    icon: <X className="sniptale-popover-icon" />,
    label: translate('content.toolbar.screenshotDisable'),
    onAction: (event) => props.onDisableScreenshotMode(event.nativeEvent),
    onClose: props.onClose,
  });
}

function ToolbarSettingsDropdownContent(
  props: ToolbarSettingsDropdownProps & { placement: 'up' | 'down' }
) {
  const placement = props.placement;
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
      {props.onFreePlacementChange ? (
        <ToolbarSettingsItem
          icon={<Move aria-hidden className="sniptale-popover-icon" />}
          checked={props.freePlacement ?? false}
          label={translate('content.toolbar.panelFreePlacement')}
          hint={translate('content.toolbar.panelFreePlacementHint')}
          selected={props.freePlacement ?? false}
          onSelect={(event) => {
            stopMenuEvent(event);
            props.onFreePlacementChange?.(!props.freePlacement);
          }}
        />
      ) : null}
      {props.freePlacement !== false
        ? renderDisplayModeItems({
            displayMode: props.displayMode,
            onClose: props.onClose,
            onDisplayModeChange: props.onDisplayModeChange,
          })
        : null}
      {renderToolbarSettingsUtilityItems(props)}
    </ProductToolbarMenu>
  );
}

type ToolbarSettingsDropdownProps = {
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  freePlacement?: boolean;
  onFreePlacementChange?: ((value: boolean) => void) | undefined;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuStyle?: React.CSSProperties;
  onClose: () => void;
  onCompactMenusChange: (compactMenus: boolean) => void;
  onDisplayModeChange: (displayMode: ContentToolbarDisplayMode) => void;
  onDisableScreenshotMode: (activationEvent?: Event) => void;
  onHide: () => void;
  onPinToTabChange: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  pinToTabLocked: boolean;
  autoBlurEnabled?: boolean;
  screenshotMode: boolean;
  showPinItem?: boolean;
  showHideItem?: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  viewportRightInset?: number;
};

export function ToolbarSettingsDropdown(props: ToolbarSettingsDropdownProps) {
  const [menuSize, setMenuSize] = useState({ width: 280, height: 340 });
  useLayoutEffect(() => {
    const surface = props.menuRef.current?.firstElementChild;
    if (!(surface instanceof HTMLElement)) return;
    const measure = () => {
      const width = surface.offsetWidth;
      const height = surface.offsetHeight;
      if (!width || !height) return;
      setMenuSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(surface);
    return () => observer?.disconnect();
  }, [props.menuRef, props.freePlacement, props.compactMenus]);
  const placement = getToolbarMenuPosition(props.triggerRef.current, menuSize.height);
  const menuStyle = resolveToolbarFloatingMenuStyle({
    anchorEl: props.triggerRef.current,
    displayMode: props.displayMode,
    menuHeight: menuSize.height,
    menuWidth: menuSize.width,
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
      <ToolbarSettingsDropdownContent
        {...props}
        placement={placement}
        menuStyle={{ ...menuStyle, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
      />
    </div>
  );
}
