import {
  useToolbarClickOutsideDismissal,
  useToolbarFocusMenuDismissal,
  useToolbarMouseDistanceDismissal,
} from '../capture/menu-effects';
import type { ToolbarCapturePopoverMenu, ToolbarPopoverMenu } from '../state/menu';

export function useToolbarMenuDismissal(params: {
  activeMenuType: ToolbarPopoverMenu | null;
  closeMenus: (except?: ToolbarCapturePopoverMenu | null) => void;
  viewportWrapperRef: React.RefObject<HTMLDivElement | null>;
  showCaptureMenu: boolean;
  showTimerMenu: boolean;
  viewportMenuOpen: boolean;
  captureDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  timerDropdownMenuRef: React.RefObject<HTMLDivElement | null>;
  viewportSelectorRef: { current: { getMenuElement?: () => HTMLElement | null } | null };
  timerMenuRef: React.RefObject<HTMLDivElement | null>;
  captureMenuRef: React.RefObject<HTMLDivElement | null>;
}) {
  useToolbarFocusMenuDismissal(params);
  useToolbarMouseDistanceDismissal(params);
  useToolbarClickOutsideDismissal({
    isOpen: params.showTimerMenu,
    menuRef: params.timerMenuRef,
    closeMenus: params.closeMenus,
  });
  useToolbarClickOutsideDismissal({
    isOpen: params.showCaptureMenu,
    menuRef: params.captureMenuRef,
    closeMenus: params.closeMenus,
  });
}
