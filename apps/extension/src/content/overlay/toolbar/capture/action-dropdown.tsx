import { CommandPressScope } from '@sniptale/ui/control-language/press';
import React from 'react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import {
  createToolbarMenuItemClickHandler,
  preventToolbarMenuClick,
  resolveToolbarDropdownState,
  ToolbarMenuDropdown,
} from '../menu/dropdown';
import { renderMenuCheck } from './options';
import { useCaptureMenuDigits } from './menu-effects';

type CaptureActionDropdownProps = {
  captureDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  captureButtonRef: React.RefObject<HTMLButtonElement | null>;
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  getMenuPosition: (
    buttonRef: React.RefObject<HTMLButtonElement | null>,
    menuHeight?: number
  ) => 'up' | 'down';
  captureAction: string;
  captureActionOptions: Array<{
    value: string;
    label: string;
    hint: string;
    icon: React.ReactNode;
  }>;
  onSelect: (value: string) => void;
  viewportRightInset?: number;
};

function CaptureActionDropdownItems(props: {
  captureAction: string;
  captureActionOptions: CaptureActionDropdownProps['captureActionOptions'];
  onSelect: (value: string) => void;
}) {
  return props.captureActionOptions.map((option, index) => {
    const isSelected = props.captureAction === option.value;

    return (
      <ProductToolbarMenuItem
        key={option.value}
        dataUi={`content.toolbar.capture-action-option.${option.value}`}
        onMouseDown={preventToolbarMenuClick}
        onClick={createToolbarMenuItemClickHandler(() => props.onSelect(option.value))}
        selected={isSelected}
      >
        {option.icon}
        <ProductToolbarMenuItemCopy label={option.label} hint={option.hint} />
        {index < 10 ? (
          <kbd className="sniptale-toolbar-menu-shortcut">{index === 9 ? '0' : index + 1}</kbd>
        ) : null}
        <span className="sniptale-popover-check">{isSelected && renderMenuCheck()}</span>
      </ProductToolbarMenuItem>
    );
  });
}

export function resolveCaptureActionMenuLayout(
  props: Pick<
    CaptureActionDropdownProps,
    'captureButtonRef' | 'displayMode' | 'getMenuPosition' | 'viewportRightInset'
  >,
  menuHeight = 340
) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.captureButtonRef,
    displayMode: props.displayMode,
    getMenuPosition: props.getMenuPosition,
    menuHeight,
    menuWidth: 280,
    ...(props.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: props.viewportRightInset }),
  });

  return { placement: menuPlacement, style };
}

export function CaptureActionDropdown(props: CaptureActionDropdownProps) {
  const adopted = React.useContext(CommandPressScope);
  useCaptureMenuDigits({
    menuRef: props.captureDropdownMenuRef,
    triggerRef: props.captureButtonRef,
    optionCount: props.captureActionOptions.length,
    onSelect: (index) => {
      const option = props.captureActionOptions[index];
      if (!option) return;
      props.onSelect(option.value);
    },
  });
  const [menuHeight, setMenuHeight] = React.useState(340);
  React.useLayoutEffect(() => {
    const surface = props.captureDropdownMenuRef.current?.firstElementChild;
    if (!(surface instanceof HTMLElement)) return;
    const measure = () => {
      if (surface.offsetHeight) setMenuHeight(surface.offsetHeight);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(surface);
    return () => observer?.disconnect();
  }, [props.captureDropdownMenuRef, props.compactMenus]);
  const { placement: menuPlacement, style } = resolveCaptureActionMenuLayout(props, menuHeight);

  if (!style) {
    return null;
  }

  return (
    <ToolbarMenuDropdown
      dataUi="content.toolbar.capture-action-menu"
      menuRef={props.captureDropdownMenuRef}
    >
      <ProductToolbarMenu
        className={adopted ? 'sniptale-content-menu-adopted' : ''}
        compact={props.compactMenus}
        title={translate('content.toolbar.afterCaptureTitle')}
        variant="capture"
        placement={menuPlacement}
        style={{ ...style, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
      >
        <CaptureActionDropdownItems
          captureAction={props.captureAction}
          captureActionOptions={props.captureActionOptions}
          onSelect={props.onSelect}
        />
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}
