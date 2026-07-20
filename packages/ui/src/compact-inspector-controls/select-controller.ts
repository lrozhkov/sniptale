import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, Ref } from 'react';
import { resolveThemeSafePortalTarget, useResolvedPortalTheme } from '../theme/safe-portal';
import { bindFloatingInteractionPositionListeners } from '../floating-interactions/placement';
import { isOwnedFloatingInteractionEvent } from '../floating-interactions/target';
import {
  getNextEnabledIndex,
  getSelectedIndex,
  resolveCompactSelectMenuStyle,
} from './select-helpers';
import type { CompactSelectActions } from './select-actions';
import { useCompactSelectKeyboard } from './select-keyboard';
import type { CompactSelectOption } from './select-types';

interface UseCompactSelectControllerParams<T extends string> {
  disabled?: boolean | undefined;
  menuAnchorRef?: React.RefObject<HTMLElement | null> | undefined;
  onChange: (value: T) => void;
  onOpenChange?: ((open: boolean) => void) | undefined;
  options: readonly CompactSelectOption<T>[];
  ref: Ref<HTMLButtonElement>;
  triggerOnKeyDown?: ((event: KeyboardEvent<HTMLButtonElement>) => void) | undefined;
  value: T | '';
}

type CompactSelectActionsConfig<T extends string> = {
  disabled?: boolean | undefined;
  onChange: (value: T) => void;
  options: readonly CompactSelectOption<T>[];
  refs: ReturnType<typeof useCompactSelectRefs>;
  selection: ReturnType<typeof useCompactSelectSelection<T>>;
  setOpen: (open: boolean) => void;
  updateMenuPosition: () => void;
};

export function useCompactSelectController<T extends string>(
  params: UseCompactSelectControllerParams<T>
) {
  const refs = useCompactSelectRefs(params.ref);
  const [open, setOpen] = useState(false);
  const selection = useCompactSelectSelection(params.options, params.value);
  const placement = useCompactSelectPlacement(
    open,
    refs.triggerNode,
    refs.triggerRef,
    params.menuAnchorRef
  );
  const actions = useCompactSelectActions({
    disabled: params.disabled,
    onChange: params.onChange,
    options: params.options,
    refs,
    selection,
    setOpen,
    updateMenuPosition: placement.updateMenuPosition,
  });
  const keyboard = useCompactSelectKeyboard({
    activeStartIndex: selection.activeStartIndex,
    actions,
    open,
    options: params.options,
    selectedIndex: selection.selectedIndex,
    setOpen,
    triggerOnKeyDown: params.triggerOnKeyDown,
  });

  useCompactSelectOpenEffect(open, params.onOpenChange);
  useCompactSelectDismiss(open, refs.containerRef, refs.menuRef, () => setOpen(false));

  return {
    actions,
    keyboard,
    placement,
    refs,
    state: {
      open,
      selectedOption: selection.selectedOption,
    },
  };
}

function useCompactSelectSelection<T extends string>(
  options: readonly CompactSelectOption<T>[],
  value: T | ''
) {
  const selectedIndex = useMemo(() => getSelectedIndex(options, value), [options, value]);
  return {
    activeStartIndex: selectedIndex >= 0 ? selectedIndex : 0,
    selectedIndex,
    selectedOption: selectedIndex >= 0 ? options[selectedIndex] : undefined,
  };
}

function useCompactSelectRefs(ref: Ref<HTMLButtonElement>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [triggerNode, setTriggerNode] = useState<HTMLButtonElement | null>(null);
  const setTriggerRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      setTriggerNode(node);
      assignForwardedTriggerRef(ref, node);
    },
    [ref]
  );

  return { containerRef, menuRef, optionRefs, setTriggerRefs, triggerNode, triggerRef };
}

function useCompactSelectOpenEffect(
  open: boolean,
  onOpenChange: ((open: boolean) => void) | undefined
) {
  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);
}

function useCompactSelectDismiss(
  open: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  menuRef: React.RefObject<HTMLDivElement | null>,
  close: () => void
) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const owners = () => [containerRef.current, menuRef.current];
    const handlePointerDown = (event: PointerEvent) => {
      if (!isOwnedFloatingInteractionEvent(event, owners())) {
        close();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (!isOwnedFloatingInteractionEvent(event, owners())) {
        close();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('focusin', handleFocusIn);
    return () => removeSelectDismissListeners(handlePointerDown, handleFocusIn);
  }, [close, containerRef, menuRef, open]);
}

function useCompactSelectPlacement(
  open: boolean,
  triggerNode: HTMLButtonElement | null,
  triggerRef: React.RefObject<HTMLButtonElement | null>,
  menuAnchorRef: React.RefObject<HTMLElement | null> | undefined
) {
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const portalTheme = useResolvedPortalTheme(triggerNode);
  const portalTarget =
    typeof document === 'undefined' ? null : resolveThemeSafePortalTarget(triggerNode);
  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') {
      return;
    }
    setMenuStyle(resolveCompactSelectMenuStyle(menuAnchorRef?.current ?? trigger));
  }, [menuAnchorRef, triggerRef]);

  useEffect(
    () =>
      bindSelectPositionListeners(
        open,
        menuAnchorRef?.current ?? triggerRef.current,
        updateMenuPosition
      ),
    [menuAnchorRef, open, triggerRef, updateMenuPosition]
  );

  return { menuStyle, portalTarget, portalTheme, updateMenuPosition };
}

function useCompactSelectActions<T extends string>({
  disabled,
  onChange,
  options,
  refs,
  selection,
  setOpen,
  updateMenuPosition,
}: CompactSelectActionsConfig<T>): CompactSelectActions<T> {
  const focusOption = (index: number) => {
    window.requestAnimationFrame(() => refs.optionRefs.current[index]?.focus());
  };
  const openMenu = (preferredIndex = selection.activeStartIndex) => {
    if (disabled) {
      return;
    }
    const index = getNextEnabledIndex(options, preferredIndex, 1);
    updateMenuPosition();
    setOpen(true);
    if (index >= 0) {
      focusOption(index);
    }
  };
  const selectOption = (option: CompactSelectOption<T>) => {
    if (!option.disabled) {
      onChange(option.value);
      setOpen(false);
      refs.triggerRef.current?.focus();
    }
  };
  const closeAndFocusTrigger = () => {
    setOpen(false);
    refs.triggerRef.current?.focus();
  };

  return {
    closeAndFocusTrigger,
    focusOption,
    openMenu,
    selectOption,
    selectedIndex: selection.selectedIndex,
  };
}

function bindSelectPositionListeners(
  open: boolean,
  anchor: HTMLElement | null,
  updateMenuPosition: () => void
) {
  if (!open) {
    return undefined;
  }

  return bindFloatingInteractionPositionListeners(anchor, updateMenuPosition);
}

function removeSelectDismissListeners(
  handlePointerDown: (event: PointerEvent) => void,
  handleFocusIn: (event: FocusEvent) => void
) {
  window.removeEventListener('pointerdown', handlePointerDown);
  window.removeEventListener('focusin', handleFocusIn);
}

function assignForwardedTriggerRef(ref: Ref<HTMLButtonElement>, node: HTMLButtonElement | null) {
  if (typeof ref === 'function') {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}
