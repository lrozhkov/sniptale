import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  ProductToolbarMenu,
  ProductToolbarMenuDivider,
  ProductToolbarMenuItem,
  ProductToolbarMenuItemCopy,
} from '@sniptale/ui/product-menus/toolbar';
import type { EditorLayerItem } from '../../../../features/editor/document/types';
import { buildCanvasContextMenuItems, resolveCanvasContextMenuEnabledSnapshot } from './items';
import {
  EDITOR_CANVAS_CONTEXT_MENU_DATA_UI,
  type CanvasContextMenuController,
  type CanvasContextMenuItem,
  type CanvasContextMenuState,
  type CanvasContextMenuSubmenu,
} from './types';

const dangerItemClassName =
  'text-[var(--sniptale-color-danger)] hover:text-[var(--sniptale-color-danger)]';
const submenuGapPx = 8;

function resolveSubmenuStyle(side: 'left' | 'right') {
  return side === 'right'
    ? {
        left: '100%',
        top: 0,
      }
    : {
        left: 'auto',
        right: '100%',
        top: 0,
      };
}

function resolveSubmenuBridgeStyle(side: 'left' | 'right'): React.CSSProperties {
  return side === 'right'
    ? {
        marginRight: -submenuGapPx,
        paddingRight: submenuGapPx,
      }
    : {
        marginLeft: -submenuGapPx,
        paddingLeft: submenuGapPx,
      };
}

function isEventOutsideMenu(menu: HTMLDivElement | null, target: EventTarget | null) {
  return !(target instanceof Node) || !menu?.contains(target);
}

function attachCanvasContextMenuDismissalListeners(args: {
  handleFocusIn: (event: FocusEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handleViewportChange: () => void;
}) {
  document.addEventListener('pointerdown', args.handlePointerDown, true);
  document.addEventListener('focusin', args.handleFocusIn, true);
  window.addEventListener('keydown', args.handleKeyDown, true);
  window.addEventListener('blur', args.handleViewportChange);
  window.addEventListener('resize', args.handleViewportChange);
  window.addEventListener('scroll', args.handleViewportChange, true);
}

function detachCanvasContextMenuDismissalListeners(args: {
  handleFocusIn: (event: FocusEvent) => void;
  handleKeyDown: (event: KeyboardEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handleViewportChange: () => void;
}) {
  document.removeEventListener('pointerdown', args.handlePointerDown, true);
  document.removeEventListener('focusin', args.handleFocusIn, true);
  window.removeEventListener('keydown', args.handleKeyDown, true);
  window.removeEventListener('blur', args.handleViewportChange);
  window.removeEventListener('resize', args.handleViewportChange);
  window.removeEventListener('scroll', args.handleViewportChange, true);
}

function useCanvasContextMenuDismissal(args: {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onCloseSubmenu: () => void;
  submenuOpen: boolean;
}) {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (isEventOutsideMenu(args.menuRef.current, event.target)) {
        args.onClose();
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isEventOutsideMenu(args.menuRef.current, event.target)) {
        args.onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      if (args.submenuOpen) {
        args.onCloseSubmenu();
        return;
      }

      args.onClose();
    };

    const handleViewportChange = () => args.onClose();
    const listeners = { handleFocusIn, handleKeyDown, handlePointerDown, handleViewportChange };

    attachCanvasContextMenuDismissalListeners(listeners);
    return () => {
      detachCanvasContextMenuDismissalListeners(listeners);
    };
  }, [args]);
}

