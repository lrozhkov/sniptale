import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { z } from 'zod';
import type { Translate } from '../../platform/i18n';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import type {
  GuideImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';

/** Drag data identifies an existing image; canonical project state supplies all resource refs. */
export const GUIDE_IMAGE_DRAG_TYPE = 'application/x-sniptale-guide-image';
/** Library drag payloads contain an identity, never a URL or trusted resource reference. */
export const GUIDE_LIBRARY_IMAGE_DRAG_TYPE = 'application/x-sniptale-library-image';
const librarySchema = z
  .object({ mediaId: z.string().min(1).max(GUIDE_LIMITS.maxIdLength) })
  .strict();
const resourceSchema = z
  .object({
    projectId: z.string().min(1).max(GUIDE_LIMITS.maxIdLength),
    blockId: z.string().min(1).max(GUIDE_LIMITS.maxIdLength),
  })
  .strict();

function readResource(text: string, library = false) {
  if (text.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(text);
    const result = (library ? librarySchema : resourceSchema).safeParse(value);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function resolveTarget(
  target: EventTarget | null,
  root: HTMLElement,
  project: GuideProject,
  x = 0,
  y = 0
) {
  if (!(target instanceof Element)) return null;
  const canvas = target.closest<HTMLElement>('.guide-document-scroll');
  if (!canvas || !root.contains(canvas)) return null;
  const boundary = target.closest<HTMLElement>('.guide-insertion-item');
  if (boundary) return itemTarget(boundary, project);
  const article = target.closest<HTMLElement>('article');
  const step = project.items.find((item) => item.id === article?.id);
  if (article && step?.kind === 'step') {
    const element = target.closest<HTMLElement>('[data-block-id]');
    const block = step.blocks.find((entry) => entry.id === element?.dataset['blockId']);
    if (element && (block?.kind === 'image' || block?.kind === 'image-slot'))
      return {
        element,
        placement: { kind: 'replace-image', stepId: step.id, blockId: block.id } as const,
      };
    return { element: article, placement: { kind: 'blocks', stepId: step.id } as const };
  }
  if (project.purpose === 'step-template' && project.items[0]?.kind === 'step')
    return { element: canvas, placement: { kind: 'blocks', stepId: project.items[0].id } as const };
  // Only the document's inter-item whitespace inserts before an item; side margins append.
  for (const element of canvas.querySelectorAll<HTMLElement>('.guide-insertion-item')) {
    const next = element.nextElementSibling;
    if (!(next instanceof HTMLElement)) continue;
    const rect = next.getBoundingClientRect();
    const previous = element.previousElementSibling?.getBoundingClientRect();
    const top = previous?.bottom ?? canvas.getBoundingClientRect().top;
    if (rect.width > 0 && x >= rect.left && x <= rect.right && y >= top && y <= rect.top)
      return itemTarget(element, project);
  }
  return { element: canvas, placement: { kind: 'steps' } as const };
}

function itemTarget(element: HTMLElement, project: GuideProject) {
  if (element.dataset['end'] === 'true') return { element, placement: { kind: 'steps' } as const };
  const before = element.dataset['insertBefore'];
  if (before === undefined || !project.items.some((item) => item.id === before)) return null;
  return { element, placement: { kind: 'steps', beforeItemId: before } as const };
}

/** One receiver owns transient drag feedback; edits use the existing command and import owners. */
export function GuideImageDropZone({
  project,
  disabled,
  onPlace,
  onImport,
  children,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  onPlace: (operation: GuideStructureOperation) => void;
  onImport: (
    sources: GuideImageImportSource[],
    placement: GuideImageImportPlacement,
    signal: AbortSignal
  ) => Promise<boolean>;
  children: ReactNode;
  t: Translate;
}) {
  const highlight = useRef<HTMLElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [feedback, setFeedback] = useState('');
  const clear = () => {
    highlight.current?.removeAttribute('data-image-drop');
    highlight.current?.removeAttribute('data-image-drop-label');
    highlight.current = null;
    setFeedback('');
  };
  useEffect(() => {
    const cancel = () => clear();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    window.addEventListener('dragend', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('dragend', cancel);
      window.removeEventListener('keydown', key);
      clear();
      pending.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (disabled) clear();
  }, [disabled]);
  const supports = (event: DragEvent<HTMLDivElement>) =>
    event.dataTransfer.types.includes(GUIDE_IMAGE_DRAG_TYPE) ||
    event.dataTransfer.types.includes(GUIDE_LIBRARY_IMAGE_DRAG_TYPE) ||
    event.dataTransfer.types.includes('Files');
  const importImages = (
    sources: GuideImageImportSource[],
    placement: GuideImageImportPlacement
  ) => {
    if (!sources.length || disabled || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    void onImport(sources, placement, controller.signal)
      .catch(() => {
        if (!controller.signal.aborted) setFeedback(t('scenario.editor.guideImportFailed'));
      })
      .finally(() => {
        if (pending.current === controller) pending.current = null;
      });
  };
  return (
    <div
      className="guide-drop-zone"
      onDragOver={(event) => {
        clear();
        if (!supports(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
        if (disabled || pending.current) return;
        const target = resolveTarget(
          event.target,
          event.currentTarget,
          project,
          event.clientX,
          event.clientY
        );
        if (!target) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        highlight.current = target.element;
        target.element.setAttribute('data-image-drop', target.placement.kind);
        const label = t(
          target.placement.kind === 'replace-image'
            ? 'scenario.editor.guideDropReplace'
            : target.placement.kind === 'blocks'
              ? 'scenario.editor.guideDropBlock'
              : 'beforeItemId' in target.placement
                ? 'scenario.editor.guideDropBefore'
                : 'scenario.editor.guideDropAppend'
        );
        target.element.setAttribute('data-image-drop-label', label);
        setFeedback(label);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          clear();
      }}
      onPaste={(event) => {
        if (event.defaultPrevented || !event.clipboardData.files.length) return;
        if (
          event.target instanceof Element &&
          event.target.closest('textarea,input,[contenteditable="true"]')
        )
          return;
        const target = resolveTarget(event.target, event.currentTarget, project);
        if (!target) return;
        event.preventDefault();
        importImages(
          Array.from(event.clipboardData.files).map((file) => ({ kind: 'file', file })),
          target.placement
        );
      }}
      onDrop={(event) => {
        clear();
        if (!supports(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (disabled || pending.current) return;
        const target = resolveTarget(
          event.target,
          event.currentTarget,
          project,
          event.clientX,
          event.clientY
        );
        if (!target) return;
        const input = readDrop(event.dataTransfer, project.id, target.placement);
        if (input?.kind === 'operation') onPlace(input.operation);
        else if (input) importImages(input.sources, target.placement);
      }}
    >
      {children}
      {feedback && (
        <span className="guide-drop-announcement" role="status">
          {feedback}
        </span>
      )}
    </div>
  );
}

/** Decodes one transfer without acquiring assets or trusting resource references from drag data. */
function readDrop(
  transfer: DataTransfer,
  projectId: string,
  placement: GuideImageImportPlacement
):
  | { kind: 'operation'; operation: GuideStructureOperation }
  | { kind: 'import'; sources: GuideImageImportSource[] }
  | null {
  if (transfer.types.includes(GUIDE_IMAGE_DRAG_TYPE)) {
    const source = readResource(transfer.getData(GUIDE_IMAGE_DRAG_TYPE));
    if (!source || !('projectId' in source) || source.projectId !== projectId) return null;
    return {
      kind: 'operation',
      operation: {
        kind: 'place-image',
        sourceBlockId: source.blockId,
        ...(placement.kind === 'steps'
          ? placement.beforeItemId === undefined
            ? {}
            : { beforeItemId: placement.beforeItemId }
          : {
              itemId: placement.stepId,
              ...(placement.kind === 'replace-image' ? { blockId: placement.blockId } : {}),
            }),
      },
    };
  }
  if (transfer.types.includes(GUIDE_LIBRARY_IMAGE_DRAG_TYPE)) {
    const source = readResource(transfer.getData(GUIDE_LIBRARY_IMAGE_DRAG_TYPE), true);
    if (!source || !('mediaId' in source)) return null;
    return { kind: 'import', sources: [{ kind: 'library', mediaId: source.mediaId }] };
  }
  return {
    kind: 'import',
    sources: Array.from(transfer.files).map((file) => ({ kind: 'file', file })),
  };
}
