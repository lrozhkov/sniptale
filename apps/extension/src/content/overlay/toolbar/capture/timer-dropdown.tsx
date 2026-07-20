import React from 'react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuBadge,
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

type TimerDropdownProps = {
  timerDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  timerButtonRef: React.RefObject<HTMLButtonElement | null>;
  compactMenus: boolean;
  displayMode: 'horizontal' | 'vertical';
  getMenuPosition: (
    buttonRef: React.RefObject<HTMLButtonElement | null>,
    menuHeight?: number
  ) => 'up' | 'down';
  timerDelay: number;
  timerOptions: ReadonlyArray<{ value: number; label: string; hint: string }>;
  closeMenus: (except?: 'capture' | 'timer' | 'viewport' | null) => void;
  onTimerDelayChange: (delay: number) => void;
  viewportRightInset?: number;
};

function TimerDropdownItems(props: {
  closeMenus: TimerDropdownProps['closeMenus'];
  onTimerDelayChange: TimerDropdownProps['onTimerDelayChange'];
  timerDelay: number;
  timerOptions: TimerDropdownProps['timerOptions'];
}) {
  return (
    <>
      {props.timerOptions.map((option) => {
        const isSelected = props.timerDelay === option.value;

        return (
          <ProductToolbarMenuItem
            key={option.value}
            onMouseDown={createToolbarMenuItemClickHandler(() => {
              props.onTimerDelayChange(option.value);
              props.closeMenus(null);
            })}
            onClick={preventToolbarMenuClick}
            selected={isSelected}
          >
            <ProductToolbarMenuBadge>
              {option.value === 0 ? '0s' : `${option.value}s`}
            </ProductToolbarMenuBadge>
            <ProductToolbarMenuItemCopy label={option.label} hint={option.hint} />
            {isSelected && renderMenuCheck()}
          </ProductToolbarMenuItem>
        );
      })}
    </>
  );
}

export function TimerDropdown(props: TimerDropdownProps) {
  const { menuPlacement, style } = resolveToolbarDropdownState({
    anchorRef: props.timerButtonRef,
    displayMode: props.displayMode,
    getMenuPosition: props.getMenuPosition,
    menuHeight: 300,
    menuWidth: 250,
    ...(props.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: props.viewportRightInset }),
  });

  if (!style) {
    return null;
  }

  return (
    <ToolbarMenuDropdown dataUi="content.toolbar.timer-menu" menuRef={props.timerDropdownMenuRef}>
      <ProductToolbarMenu
        title={translate('content.toolbar.delayTitle')}
        compact={props.compactMenus}
        placement={menuPlacement}
        style={style}
      >
        <TimerDropdownItems
          closeMenus={props.closeMenus}
          onTimerDelayChange={props.onTimerDelayChange}
          timerDelay={props.timerDelay}
          timerOptions={props.timerOptions}
        />
      </ProductToolbarMenu>
    </ToolbarMenuDropdown>
  );
}
