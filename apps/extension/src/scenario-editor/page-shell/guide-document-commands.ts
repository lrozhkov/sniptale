import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import type { GuideBlock, GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import {
  createGuideParagraphs,
  type GuideStructureOperation,
} from '../../features/scenario/project/public';

export type GuideDocumentCommandInputs = {
  project: GuideProject;
  disabled: boolean;
  onChange: (project: GuideProject, group?: string | null) => void;
  onOperate: (operation: GuideStructureOperation) => void;
  onEditImage: (itemId: string, blockId: string) => void;
  onUploadImage: (
    itemId: string,
    blockId: string | null,
    file: File,
    signal: AbortSignal
  ) => Promise<boolean>;
  onFrameImage: (itemId: string, blockId: string, editing: boolean) => void;
};

/** Retained fields patch the latest committed document through its existing state owner. */
export function useGuideDocumentCommands(inputs: GuideDocumentCommandInputs) {
  const latest = useRef<GuideDocumentCommandInputs | null>(null);
  useLayoutEffect(() => {
    latest.current = inputs;
    return () => {
      latest.current = null;
    };
  });
  const projectId = inputs.project.id;
  const current = useCallback(() => {
    const value = latest.current;
    return value?.project.id === projectId && !value.disabled ? value : null;
  }, [projectId]);
  return useMemo(() => {
    const changeItem = (
      itemId: string,
      update: (item: GuideProject['items'][number]) => GuideProject['items'][number],
      group: string | null
    ) => {
      const value = current();
      const item = value?.project.items.find((entry) => entry.id === itemId);
      if (!value || !item) return;
      const next = update(item);
      if (next === item) return;
      value.onChange(
        {
          ...value.project,
          items: value.project.items.map((entry) => (entry.id === itemId ? next : entry)),
        },
        group
      );
    };
    return {
      onTitleChange: (itemId: string, title: string) => {
        const item = current()?.project.items.find((entry) => entry.id === itemId);
        if (item)
          changeItem(itemId, (entry) => ({ ...entry, title }), `${item.kind}-title:${itemId}`);
      },
      onParagraphsChange: (itemId: string, text: string) =>
        changeItem(
          itemId,
          (item) =>
            item.kind === 'section' ? { ...item, paragraphs: createGuideParagraphs(text) } : item,
          `section-body:${itemId}`
        ),
      onChangeBlock: (itemId: string, block: GuideBlock, group: string | null) =>
        changeItem(
          itemId,
          (item) =>
            item.kind === 'step' && item.blocks.some((entry) => entry.id === block.id)
              ? {
                  ...item,
                  blocks: item.blocks.map((entry) => (entry.id === block.id ? block : entry)),
                }
              : item,
          group
        ),
      onOperate: (operation: GuideStructureOperation) => current()?.onOperate(operation),
      onEditImage: (itemId: string, blockId: string) => current()?.onEditImage(itemId, blockId),
      onFrameImage: (itemId: string, blockId: string, editing: boolean) =>
        current()?.onFrameImage(itemId, blockId, editing),
      onUploadImage: (itemId: string, blockId: string | null, file: File, signal: AbortSignal) =>
        current()?.onUploadImage(itemId, blockId, file, signal) ?? Promise.resolve(false),
    };
  }, [current]);
}