function CanvasContextMenuSubmenuTrigger(props: {
  active: boolean;
  item: Extract<CanvasContextMenuItem, { type: 'submenu' }>;
  onCloseSubmenu: () => void;
  onOpenSubmenu: (submenu: CanvasContextMenuSubmenu) => void;
  side: 'left' | 'right';
}) {
  const submenuButtonProps = props.active ? { selected: true } : {};

  return (
    <div
      className="relative"
      style={resolveSubmenuBridgeStyle(props.side)}
      onMouseEnter={() => props.onOpenSubmenu(props.item.id as CanvasContextMenuSubmenu)}
      onMouseLeave={props.onCloseSubmenu}
    >
      <ProductToolbarMenuItem
        className="justify-between"
        onClick={() => props.onOpenSubmenu(props.item.id as CanvasContextMenuSubmenu)}
        {...submenuButtonProps}
      >
        <ProductToolbarMenuItemCopy label={props.item.label} />
        <ChevronRight size={16} strokeWidth={1.8} />
      </ProductToolbarMenuItem>
      {props.active ? (
        <ProductToolbarMenu
          className="z-50"
          compact
          placement="side"
          style={resolveSubmenuStyle(props.side)}
        >
          {props.item.items.map((submenuItem) => (
            <ProductToolbarMenuItem
              key={submenuItem.id}
              className={submenuItem.danger ? dangerItemClassName : ''}
              onClick={submenuItem.onSelect}
              {...(submenuItem.disabled === undefined ? {} : { disabled: submenuItem.disabled })}
            >
              <ProductToolbarMenuItemCopy label={submenuItem.label} />
            </ProductToolbarMenuItem>
          ))}
        </ProductToolbarMenu>
      ) : null}
    </div>
  );
}

function CanvasContextMenuItems(props: {
  items: CanvasContextMenuItem[];
  onCloseSubmenu: () => void;
  onOpenSubmenu: (submenu: CanvasContextMenuSubmenu) => void;
  side: 'left' | 'right';
  submenu: CanvasContextMenuSubmenu | null;
}) {
  return props.items.map((item) => {
    if ('type' in item && item.type === 'divider') {
      return <ProductToolbarMenuDivider key={item.id} />;
    }

    if ('type' in item && item.type === 'submenu') {
      return (
        <CanvasContextMenuSubmenuTrigger
          key={item.id}
          active={props.submenu === item.id}
          item={item}
          onCloseSubmenu={props.onCloseSubmenu}
          onOpenSubmenu={props.onOpenSubmenu}
          side={props.side}
        />
      );
    }

    return (
      <ProductToolbarMenuItem
        key={item.id}
        className={item.danger ? dangerItemClassName : ''}
        onClick={item.onSelect}
        {...(item.disabled === undefined ? {} : { disabled: item.disabled })}
      >
        <ProductToolbarMenuItemCopy label={item.label} />
      </ProductToolbarMenuItem>
    );
  });
}

function useResolvedCanvasContextMenuItems(props: {
  controller: CanvasContextMenuController;
  layers: EditorLayerItem[];
  onClose: () => void;
  onOpenImage: () => void;
  request: CanvasContextMenuState['request'];
}) {
  const enabledSnapshot = useMemo(
    () => resolveCanvasContextMenuEnabledSnapshot(props.layers, props.request),
    [props.layers, props.request]
  );

  return useMemo(
    () =>
      buildCanvasContextMenuItems({
        controller: props.controller,
        enabledSnapshot,
        onClose: props.onClose,
        onOpenImage: props.onOpenImage,
        request: props.request,
      }),
    [enabledSnapshot, props.controller, props.onClose, props.onOpenImage, props.request]
  );
}

export function CanvasContextMenu(props: {
  controller: CanvasContextMenuController;
  layers: EditorLayerItem[];
  onClose: () => void;
  onOpenImage: () => void;
  state: CanvasContextMenuState;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<CanvasContextMenuSubmenu | null>(null);
  const items = useResolvedCanvasContextMenuItems({
    controller: props.controller,
    layers: props.layers,
    onClose: props.onClose,
    onOpenImage: props.onOpenImage,
    request: props.state.request,
  });

  useCanvasContextMenuDismissal({
    menuRef,
    onClose: props.onClose,
    onCloseSubmenu: () => setSubmenu(null),
    submenuOpen: submenu !== null,
  });

  return (
    <div ref={menuRef} className="absolute z-40" style={props.state.style}>
      <ProductToolbarMenu className="z-40" compact style={{ left: 0, top: 0 }}>
        <div
          data-ui={EDITOR_CANVAS_CONTEXT_MENU_DATA_UI}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <CanvasContextMenuItems
            items={items}
            onCloseSubmenu={() => setSubmenu(null)}
            onOpenSubmenu={setSubmenu}
            side={props.state.submenuSide}
            submenu={submenu}
          />
        </div>
      </ProductToolbarMenu>
    </div>
  );
}
