import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';

import { useGlassSelectOverlay } from '../glass-select/overlay-state';
import {
  createOptionKeyDownHandler,
  createTriggerKeyDownHandler,
  findAdjacentEnabledIndex,
  findBoundaryEnabledIndex,
  resolveOpenIndex,
  type ProductSelectControllerOption,
} from './navigation';

interface ProductSelectControllerArgs<T extends ProductSelectControllerOption> {
  disabled: boolean;
  onChange: (value: string) => void;
  options: readonly T[];
  value: string;
}

function resolveSelectedIndex(options: readonly ProductSelectControllerOption[], value: string) {
  return options.findIndex((option) => option.value === value);
}

function useProductSelectOverlay(isOpen: boolean, setIsOpen: Dispatch<SetStateAction<boolean>>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { menuPosition } = useGlassSelectOverlay({
    portal: false,
    isOpen,
    setIsOpen,
    containerRef,
    menuRef,
  });

  return {
    containerRef,
    menuPosition,
    menuRef,
    optionRefs,
    triggerRef,
  };
}

function useSelectedOption<T extends ProductSelectControllerOption>(
  options: readonly T[],
  value: string
) {
  const selectedIndex = useMemo(() => resolveSelectedIndex(options, value), [options, value]);
  const selectedOption = useMemo(
    () => (selectedIndex >= 0 ? options[selectedIndex] : undefined),
    [options, selectedIndex]
  );

  return { selectedIndex, selectedOption };
}

function focusActiveOption(optionRefs: Array<HTMLButtonElement | null>, activeIndex: number) {
  if (activeIndex >= 0) {
    optionRefs[activeIndex]?.focus();
  }
}

function createCloseMenu(args: {
  setActiveIndex: (index: number) => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
}) {
  return (restoreFocus = false) => {
    args.setIsOpen(false);
    args.setActiveIndex(-1);

    if (restoreFocus) {
      queueMicrotask(() => {
        args.triggerRef.current?.focus();
      });
    }
  };
}

function createOpenMenu(args: {
  disabled: boolean;
  options: readonly ProductSelectControllerOption[];
  selectedIndex: number;
  setActiveIndex: (index: number) => void;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (nextIndex = resolveOpenIndex(args.options, args.selectedIndex)) => {
    if (args.disabled) {
      return;
    }

    args.setIsOpen(true);
    args.setActiveIndex(nextIndex);
  };
}

function createHandleSelect<T extends ProductSelectControllerOption>(args: {
  closeMenu: (restoreFocus?: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (option: T) => {
    if (!option.disabled) {
      args.onChange(option.value);
      args.closeMenu(true);
    }
  };
}

function useActiveOptionFocus(
  activeIndex: number,
  isOpen: boolean,
  optionRefs: MutableRefObject<Array<HTMLButtonElement | null>>
) {
  useEffect(() => {
    if (isOpen) {
      focusActiveOption(optionRefs.current, activeIndex);
    }
  }, [activeIndex, isOpen, optionRefs]);
}

function useProductSelectMovement(
  options: readonly ProductSelectControllerOption[],
  setActiveIndex: Dispatch<SetStateAction<number>>
) {
  const moveToBoundary = (direction: 'start' | 'end') => {
    setActiveIndex(findBoundaryEnabledIndex(options, direction));
  };

  const moveToAdjacent = (direction: 1 | -1, fallback: 'start' | 'end') => {
    setActiveIndex((currentIndex) =>
      currentIndex < 0
        ? findBoundaryEnabledIndex(options, fallback)
        : findAdjacentEnabledIndex(options, currentIndex, direction)
    );
  };

  return { moveToAdjacent, moveToBoundary };
}

function createToggleHandler(args: {
  closeMenu: (restoreFocus?: boolean) => void;
  isOpen: boolean;
  openMenu: (nextIndex?: number) => void;
}) {
  return () => {
    if (args.isOpen) {
      args.closeMenu(false);
      return;
    }

    args.openMenu();
  };
}

function createTriggerRefSetter(triggerRef: MutableRefObject<HTMLButtonElement | null>) {
  return (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  };
}

function createControllerHandlers<T extends ProductSelectControllerOption>(args: {
  closeMenu: (restoreFocus?: boolean) => void;
  isOpen: boolean;
  moveToAdjacent: (direction: 1 | -1, fallback: 'start' | 'end') => void;
  moveToBoundary: (direction: 'start' | 'end') => void;
  onChange: (value: string) => void;
  openMenu: (nextIndex?: number) => void;
  options: readonly T[];
  selectedIndex: number;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  triggerRef: MutableRefObject<HTMLButtonElement | null>;
}) {
  return {
    handleOptionKeyDown: createOptionKeyDownHandler({
      closeMenu: args.closeMenu,
      moveToBoundary: args.moveToBoundary,
      options: args.options,
      setActiveIndex: args.setActiveIndex,
    }),
    handleSelect: createHandleSelect<T>({
      closeMenu: args.closeMenu,
      onChange: args.onChange,
    }),
    handleToggle: createToggleHandler({
      closeMenu: args.closeMenu,
      isOpen: args.isOpen,
      openMenu: args.openMenu,
    }),
    handleTriggerKeyDown: createTriggerKeyDownHandler({
      closeMenu: args.closeMenu,
      isOpen: args.isOpen,
      moveToAdjacent: args.moveToAdjacent,
      moveToBoundary: args.moveToBoundary,
      openMenu: args.openMenu,
      options: args.options,
      selectedIndex: args.selectedIndex,
    }),
    setTriggerRef: createTriggerRefSetter(args.triggerRef),
  };
}

export function useProductSelectController<T extends ProductSelectControllerOption>(
  args: ProductSelectControllerArgs<T>
) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const menuId = useId();
  const overlayState = useProductSelectOverlay(isOpen, setIsOpen);
  const { selectedIndex, selectedOption } = useSelectedOption(args.options, args.value);
  const closeMenu = createCloseMenu({
    setActiveIndex,
    setIsOpen,
    triggerRef: overlayState.triggerRef,
  });
  const openMenu = createOpenMenu({
    disabled: args.disabled,
    options: args.options,
    selectedIndex,
    setActiveIndex,
    setIsOpen,
  });
  const { moveToAdjacent, moveToBoundary } = useProductSelectMovement(args.options, setActiveIndex);

  useActiveOptionFocus(activeIndex, isOpen, overlayState.optionRefs);
  const handlers = createControllerHandlers<T>({
    closeMenu,
    isOpen,
    moveToAdjacent,
    moveToBoundary,
    onChange: args.onChange,
    openMenu,
    options: args.options,
    selectedIndex,
    setActiveIndex,
    triggerRef: overlayState.triggerRef,
  });

  return {
    activeIndex,
    containerRef: overlayState.containerRef,
    isOpen,
    menuId,
    menuPosition: overlayState.menuPosition,
    menuRef: overlayState.menuRef,
    optionRefs: overlayState.optionRefs,
    selectedOption,
    setActiveIndex,
    ...handlers,
  };
}
