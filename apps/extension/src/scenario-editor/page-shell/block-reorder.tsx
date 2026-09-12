import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { GripVertical } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

type Destination = { element: HTMLElement; after: boolean; beforeBlockId: string | undefined };
const ReorderSource = createContext<{
  disabled: boolean;
  start?: (event: PointerEvent<HTMLButtonElement>, blockId: string) => void;
  move?: (blockId: string, direction: -1 | 1) => void;
}>({ disabled: true });

function destination(
  container: HTMLElement,
  sourceId: string,
  x: number,
  y: number
): Destination | null {
  const bounds = container.getBoundingClientRect();
  if (
    x < bounds.left - 32 ||
    x > bounds.right + 16 ||
    y < bounds.top - 16 ||
    y > bounds.bottom + 16
  )
    return null;
  const blocks = [...container.querySelectorAll<HTMLElement>('.guide-block[data-block-id]')];
  let nearest = -1;
  let distance = Infinity;
  for (const [index, block] of blocks.entries()) {
    const rect = block.getBoundingClientRect();
    const dx = Math.max(rect.left - x, 0, x - rect.right);
    const dy = Math.max(rect.top - y, 0, y - rect.bottom);
    const next = dx * dx + dy * dy;
    if (next < distance) {
      nearest = index;
      distance = next;
    }
  }
  const block = blocks[nearest];
  if (!block) return null;
  const rect = block.getBoundingClientRect();
  const index = nearest + (y > rect.top + rect.height / 2 ? 1 : 0);
  const sourceIndex = blocks.findIndex((entry) => entry.dataset['blockId'] === sourceId);
  if (sourceIndex < 0 || index === sourceIndex || index === sourceIndex + 1) return null;
  const next = blocks[index];
  return next
    ? { element: next, after: false, beforeBlockId: next.dataset['blockId'] }
    : { element: blocks[blocks.length - 1]!, after: true, beforeBlockId: undefined };
}

function createPreview(block: HTMLElement) {
  const preview = block.cloneNode(true);
  if (!(preview instanceof HTMLElement)) throw new Error('Missing block preview');
  preview
    .querySelectorAll('button,.guide-insertion-chrome,.guide-image-tools,.guide-block-actions')
    .forEach((node) => node.remove());
  for (const node of [preview, ...preview.querySelectorAll<HTMLElement>('[id],[data-block-id]')]) {
    node.removeAttribute('id');
    node.removeAttribute('data-block-id');
  }
  preview.classList.add('guide-block-drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  const width = block.getBoundingClientRect().width;
  const scale = Math.min(1, 320 / Math.max(width, 1));
  preview.style.width = `${width}px`;
  preview.style.maxHeight = `${240 / scale}px`;
  block.closest('.guide-document')?.append(preview);
  return {
    element: preview,
    move: (x: number, y: number) => {
      const left = Math.max(8, Math.min(x + 16, innerWidth - width * scale - 8));
      const top = Math.max(8, Math.min(y + 16, innerHeight - preview.offsetHeight * scale - 8));
      preview.style.transform = `translate3d(${left}px,${top}px,0) scale(${scale})`;
    },
  };
}

/** One disposable pointer session owns capture, preview, cursor and canonical insertion marker. */
function startPointerReorder(
  event: PointerEvent<HTMLButtonElement>,
  container: HTMLElement,
  blockId: string,
  commit: (target: Destination) => void
) {
  const handle = event.currentTarget;
  const block = handle.closest<HTMLElement>('.guide-block');
  if (!block) return () => {};
  const pointerId = event.pointerId;
  const start = { x: event.clientX, y: event.clientY };
  let preview: ReturnType<typeof createPreview> | null = null;
  let target: Destination | null = null;
  let closed = false;
  let frame = 0;
  let position = start;
  const clearMarker = () => {
    target?.element.removeAttribute('data-reorder');
    target = null;
  };
  const cancel = () => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key);
    window.removeEventListener('blur', cancel);
    handle.removeEventListener('lostpointercapture', cancel);
    clearMarker();
    preview?.element.remove();
    preview = null;
    block.removeAttribute('data-drag-source');
    document.documentElement.removeAttribute('data-guide-reordering');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const place = () => {
    preview?.move(position.x, position.y);
    clearMarker();
    target = destination(container, blockId, position.x, position.y);
    if (target) target.element.dataset['reorder'] = target.after ? 'after' : 'before';
  };
  const scroll = () => {
    if (closed || !preview) return;
    const pane = container.closest<HTMLElement>('.guide-document-scroll');
    if (pane) {
      const rect = pane.getBoundingClientRect();
      const delta = position.y < rect.top + 36 ? -12 : position.y > rect.bottom - 36 ? 12 : 0;
      if (position.x >= rect.left && position.x <= rect.right && delta) {
        pane.scrollTop += delta;
        place();
      }
    }
    frame = requestAnimationFrame(scroll);
  };
  const move = (next: globalThis.PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    if (!preview && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 5) return;
    if (!preview) {
      preview = createPreview(block);
      block.dataset['dragSource'] = 'true';
      frame = requestAnimationFrame(scroll);
    }
    position = { x: next.clientX, y: next.clientY };
    place();
  };
  const finish = (next: globalThis.PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    const result = preview ? destination(container, blockId, next.clientX, next.clientY) : null;
    cancel();
    if (result) commit(result);
    if (handle.isConnected) handle.focus({ preventScroll: true });
  };
  const key = (next: KeyboardEvent) => {
    if (next.key !== 'Escape') return;
    next.preventDefault();
    next.stopPropagation();
    cancel();
  };
  event.preventDefault();
  event.stopPropagation();
  handle.focus({ preventScroll: true });
  handle.setPointerCapture(pointerId);
  document.documentElement.dataset['guideReordering'] = 'true';
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key);
  window.addEventListener('blur', cancel);
  handle.addEventListener('lostpointercapture', cancel);
  return cancel;
}

