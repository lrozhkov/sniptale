import { flushSync } from 'react-dom';
import { isEditableElementTarget } from '../../../ui/keyboard/editable-target';
import { isTrustedKeyboardEvent } from '../../platform/trusted-events';
import {
  projectClientRectToContentUi,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate } from '../../../platform/i18n';
import { getQuickActions } from '../../../composition/persistence/quick-actions';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import type { QuickAction } from '../../../contracts/settings';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { resolveToolbarDropdownState } from '../toolbar/menu/dropdown';
import { useToolbarFloatingMenuDismissal } from '../toolbar/menu/floating.helpers';
import { getToolbarMenuPosition } from '../toolbar/menu/position';
import { useToolbarMenuDirection } from '../toolbar/menu/direction';
import { useToolbarMenuState, type ToolbarMenuState } from '../toolbar/state/menu';

export function usePageQuickActionsMenu(props: {
  toolbarMenuState?: ToolbarMenuState;
  displayMode?: 'horizontal' | 'vertical';
  compact?: boolean;
}) {
  const localMenus = useToolbarMenuState();
  const menus = props.toolbarMenuState ?? localMenus;
  const keyboardOpening = useRef(false);
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = menus.activeMenuType === 'quick-actions';
  const closeMenu = menus.closeMenu;
  const close = useCallback(() => {
    closeMenu('quick-actions');
  }, [closeMenu]);
  useEffect(() => {
    if (open && keyboardOpening.current)
      menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [open, actions]);
  useEffect(() => {
    if (!open) return;
    let active = true,
      epoch = 0;
    const load = async () => {
      const version = ++epoch;
      try {
        const list = await getQuickActions();
        if (active && epoch === version) setActions(list.filter((action) => action.status));
      } catch {
        if (active && epoch === version)
          showToast(translate('content.pageLauncher.failed'), 'error');
      }
    };
    void load();
    const dispose = browserStorage.canObserveChanges()
      ? browserStorage.subscribeToChanges((changes, area) => {
          if (area === 'local' && changes['sniptale_quick_actions']) void load();
        })
      : () => undefined;
    return () => {
      active = false;
      ++epoch;
      dispose();
    };
  }, [open]);
  useToolbarFloatingMenuDismissal({
    menuRef,
    triggerRef,
    open,
    onClose: close,
    onEscapeClose: () => {
      close();
      triggerRef.current?.focus({ preventScroll: true });
    },
  });
  const resolveLayout = () => {
    const dropdown = resolveToolbarDropdownState({
      anchorRef: triggerRef,
      displayMode: props.displayMode ?? 'horizontal',
      getMenuPosition: (ref, height = 280) => getToolbarMenuPosition(ref.current, height),
      menuHeight: Math.max(64, actions.length * 40 + 40),
      menuWidth: 280,
      preferredAlign: 'start',
    });
    const anchor = triggerRef.current;
    if (anchor && dropdown.style && props.displayMode !== 'vertical') {
      const scale = readContentUiScaleCompensation(anchor);
      const rect = projectClientRectToContentUi(anchor.getBoundingClientRect(), scale);
      const viewport = resolveContentUiViewport({
        clientWidth: window.innerWidth,
        clientHeight: window.innerHeight,
        scale,
      });
      const space = dropdown.placement === 'up' ? rect.y : viewport.height - rect.y - rect.height;
      // Reserve the existing 10px menu gap and 8px viewport margin.
      dropdown.style.maxHeight = Math.max(0, space - 18);
    }
    return { placement: dropdown.menuPlacement, style: dropdown.style };
  };
  const dropdown = resolveLayout();
  const side = useToolbarMenuDirection(resolveLayout);
  const trigger = useCallback(
    async (action: QuickAction, event: Event) => {
      if (pending.current) return;
      const services = getContentRuntimeServices();
      const source = services.contentActionIntent.createTrustedContentActionIntentSource(event);
      if (!source) return;
      pending.current = true;
      flushSync(() => {
        setBusy(true);
        close();
      });
      try {
        const message = await services.contentActionIntent.attachContentActionIntent(
          { type: MessageType.TRIGGER_QUICK_ACTION, actionId: action.id },
          source
        );
        const result = await services.messaging.sendRuntimeMessage(message);
        if (!result?.success) throw new Error('Quick action was refused');
      } catch {
        showToast(translate('content.pageLauncher.failed'), 'error');
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [close]
  );
  useEffect(() => {
    if (!open || busy) return;
    const onKey = (event: KeyboardEvent) => {
      const action = actions[event.key === '0' ? 9 : Number(event.key) - 1];
      if (
        !/^[0-9]$/.test(event.key) ||
        !action ||
        pending.current ||
        !acceptsQuickActionDigit(event, triggerRef.current, menuRef.current)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      triggerRef.current?.focus({ preventScroll: true });
      void trigger(action, event);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, open, busy, trigger]);
  const title = translate('content.pageLauncher.actions');
  return {
    title,
    triggerRef,
    menuRef,
    open,
    busy,
    side,
    dropdown,
    actions,
    trigger,
    toggle: (keyboard: boolean) => {
      keyboardOpening.current = keyboard;
      menus.toggleMenu('quick-actions');
    },
  };
}

function acceptsQuickActionDigit(
  event: KeyboardEvent,
  trigger: HTMLButtonElement | null,
  menu: HTMLDivElement | null
): boolean {
  if (
    !isTrustedKeyboardEvent(event) ||
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey ||
    event.composedPath().some(isEditableElementTarget) ||
    !trigger ||
    trigger.matches(':disabled') ||
    trigger.getClientRects().length === 0 ||
    getComputedStyle(trigger).visibility === 'hidden' ||
    trigger.closest('[inert], [data-page-customizing="true"], [data-dragging="true"]') ||
    !menu ||
    menu.getClientRects().length === 0 ||
    getComputedStyle(menu).visibility === 'hidden'
  )
    return false;
  const root = trigger.getRootNode();
  if (!(root instanceof Document || root instanceof ShadowRoot)) return false;
  return ![
    ...root.querySelectorAll<HTMLElement>('[aria-modal="true"], [role="dialog"], [role="listbox"]'),
  ].some(
    (layer) => layer.getClientRects().length > 0 && getComputedStyle(layer).visibility !== 'hidden'
  );
}
