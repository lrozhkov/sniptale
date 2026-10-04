import { getContentEventTargetElement, resolveContentShadowRoot } from '../../../platform/dom-host';

type Opening = { trigger: HTMLButtonElement; keyboard: boolean; revision: number };
const POINTER_FOCUS_ATTRIBUTE = 'data-focus-restoration';

/** Ephemeral input and opening identity for this toolbar's transient menus. */
export function createToolbarMenuFocusOwner() {
  let keyboard = false;
  let pending: Omit<Opening, 'revision'> | null = null;
  let opening: Opening | null = null;
  let menu: string | null = null;
  let revision = 0;
  const marked = new Set<HTMLButtonElement>();

  const clearPointerPresentation = () => {
    for (const trigger of marked) trigger.removeAttribute(POINTER_FOCUS_ATTRIBUTE);
    marked.clear();
  };
  const onPointer = () => {
    keyboard = false;
  };
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    if (event.key === 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
    keyboard = true;
    clearPointerPresentation();
  };
  const onClick = (event: Event) => {
    if (!(event instanceof MouseEvent)) return;
    const trigger =
      getContentEventTargetElement(event)?.closest<HTMLButtonElement>('button.sniptale-btn');
    if (!trigger?.closest('.sniptale-toolbar-root') || trigger.disabled) return;
    if (
      !trigger.matches(
        "[aria-haspopup='menu'],[aria-haspopup='dialog'],[data-menu-indicator='true'],[data-menu-open]"
      )
    )
      return;
    pending = { trigger, keyboard };
  };
  return {
    bind() {
      const shadowRoot = resolveContentShadowRoot();
      const targets: EventTarget[] = shadowRoot ? [document, shadowRoot] : [document];
      // The activation bridge intentionally delivers non-composed mouse events inside this root.
      for (const target of targets) {
        target.addEventListener('pointerdown', onPointer, true);
        target.addEventListener('mousedown', onPointer, true);
        target.addEventListener('keydown', onKey, true);
        target.addEventListener('click', onClick, true);
      }
      return () => {
        for (const target of targets) {
          target.removeEventListener('pointerdown', onPointer, true);
          target.removeEventListener('mousedown', onPointer, true);
          target.removeEventListener('keydown', onKey, true);
          target.removeEventListener('click', onClick, true);
        }
        clearPointerPresentation();
        pending = null;
        opening = null;
      };
    },
    setMenu(next: string | null) {
      if (next === menu) return;
      menu = next;
      revision += 1;
      if (next === null) opening = null;
      else {
        opening = pending ? { ...pending, revision } : null;
        pending = null;
      }
    },
    snapshot() {
      return opening;
    },
    restore(snapshot: Opening | null) {
      if (!snapshot || menu !== null || revision !== snapshot.revision + 1) return;
      const { trigger } = snapshot;
      if (!trigger.isConnected || trigger.disabled) return;
      if (snapshot.keyboard) trigger.removeAttribute(POINTER_FOCUS_ATTRIBUTE);
      else {
        trigger.setAttribute(POINTER_FOCUS_ATTRIBUTE, 'pointer');
        marked.add(trigger);
      }
      trigger.focus({ preventScroll: true });
    },
  };
}
