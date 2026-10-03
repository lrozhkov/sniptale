import { createContext, useContext, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type {
  GuideProject,
  GuideImageBlock,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import { commitGuideImageGesture, hasSameGuideImageGestureBase } from './image-geometry';

type Draft = { projectId: string; itemId: string; origin: GuideImageBlock; block: GuideImageBlock };
type Session = {
  block: GuideImageBlock;
  display: GuideImageBlock;
  preview: (block: GuideImageBlock) => void;
  change: (block: GuideImageBlock) => void;
  cancel: () => void;
};
const Framing = createContext<Session | null>(null);
export const GuideImageFramingProvider = Framing.Provider;
export const useGuideImageFraming = () => useContext(Framing);

/** A whole framing session is disposable; only Done reaches canonical project history. */
export function useGuideImageFramingSession(
  project: GuideProject | null,
  update: (project: GuideProject, group?: string | null) => void
) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<GuideImageBlock | null>(null);
  const current = useRef(draft);
  const latest = useRef({ project, update });
  const cancel = useCallback(() => {
    current.current = null;
    setDraft(null);
    setPreview(null);
  }, []);
  useLayoutEffect(() => {
    latest.current = { project, update };
    if (current.current && !validImage(project, current.current)) cancel();
  }, [project, update, cancel]);
  const change = (block: GuideImageBlock) => {
    const active = current.current;
    if (!active || block.id !== active.origin.id || block.assetId !== active.origin.assetId) return;
    setPreview(null);
    current.current = { ...active, block };
    setDraft(current.current);
  };
  return {
    session:
      draft && validImage(project, draft)
        ? {
            block: draft.block,
            display: preview?.id === draft.block.id ? preview : draft.block,
            preview: setPreview,
            change,
            cancel,
          }
        : null,
    cancel,
    begin: (itemId: string, block: GuideImageBlock) => {
      if (!project) return;
      setPreview(null);
      current.current = { projectId: project.id, itemId, origin: block, block };
      setDraft(current.current);
    },
    commit: () => {
      const active = current.current;
      const { project: saved, update: apply } = latest.current;
      const image = active && validImage(saved, active);
      cancel();
      if (!active || !saved || !image) return;
      const next = commitGuideImageGesture(image, active.origin, active.block);
      if (!next || next === image) return;
      apply(
        {
          ...saved,
          items: saved.items.map((item) =>
            item.id === active.itemId && item.kind === 'step'
              ? {
                  ...item,
                  blocks: item.blocks.map((block) => (block.id === image.id ? next : block)),
                }
              : item
          ),
        },
        null
      );
    },
  };
}
function validImage(project: GuideProject | null, draft: Draft): GuideImageBlock | null {
  if (project?.id !== draft.projectId) return null;
  const item = project.items.find((item) => item.id === draft.itemId);
  const block =
    item?.kind === 'step' ? item.blocks.find((block) => block.id === draft.origin.id) : null;
  return block?.kind === 'image' && hasSameGuideImageGestureBase(block, draft.origin)
    ? block
    : null;
}