/** Only a finished gesture publishes the existing project operation; image drops remain native. */
export function GuideBlockReorder({
  projectId,
  item,
  disabled,
  onOperate,
  children,
}: {
  projectId: string;
  item: GuideStep;
  disabled: boolean;
  onOperate: (operation: GuideStructureOperation) => void;
  children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => {
    cancel.current?.();
    return () => cancel.current?.();
  }, [projectId, item.id, item.blocks, disabled]);
  return (
    <ReorderSource.Provider
      value={{
        disabled,
        start: (event, blockId) => {
          if (disabled || event.button !== 0 || event.isPrimary === false || !container.current)
            return;
          cancel.current?.();
          cancel.current = startPointerReorder(event, container.current, blockId, (target) =>
            onOperate({
              kind: 'reorder-block',
              itemId: item.id,
              blockId,
              ...(target.beforeBlockId ? { beforeBlockId: target.beforeBlockId } : {}),
            })
          );
        },
        move: (blockId, direction) => {
          const index = item.blocks.findIndex((block) => block.id === blockId);
          if (
            disabled ||
            index < 0 ||
            index + direction < 0 ||
            index + direction >= item.blocks.length
          )
            return;
          cancel.current?.();
          onOperate({ kind: 'move-block', itemId: item.id, blockId, direction });
        },
      }}
    >
      <div ref={container} className="guide-step-blocks">
        {children}
      </div>
    </ReorderSource.Provider>
  );
}

/** The external grip supports pointer movement and keyboard arrows without intercepting text. */
export function GuideBlockReorderHandle({ blockId, t }: { blockId: string; t: Translate }) {
  const source = useContext(ReorderSource);
  return (
    <ContentToolbarButton
      className="guide-block-grip"
      title={t('scenario.editor.guideReorderBlock')}
      disabled={source.disabled}
      onPointerDown={(event) => source.start?.(event, blockId)}
      onKeyDown={(event) => {
        if (source.disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        event.stopPropagation();
        source.move?.(blockId, event.key === 'ArrowUp' ? -1 : 1);
      }}
    >
      <GripVertical size={15} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
