import { useEffect, useLayoutEffect, useRef } from 'react';

type AppearanceView = 'interface' | 'context-menu';

function ownsSelectListbox(panel: HTMLElement | null, listboxId: string): boolean {
  return Array.from(panel?.querySelectorAll<HTMLElement>('[aria-controls]') ?? []).some(
    (control) => control.getAttribute('aria-controls') === listboxId
  );
}

function focusedView(
  target: HTMLElement,
  interfacePanel: HTMLElement | null,
  contextMenuPanel: HTMLElement | null
): AppearanceView | null {
  if (interfacePanel?.contains(target)) return 'interface';
  if (contextMenuPanel?.contains(target)) return 'context-menu';

  const listboxId = target.closest<HTMLElement>('[role="listbox"]')?.id;
  if (!listboxId) return null;
  if (ownsSelectListbox(interfacePanel, listboxId)) return 'interface';
  if (ownsSelectListbox(contextMenuPanel, listboxId)) return 'context-menu';
  return null;
}

export function useAppearanceViewFocus(view: AppearanceView) {
  const navigationRef = useRef<HTMLDivElement>(null);
  const interfaceRef = useRef<HTMLElement>(null);
  const contextMenuRef = useRef<HTMLElement>(null);
  const focusedViewRef = useRef<AppearanceView | null>(null);
  const previousViewRef = useRef(view);

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      focusedViewRef.current = focusedView(
        event.target,
        interfaceRef.current,
        contextMenuRef.current
      );
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  useLayoutEffect(() => {
    if (previousViewRef.current !== view && focusedViewRef.current === previousViewRef.current) {
      navigationRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-current="page"]')
        ?.focus();
    }
    previousViewRef.current = view;
  }, [view]);

  return { navigationRef, interfaceRef, contextMenuRef };
}
