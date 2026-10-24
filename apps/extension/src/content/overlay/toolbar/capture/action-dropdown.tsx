import { CommandPressScope } from '@sniptale/ui/control-language/press';
import React from 'react';
import { ProductToolbarMenu } from '@sniptale/ui/product-menus/toolbar';
import { translate } from '../../../../platform/i18n';
import { resolveToolbarDropdownState, ToolbarMenuDropdown } from '../menu/dropdown';
import { CaptureActionIcons } from './action-icons';

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

export function resolveCaptureActionMenuLayout(
  props: Pick<
    CaptureActionDropdownProps,
    'captureButtonRef' | 'displayMode' | 'getMenuPosition' | 'viewportRightInset'
  >
) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.captureButtonRef,
    displayMode: props.displayMode,
    getMenuPosition: props.getMenuPosition,
    menuHeight: 100,
    menuWidth: 260,
    ...(props.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: props.viewportRightInset }),
  });

  return { placement: menuPlacement, style };
}

export function CaptureActionDropdown(props: CaptureActionDropdownProps) {
  const adopted = React.useContext(CommandPressScope);
  const { placement: menuPlacement, style } = resolveCaptureActionMenuLayout(props);

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
        style={style}
      >
        <CaptureActionIcons
          label={translate('content.toolbar.afterCaptureTitle')}
          dataUiPrefix="content.toolbar.capture-action-option"
          selected={props.captureAction}
          options={props.captureActionOptions}
          onSelect={props.onSelect}
        />
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}
