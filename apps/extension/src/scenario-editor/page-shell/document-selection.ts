import {
  useEffect,
  type RefObject,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

const COMMAND = 'button, a, select, input, .guide-insertion, .guide-action-menu';
const FIELD = 'textarea';

/** Routes canvas selection without taking ownership of native editing or child gestures. */
export function guideDocumentSelection(params: {
  selectedId: string | null;
  selectedBlockId: string | null;
  select: (itemId: string, blockId: string | null) => void;
  clear: () => void;
}) {
  function target(root: HTMLElement, value: EventTarget | null) {
    if (!(value instanceof Element) || !root.contains(value)) return null;
    const item = value.closest<HTMLElement>('article[id], section[id]');
    if (!item || !root.contains(item)) return null;
    const block = value.closest<HTMLElement>('[data-block-id]');
    return { element: block ?? item, item, block, value };
  }
  function select(current: NonNullable<ReturnType<typeof target>>) {
    params.select(current.item.id, current.block?.dataset['blockId'] ?? null);
  }
  return {
    onMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
      if (event.button !== 0) return;
      const current = target(event.currentTarget, event.target);
      if (!current || current.value.closest(COMMAND)) return;
      const selected =
        params.selectedId === current.item.id &&
        params.selectedBlockId === (current.block?.dataset['blockId'] ?? null);
      if (selected && current.value.matches(FIELD)) return;
      if (current.value.closest('[data-editing="true"]')) return;
      // Compatibility mouse events follow a completed touch tap, not a scrolling gesture.
      event.preventDefault();
      select(current);
      current.element.focus({ preventScroll: true });
    },
    onFocusCapture(event: FocusEvent<HTMLDivElement>) {
      const current = target(event.currentTarget, event.target);
      if (!current || current.value.closest('.guide-insertion, .guide-action-menu')) return;
      select(current);
    },
    onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      const current = target(event.currentTarget, event.target);
      if (!current) return;
      if ((event.key === 'Enter' || event.key === 'F2') && event.target === current.element) {
        const field = current.element.querySelector<HTMLElement>('textarea, [data-image-upload]');
        if (!field) return;
        event.preventDefault();
        event.stopPropagation();
        field.focus({ preventScroll: true });
        return;
      }
      const field = current.value.matches(FIELD);
      const finishText =
        field && (event.key === 'Escape' || (event.key === 'Enter' && !event.shiftKey));
      if (!finishText) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.dataset['selectionInput'] = 'pointer';
      current.element.focus({ preventScroll: true });
    },
  };
}

/** Programmatic wrapper focus follows the actual input method, including entry from side panels. */
export function useGuideSelectionInput(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const pointer = () => {
      root.dataset['selectionInput'] = 'pointer';
    };
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Tab') root.dataset['selectionInput'] = 'keyboard';
    };
    const owner = root.ownerDocument;
    pointer();
    owner.addEventListener('pointerdown', pointer, true);
    owner.addEventListener('keydown', keyboard, true);
    return () => {
      owner.removeEventListener('pointerdown', pointer, true);
      owner.removeEventListener('keydown', keyboard, true);
    };
  }, [ref]);
}
