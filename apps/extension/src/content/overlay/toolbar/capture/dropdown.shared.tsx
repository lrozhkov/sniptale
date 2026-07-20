import React from 'react';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
} from '../menu/floating.helpers';

type ToolbarDropdownPlacementArgs = {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  displayMode: 'horizontal' | 'vertical';
  getMenuPosition: (
    buttonRef: React.RefObject<HTMLButtonElement | null>,
    menuHeight?: number
  ) => 'up' | 'down';
  menuHeight: number;
  menuWidth: number;
  preferredAlign?: 'start' | 'end';
  viewportRightInset?: number;
};

export function resolveToolbarDropdownState(args: ToolbarDropdownPlacementArgs) {
  const placement = args.getMenuPosition(args.anchorRef, args.menuHeight);
  const style = resolveToolbarFloatingMenuStyle({
    anchorEl: args.anchorRef.current,
    displayMode: args.displayMode,
    menuHeight: args.menuHeight,
    menuWidth: args.menuWidth,
    placement,
    ...(args.preferredAlign === undefined ? {} : { preferredAlign: args.preferredAlign }),
    ...(args.viewportRightInset === undefined
      ? {}
      : { viewportRightInset: args.viewportRightInset }),
  });

  return {
    menuPlacement: resolveToolbarMenuPlacement(args.displayMode, placement),
    placement,
    style,
  };
}

export function ToolbarMenuDropdown(props: {
  children: React.ReactNode;
  dataUi: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={props.menuRef as React.Ref<HTMLDivElement>} data-ui={props.dataUi}>
      {props.children}
    </div>
  );
}

export function createToolbarMenuItemClickHandler(onSelect: () => void) {
  return (event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect();
  };
}

export function preventToolbarMenuClick(event: React.MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}
