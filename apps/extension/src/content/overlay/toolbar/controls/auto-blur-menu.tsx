import React, { useRef } from 'react';
import { Check, Power, ScanText, Settings } from 'lucide-react';
import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import type { ToolbarAutoBlurProps } from '../types';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
  useToolbarFloatingMenuDismissal,
} from '../menu/floating.helpers';
import { getToolbarMenuPosition } from '../menu/position';
import type { ToolbarMenuState } from '../state/menu';

const TOOLBAR_SIDEBAR_RIGHT_INSET_PX = 348;

type DropdownProps = {
  autoBlur: ToolbarAutoBlurProps;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  isLoading: boolean;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  sidebarVisible: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function handleMenuClick(event: React.MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
}

function AutoBlurMenuItem(props: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  selected?: boolean;
  dataUi: string;
  onSelect: () => Promise<void> | void;
}) {
  return (
    <ProductToolbarMenuItem
      dataUi={props.dataUi}
      disabled={props.disabled ?? false}
      selected={props.selected ?? false}
      onMouseDown={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        void props.onSelect();
      }}
      onClick={handleMenuClick}
    >
      {props.icon}
      <ProductToolbarMenuItemCopy label={props.label} hint={props.hint} />
      {props.selected ? <Check className="h-4 w-4 text-[var(--sniptale-color-accent)]" /> : null}
    </ProductToolbarMenuItem>
  );
}

function resolveDropdownLayout(props: DropdownProps) {
  const placement = getToolbarMenuPosition(props.triggerRef.current, 240);
  return {
    menuPlacement: resolveToolbarMenuPlacement(props.displayMode, placement),
    menuStyle: resolveToolbarFloatingMenuStyle({
      anchorEl: props.triggerRef.current,
      displayMode: props.displayMode,
      menuHeight: 240,
      menuWidth: 300,
      placement,
      viewportRightInset: props.sidebarVisible ? TOOLBAR_SIDEBAR_RIGHT_INSET_PX : 0,
    }),
  };
}

function AutoBlurToggleItem(props: Pick<DropdownProps, 'autoBlur' | 'isLoading' | 'onClose'>) {
  const toggleDisabled =
    props.isLoading ||
    props.autoBlur.isApplying ||
    (!props.autoBlur.autoApplyAllowed && !props.autoBlur.autoApplyEnabled);

  return (
    <AutoBlurMenuItem
      dataUi="content.toolbar.auto-blur-toggle"
      disabled={toggleDisabled}
      icon={<Power className="h-4 w-4" />}
      label={translate(
        props.autoBlur.autoApplyEnabled
          ? 'content.autoBlur.autoApplyDisabled'
          : 'content.autoBlur.autoApplyEnabled'
      )}
      hint={translate(
        props.autoBlur.autoApplyAllowed
          ? 'content.autoBlur.autoApplyEnableHint'
          : 'content.autoBlur.autoApplyBlockedHint'
      )}
      selected={props.autoBlur.autoApplyEnabled}
      onSelect={async () => {
        await props.autoBlur.onToggleAutoApply();
        props.onClose();
      }}
    />
  );
}

function AutoBlurApplyOnceItem(props: Pick<DropdownProps, 'autoBlur' | 'isLoading' | 'onClose'>) {
  return (
    <AutoBlurMenuItem
      dataUi="content.toolbar.auto-blur-apply-once"
      disabled={props.isLoading || props.autoBlur.isApplying}
      icon={<ScanText className="h-4 w-4" />}
      label={translate('content.autoBlur.applyOnce')}
      hint={translate('content.autoBlur.applyOnceHint')}
      onSelect={async () => {
        await props.autoBlur.onApplyOnce();
        props.onClose();
      }}
    />
  );
}

function AutoBlurConfigureItem(props: Pick<DropdownProps, 'autoBlur' | 'isLoading' | 'onClose'>) {
  return (
    <AutoBlurMenuItem
      dataUi="content.toolbar.auto-blur-configure"
      disabled={props.isLoading}
      icon={<Settings className="h-4 w-4" />}
      label={translate('content.autoBlur.configure')}
      hint={translate('content.autoBlur.configureHint')}
      onSelect={() => {
        props.autoBlur.onOpenSettings();
        props.onClose();
      }}
    />
  );
}

function AutoBlurDropdownItems(props: Pick<DropdownProps, 'autoBlur' | 'isLoading' | 'onClose'>) {
  return (
    <>
      <AutoBlurToggleItem {...props} />
      <AutoBlurApplyOnceItem {...props} />
      <AutoBlurConfigureItem {...props} />
    </>
  );
}

function AutoBlurDropdown(props: DropdownProps) {
  const { menuPlacement, menuStyle } = resolveDropdownLayout(props);

  if (!menuStyle) return null;

  return (
    <div ref={props.menuRef as React.Ref<HTMLDivElement>} data-ui="content.toolbar.auto-blur-menu">
      <ProductToolbarMenu
        compact={props.compactMenus}
        title={translate('content.toolbar.autoBlur')}
        variant="capture"
        placement={menuPlacement}
        style={menuStyle}
      >
        <AutoBlurDropdownItems
          autoBlur={props.autoBlur}
          isLoading={props.isLoading}
          onClose={props.onClose}
        />
      </ProductToolbarMenu>
    </div>
  );
}

type AutoBlurMenuProps = {
  autoBlur: ToolbarAutoBlurProps | undefined;
  compactMenus: boolean;
  displayMode: ContentToolbarDisplayMode;
  isLoading: boolean;
  sidebarVisible: boolean;
  toolbarMenuState: ToolbarMenuState;
};

function useAutoBlurMenuBindings(props: AutoBlurMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const open = props.toolbarMenuState.activeMenuType === 'auto-blur';

  useToolbarFloatingMenuDismissal({
    menuRef,
    onClose: () => props.toolbarMenuState.closeMenu('auto-blur'),
    open,
    triggerRef,
  });

  return { menuRef, open, triggerRef };
}

function renderAutoBlurDropdown(
  props: AutoBlurMenuProps,
  bindings: ReturnType<typeof useAutoBlurMenuBindings>
) {
  if (!bindings.open || !props.autoBlur) {
    return null;
  }

  return (
    <AutoBlurDropdown
      autoBlur={props.autoBlur}
      compactMenus={props.compactMenus}
      displayMode={props.displayMode}
      isLoading={props.isLoading}
      menuRef={bindings.menuRef}
      onClose={() => props.toolbarMenuState.closeMenu('auto-blur')}
      sidebarVisible={props.sidebarVisible}
      triggerRef={bindings.triggerRef}
    />
  );
}

export function AutoBlurMenu(props: AutoBlurMenuProps) {
  const bindings = useAutoBlurMenuBindings(props);

  return (
    <div className="relative">
      <ContentToolbarButton
        ref={bindings.triggerRef}
        active={bindings.open || props.autoBlur?.autoApplyEnabled === true}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          props.toolbarMenuState.toggleMenu('auto-blur');
        }}
        disabled={props.isLoading || props.autoBlur === undefined}
        dataUi="content.toolbar.auto-blur-button"
        menuIndicator
        title={translate('content.toolbar.autoBlur')}
        aria-haspopup="menu"
        aria-expanded={bindings.open}
      >
        <ScanText size={20} strokeWidth={2} />
      </ContentToolbarButton>

      {renderAutoBlurDropdown(props, bindings)}
    </div>
  );
}
