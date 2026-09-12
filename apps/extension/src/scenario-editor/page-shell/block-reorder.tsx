import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type DragEvent,
  type ReactNode,
} from 'react';
import { GripVertical } from 'lucide-react';
import { z } from 'zod';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { GUIDE_LIMITS, type GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';

const MIME = 'application/x-sniptale-guide-block';
const id = z.string().min(1).max(GUIDE_LIMITS.maxIdLength);
const schema = z.object({ projectId: id, itemId: id, blockId: id }).strict();
const ReorderSource = createContext<{
  projectId: string;
  itemId: string;
  disabled: boolean;
  move?: (blockId: string, direction: -1 | 1) => void;
}>({ projectId: '', itemId: '', disabled: true });

function readSource(text: string) {
  if (text.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(text);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function destination(event: DragEvent<HTMLDivElement>, item: GuideStep) {
  if (!(event.target instanceof Element)) return null;
  const element = event.target.closest<HTMLElement>('[data-block-id]');
  if (!element || !event.currentTarget.contains(element)) return null;
  const index = item.blocks.findIndex((block) => block.id === element.dataset['blockId']);
  if (index < 0) return null;
  const rect = element.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  return { element, after, beforeBlockId: item.blocks[index + (after ? 1 : 0)]?.id };
}

/** Native reorder owns only a transient insertion marker; the project command owns the edit. */
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
  const marker = useRef<HTMLElement | null>(null);
  const clear = () => {
    marker.current?.removeAttribute('data-reorder');
    marker.current = null;
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    window.addEventListener('dragend', clear);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('keydown', escape);
      clear();
    };
  }, []);
  useEffect(() => {
    if (disabled) clear();
  }, [disabled]);
  return (
    <ReorderSource.Provider
      value={{
        projectId,
        itemId: item.id,
        disabled,
        move: (blockId, direction) => {
          const index = item.blocks.findIndex((block) => block.id === blockId);
          if (
            disabled ||
            index < 0 ||
            index + direction < 0 ||
            index + direction >= item.blocks.length
          )
            return;
          onOperate({ kind: 'move-block', itemId: item.id, blockId, direction });
        },
      }}
    >
      <div
        className="guide-step-blocks"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          clear();
          event.dataTransfer.dropEffect = 'none';
          if (disabled) return;
          const target = destination(event, item);
          if (!target) return;
          event.dataTransfer.dropEffect = 'move';
          marker.current = target.element;
          target.element.dataset['reorder'] = target.after ? 'after' : 'before';
        }}
        onDragLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !event.currentTarget.contains(event.relatedTarget)
          )
            clear();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(MIME)) return;
          event.preventDefault();
          event.stopPropagation();
          clear();
          if (disabled) return;
          const source = readSource(event.dataTransfer.getData(MIME));
          if (!source || source.projectId !== projectId || source.itemId !== item.id) return;
          const index = item.blocks.findIndex((block) => block.id === source.blockId);
          const target = destination(event, item);
          if (
            index < 0 ||
            !target ||
            target.beforeBlockId === source.blockId ||
            target.beforeBlockId === item.blocks[index + 1]?.id
          )
            return;
          onOperate({
            kind: 'reorder-block',
            itemId: item.id,
            blockId: source.blockId,
            ...(target.beforeBlockId ? { beforeBlockId: target.beforeBlockId } : {}),
          });
        }}
      >
        {children}
      </div>
    </ReorderSource.Provider>
  );
}

/** The grip, rather than image or text content, initiates block movement. */
export function GuideBlockReorderHandle({ blockId, t }: { blockId: string; t: Translate }) {
  const source = useContext(ReorderSource);
  return (
    <ContentToolbarButton
      className="guide-block-grip"
      title={t('scenario.editor.guideReorderBlock')}
      disabled={source.disabled}
      draggable={!source.disabled}
      onKeyDown={(event) => {
        if (source.disabled || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
        event.preventDefault();
        event.stopPropagation();
        source.move?.(blockId, event.key === 'ArrowUp' ? -1 : 1);
      }}
      onDragStart={(event) => {
        if (source.disabled) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(
          MIME,
          JSON.stringify({ projectId: source.projectId, itemId: source.itemId, blockId })
        );
      }}
    >
      <GripVertical size={15} aria-hidden="true" />
    </ContentToolbarButton>
  );
}
