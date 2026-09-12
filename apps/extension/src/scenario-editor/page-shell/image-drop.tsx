import { useEffect, useRef, type DragEvent, type ReactNode } from 'react';
import { z } from 'zod';
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

function resolveTarget(target: EventTarget | null, root: HTMLElement, project: GuideProject) {
  if (!(target instanceof Element)) return null;
  const article = target.closest('article');
  if (!(article instanceof HTMLElement) || !root.contains(article)) return null;
  const step = project.items.find((item) => item.id === article.id);
  if (step?.kind !== 'step') return null;
  const element = target.closest<HTMLElement>('[data-block-id]');
  const block = step.blocks.find((entry) => entry.id === element?.dataset['blockId']);
  if (element && (block?.kind === 'image' || block?.kind === 'image-slot'))
    return {
      element,
      placement: { kind: 'replace-image', stepId: step.id, blockId: block.id } as const,
    };
  return { element: article, placement: { kind: 'blocks', stepId: step.id } as const };
}

/** One receiver owns transient drag feedback; edits use the existing command and import owners. */
export function GuideImageDropZone({
  project,
  disabled,
  onPlace,
  onImport,
  children,
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
}) {
  const highlight = useRef<HTMLElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const clear = () => {
    highlight.current?.removeAttribute('data-image-drop');
    highlight.current = null;
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
  return (
    <div
      className="guide-drop-zone"
      onDragOver={(event) => {
        clear();
        if (!supports(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'none';
        if (disabled || pending.current) return;
        const target = resolveTarget(event.target, event.currentTarget, project);
        if (!target) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        highlight.current = target.element;
        target.element.setAttribute('data-image-drop', target.placement.kind);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          clear();
      }}
      onDrop={(event) => {
        clear();
        if (!supports(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (disabled || pending.current) return;
        const target = resolveTarget(event.target, event.currentTarget, project);
        if (!target) return;
        if (event.dataTransfer.types.includes(GUIDE_IMAGE_DRAG_TYPE)) {
          const source = readResource(event.dataTransfer.getData(GUIDE_IMAGE_DRAG_TYPE));
          if (!source || !('projectId' in source) || source.projectId !== project.id) return;
          onPlace({
            kind: 'place-image',
            sourceBlockId: source.blockId,
            itemId: target.placement.stepId,
            ...(target.placement.kind === 'replace-image'
              ? { blockId: target.placement.blockId }
              : {}),
          });
          return;
        }
        let sources: GuideImageImportSource[];
        if (event.dataTransfer.types.includes(GUIDE_LIBRARY_IMAGE_DRAG_TYPE)) {
          const source = readResource(
            event.dataTransfer.getData(GUIDE_LIBRARY_IMAGE_DRAG_TYPE),
            true
          );
          if (!source || !('mediaId' in source)) return;
          sources = [{ kind: 'library', mediaId: source.mediaId }];
        } else
          sources = Array.from(event.dataTransfer.files).map((file) => ({ kind: 'file', file }));
        if (!sources.length) return;
        const controller = new AbortController();
        pending.current = controller;
        void onImport(sources, target.placement, controller.signal).finally(() => {
          if (pending.current === controller) pending.current = null;
        });
      }}
    >
      {children}
    </div>
  );
}
