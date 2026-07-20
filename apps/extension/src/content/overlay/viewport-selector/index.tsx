import { useImperativeHandle, forwardRef } from 'react';
import { useAppLocale } from '../../../platform/i18n';
import type { ContentToolbarDisplayMode, ViewportPreset } from '../../../contracts/settings';
import {
  resolveToolbarFloatingMenuStyle,
  resolveToolbarMenuPlacement,
} from '../toolbar/menu/floating.helpers';
import type { ProductToolbarMenuPlacement } from '@sniptale/ui/product-menus/toolbar';
import { ViewportSelectorButton, ViewportSelectorMenu } from './views';
import { useViewportSelectorMenu } from './menu';
import { useViewportSelectorPresets } from './presets';

interface ViewportSelectorProps {
  compactMenus?: boolean;
  currentViewport: { width: number; height: number } | null;
  displayMode?: ContentToolbarDisplayMode;
  onViewportChange: (viewport: { width: number; height: number } | null) => void;
  disabled?: boolean;
  menuPosition?: 'up' | 'down';
  onMenuStateChange?: (isOpen: boolean) => void;
}

interface ViewportSelectorMenuState {
  handleSelectNative: () => void;
  handleSelectPreset: (preset: ViewportPreset) => void;
  handleToggleMenu: (event: React.MouseEvent<HTMLButtonElement>) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>;
  showMenu: boolean;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

export interface ViewportSelectorRef {
  getMenuElement: () => HTMLElement | null;
  closeMenu: () => void;
}

function createViewportSelectorHandle(
  menuRef: React.RefObject<HTMLElement | null>,
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>
): ViewportSelectorRef {
  return {
    getMenuElement: () => menuRef.current,
    closeMenu: () => setShowMenu(false),
  };
}

function renderViewportSelectorMenu(props: {
  compactMenus: boolean;
  currentViewport: { width: number; height: number } | null;
  menuPlacement: ProductToolbarMenuPlacement;
  menuStyle: React.CSSProperties | null;
  onSelectNative: () => void;
  onSelectPreset: (preset: ViewportPreset) => void;
  presets: ReturnType<typeof useViewportSelectorPresets>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  showMenu: boolean;
}) {
  if (!props.showMenu || !props.menuStyle) {
    return null;
  }

  return (
    <div ref={props.menuRef as React.RefObject<HTMLDivElement>}>
      <ViewportSelectorMenu
        compactMenus={props.compactMenus}
        currentViewport={props.currentViewport}
        menuPlacement={props.menuPlacement}
        menuStyle={props.menuStyle}
        onSelectNative={props.onSelectNative}
        onSelectPreset={props.onSelectPreset}
        presets={props.presets}
      />
    </div>
  );
}

function useViewportSelectorRuntime(props: ViewportSelectorProps): {
  presets: ReturnType<typeof useViewportSelectorPresets>;
} & ViewportSelectorMenuState {
  const presets = useViewportSelectorPresets();
  const menuState = useViewportSelectorMenu({
    disabled: props.disabled ?? false,
    onViewportChange: props.onViewportChange,
    ...(props.onMenuStateChange === undefined
      ? {}
      : { onMenuStateChange: props.onMenuStateChange }),
  });

  return {
    presets,
    ...menuState,
  };
}

function resolveViewportSelectorMenuStyle(args: {
  displayMode: ContentToolbarDisplayMode;
  menuPosition: 'up' | 'down';
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  return resolveToolbarFloatingMenuStyle({
    anchorEl: args.wrapperRef.current,
    displayMode: args.displayMode,
    menuHeight: 360,
    menuWidth: 280,
    placement: args.menuPosition,
  });
}

function useViewportSelectorHandle(
  ref: React.ForwardedRef<ViewportSelectorRef>,
  menuRef: React.RefObject<HTMLElement | null>,
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>
) {
  useImperativeHandle(ref, () => createViewportSelectorHandle(menuRef, setShowMenu), [
    menuRef,
    setShowMenu,
  ]);
}

export const ViewportSelector = forwardRef<ViewportSelectorRef, ViewportSelectorProps>(
  (props, ref) => {
    useAppLocale();
    const {
      presets,
      handleSelectNative,
      handleSelectPreset,
      handleToggleMenu,
      menuRef,
      setShowMenu,
      showMenu,
      wrapperRef,
    } = useViewportSelectorRuntime(props);
    const compactMenus = props.compactMenus ?? false;
    const disabled = props.disabled ?? false;
    const displayMode = props.displayMode ?? 'horizontal';
    const menuPosition = props.menuPosition ?? 'down';
    const menuStyle = resolveViewportSelectorMenuStyle({
      displayMode,
      menuPosition,
      wrapperRef,
    });
    const menuPlacement = resolveToolbarMenuPlacement(displayMode, menuPosition);

    useViewportSelectorHandle(ref, menuRef, setShowMenu);

    return (
      <div
        className="sniptale-viewport-wrapper"
        ref={wrapperRef as React.RefObject<HTMLDivElement>}
      >
        <ViewportSelectorButton
          currentViewport={props.currentViewport}
          disabled={disabled}
          isOpen={showMenu}
          onToggle={handleToggleMenu}
        />
        {renderViewportSelectorMenu({
          compactMenus,
          currentViewport: props.currentViewport,
          menuPlacement,
          menuStyle,
          onSelectNative: handleSelectNative,
          onSelectPreset: handleSelectPreset,
          presets,
          menuRef,
          showMenu,
        })}
      </div>
    );
  }
);
