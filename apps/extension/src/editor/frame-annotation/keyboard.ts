import React from 'react';

import {
  canMutateFrameAnnotationProxy,
  collectFrameAnnotationProxies,
  commitFrameAnnotationProxy,
  createFrameAnnotationProxy,
  synchronizeFrameAnnotationAutoStepBadges,
} from './proxy';
import type { EditorFrameAnnotationPlaneController } from './types';
import { createFrameAnnotationLayerLabel } from './layer-label';

export function useFrameAnnotationKeyboard(input: {
  commitPendingDraft: () => void;
  controller: EditorFrameAnnotationPlaneController;
  forceRender: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}) {
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!input.selectedId || isEditableTarget(event.target)) return;
      input.commitPendingDraft();
      const canvas = input.controller.canvas;
      const entries = collectFrameAnnotationProxies(canvas?.getObjects?.() ?? []);
      const selected = entries.find((entry) => entry.snapshot.id === input.selectedId);
      if (!selected) return;

      if (event.key === 'Escape') {
        input.setSelectedId(null);
        canvas?.requestRenderAll();
        consume(event);
        return;
      }
      if (!canMutateFrameAnnotationProxy(selected.object)) return;
      if (event.key === 'Delete' || event.key === 'Backspace') {
        canvas?.remove(selected.object);
        synchronizeFrameAnnotationAutoStepBadges(canvas?.getObjects?.() ?? []);
        input.setSelectedId(null);
        finishMutation(input);
        consume(event);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        const id = crypto.randomUUID();
        const snapshot = {
          ...selected.snapshot,
          id,
          ordering: entries.length,
          x: selected.snapshot.x + 24,
          y: selected.snapshot.y + 24,
        };
        const duplicate = createFrameAnnotationProxy({
          frame: snapshot,
          label: createFrameAnnotationLayerLabel(entries.length + 1),
          ordering: snapshot.ordering,
        });
        input.controller.prepareObject(duplicate);
        canvas?.add(duplicate);
        synchronizeFrameAnnotationAutoStepBadges(canvas?.getObjects?.() ?? []);
        input.setSelectedId(id);
        finishMutation(input);
        consume(event);
        return;
      }
      const delta = resolveArrowDelta(event);
      if (!delta) return;
      commitFrameAnnotationProxy(selected.object, {
        ...selected.snapshot,
        x: selected.snapshot.x + delta.x,
        y: selected.snapshot.y + delta.y,
      });
      finishMutation(input);
      consume(event);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [input]);
}

function finishMutation(input: {
  controller: EditorFrameAnnotationPlaneController;
  forceRender: () => void;
}) {
  input.controller.canvas?.requestRenderAll();
  input.controller.commitHistory();
  input.controller.syncRuntimeState();
  input.forceRender();
}

function resolveArrowDelta(event: KeyboardEvent): { x: number; y: number } | null {
  const distance = event.shiftKey ? 10 : 1;
  if (event.key === 'ArrowLeft') return { x: -distance, y: 0 };
  if (event.key === 'ArrowRight') return { x: distance, y: 0 };
  if (event.key === 'ArrowUp') return { x: 0, y: -distance };
  if (event.key === 'ArrowDown') return { x: 0, y: distance };
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select, [role="textbox"]'))
  );
}

function consume(event: KeyboardEvent) {
  event.preventDefault();
  event.stopImmediatePropagation();
}
