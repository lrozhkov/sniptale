import {
  guideBlockDropTarget,
  readGuideBlockWidth,
  type GuideDropTarget,
} from './block-drop-target';
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

type Destination = GuideDropTarget;
const ReorderSource = createContext<{
  disabled: boolean;
  start?: (event: PointerEvent<HTMLButtonElement>, blockId: string) => void;
  move?: (blockId: string, direction: -1 | 1) => void;
  join?: (blockId: string, direction: -1 | 1) => void;
}>({ disabled: true });

function destination(
  container: HTMLElement,
  sourceId: string,
  x: number,
  y: number,
  sourceWidth: number
): Destination | null {
  const pane = container.closest<HTMLElement>('.guide-document-scroll');
  if (pane) {
    const rect = pane.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  }
  const document = container.closest('.guide-document');
  const candidates = document
    ? [...document.querySelectorAll<HTMLElement>('[data-reorder-step]')]
    : [container];
  const target = candidates.find((candidate) => {
    if (candidate.dataset['reorderDisabled'] === 'true') return false;
    const rect = (candidate.closest('article') ?? candidate).getBoundingClientRect();
    return (
      x >= rect.left - 32 && x <= rect.right + 16 && y >= rect.top - 16 && y <= rect.bottom + 16
    );
  });
  return target ? guideBlockDropTarget(target, sourceId, x, y, sourceWidth) : null;
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
  const sourceWidth = readGuideBlockWidth(block);
  const markers: HTMLElement[] = [];
  let closed = false;
  let frame = 0;
  let position = start;
  const clearMarker = () => {
    target?.element.removeAttribute('data-reorder');
    for (const marker of markers) marker.remove();
    markers.length = 0;
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
    if (preview) {
      handle.blur();
      block.dataset['reorderResting'] = 'true';
    }
    preview?.element.remove();
    preview = null;
    block.removeAttribute('data-drag-source');
    document.documentElement.removeAttribute('data-guide-reordering');
    if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
  };
  const place = () => {
    preview?.move(position.x, position.y);
    clearMarker();
    target = destination(container, blockId, position.x, position.y, sourceWidth);
    if (target) {
      target.element.dataset['reorder'] = target.placement;
      const shapes = [
        { ...target.preview, percent: target.width },
        ...(target.neighbor ? [target.neighbor] : []),
      ];
      for (const shape of shapes) {
        const marker = document.createElement('div');
        marker.className = 'guide-block-drop-preview';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = shape.height > 4 ? `${shape.percent}%` : '';
        Object.assign(marker.style, {
          left: `${shape.left}px`,
          top: `${shape.top}px`,
          width: `${shape.width}px`,
          height: `${shape.height}px`,
        });
        block.closest('.guide-document')?.append(marker);
        markers.push(marker);
      }
    }
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
      document.documentElement.dataset['guideReordering'] = 'true';
      preview = createPreview(block);
      block.dataset['dragSource'] = 'true';
      frame = requestAnimationFrame(scroll);
    }
    position = { x: next.clientX, y: next.clientY };
    place();
  };
  const finish = (next: globalThis.PointerEvent) => {
    if (next.pointerId !== pointerId) return;
    const result = preview
      ? destination(container, blockId, next.clientX, next.clientY, sourceWidth)
      : null;
    cancel();
    if (result) commit(result);
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
  const operate = useRef(onOperate);
  operate.current = onOperate;
  const cancel = useRef<(() => void) | null>(null);
  // Autosave republishes equivalent objects; only authored content changes cancel the gesture.
  const content = JSON.stringify(item.blocks, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
        )
      : value
  );
  useEffect(() => {
    cancel.current?.();
    return () => cancel.current?.();
  }, [projectId, item.id, content, disabled]);
  return (
    <ReorderSource.Provider
      value={{
        disabled,
        start: (event, blockId) => {
          if (disabled || event.button !== 0 || event.isPrimary === false || !container.current)
            return;
          cancel.current?.();
          cancel.current = startPointerReorder(event, container.current, blockId, (target) =>
            operate.current({
              kind: 'place-block',
              itemId: item.id,
              targetItemId: target.itemId,
              blockId,
              placement: target.placement,
              ...(target.anchorBlockId ? { anchorBlockId: target.anchorBlockId } : {}),
            })
          );
        },
        join: (blockId, direction) => {
          const index = item.blocks.findIndex((block) => block.id === blockId);
          const anchor = item.blocks[index + direction];
          if (disabled || index < 0 || !anchor) return;
          cancel.current?.();
          onOperate({
            kind: 'place-block',
            itemId: item.id,
            targetItemId: item.id,
            blockId,
            anchorBlockId: anchor.id,
            placement: direction === -1 ? 'after' : 'before',
          });
          const host = container.current;
          requestAnimationFrame(() => {
            if (!host?.isConnected) return;
            const moved = [...host.querySelectorAll<HTMLElement>('[data-block-id]')].find(
              (block) => block.dataset['blockId'] === blockId
            );
            moved
              ?.querySelector<HTMLButtonElement>('.guide-block-grip')
              ?.focus({ preventScroll: true });
          });
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
      <div
        ref={container}
        className="guide-step-blocks"
        data-reorder-step={item.id}
        data-reorder-disabled={disabled}
        onPointerMove={(event) => {
          event.currentTarget.querySelectorAll('[data-reorder-resting]').forEach((block) => {
            block.removeAttribute('data-reorder-resting');
          });
        }}
      >
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
        if (
          source.disabled ||
          !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          source.join?.(blockId, event.key === 'ArrowLeft' ? -1 : 1);
        else source.move?.(blockId, event.key === 'ArrowUp' ? -1 : 1);
      }}
    >
      <GripVertical size={15} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
