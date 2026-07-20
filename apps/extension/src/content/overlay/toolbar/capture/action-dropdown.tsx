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
} from './dropdown.shared';
import { renderMenuCheck } from './options';

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
  return props.captureActionOptions.map((option) => {
    const isSelected = props.captureAction === option.value;

    return (
      <ProductToolbarMenuItem
        key={option.value}
        dataUi={`content.toolbar.capture-action-option.${option.value}`}
        onMouseDown={createToolbarMenuItemClickHandler(() => props.onSelect(option.value))}
        onClick={preventToolbarMenuClick}
        selected={isSelected}
      >
        {option.icon}
        <ProductToolbarMenuItemCopy label={option.label} hint={option.hint} />
        {isSelected && renderMenuCheck()}
      </ProductToolbarMenuItem>
    );
  });
}

export function CaptureActionDropdown(props: CaptureActionDropdownProps) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.captureButtonRef,
    displayMode: props.displayMode,
    getMenuPosition: props.getMenuPosition,
    menuHeight: 340,
    menuWidth: 280,
    ...(props.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: props.viewportRightInset }),
  });

  if (!style) {
    return null;
  }

  return (
    <ToolbarMenuDropdown
      dataUi="content.toolbar.capture-action-menu"
      menuRef={props.captureDropdownMenuRef}
    >
      <ProductToolbarMenu
        compact={props.compactMenus}
        title={translate('content.toolbar.afterCaptureTitle')}
        variant="capture"
        placement={menuPlacement}
        style={style}
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
