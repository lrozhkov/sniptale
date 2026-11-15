import type { EditorDocument } from '../../../features/editor/document/types';

type PendingSnapshot = {
  document: EditorDocument;
  isCurrent: () => boolean;
  onCommitted: () => void;
  onFailure: (error: unknown) => void;
};

/** Gives the completed canvas a rendering opportunity before history encoding. */
export function scheduleEditorHistoryAfterPaint(callback: () => void): () => void {
  let task: number | undefined;
  let frame = 0;
  const enqueue = () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    task = window.setTimeout(callback, 0);
  };
  const onVisibilityChange = () => {
    if (!document.hidden) return;
    window.cancelAnimationFrame(frame);
    enqueue();
  };
  if (document.hidden) enqueue();
  else {
    document.addEventListener('visibilitychange', onVisibilityChange);
    frame = window.requestAnimationFrame(enqueue);
  }
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.cancelAnimationFrame(frame);
    if (task !== undefined) window.clearTimeout(task);
  };
}

/** Owns captured snapshots until they enter the existing encoded history. */
export function createDeferredEditorHistory(options: {
  revision: () => number;
  commit: (document: EditorDocument) => void;
  schedule: (callback: () => void) => () => void;
  maxPending: number;
}) {
  const pending: PendingSnapshot[] = [];
  let expectedRevision = options.revision();
  let cancelScheduled: (() => void) | undefined;
  let flushing = false;
  let generation = 0;
  const stop = () => {
    cancelScheduled?.();
    cancelScheduled = undefined;
    generation += 1;
  };
  const cancel = () => {
    stop();
    pending.length = 0;
    expectedRevision = options.revision();
  };
  const flush = () => {
    if (flushing || !pending.length) return;
    stop();
    if (expectedRevision !== options.revision() || !pending[0]!.isCurrent()) {
      cancel();
      return;
    }
    flushing = true;
    let onCommitted: (() => void) | undefined;
    try {
      while (pending.length) {
        const item = pending[0]!;
        if (!item.isCurrent()) {
          cancel();
          break;
        }
        options.commit(item.document);
        pending.shift();
        expectedRevision = options.revision();
        onCommitted = item.onCommitted;
      }
    } finally {
      flushing = false;
    }
    onCommitted?.();
  };
  return {
    enqueue(item: PendingSnapshot) {
      if (pending.length >= options.maxPending) flush();
      if (!pending.length) expectedRevision = options.revision();
      pending.push(item);
      if (cancelScheduled) return;
      const admittedGeneration = generation;
      cancelScheduled = options.schedule(() => {
        if (admittedGeneration !== generation) return;
        try {
          flush();
        } catch (error) {
          pending[0]?.onFailure(error);
        }
      });
    },
    flush,
    cancel,
    getCount: () => pending.length,
    peek: () => pending.at(-1)?.document ?? null,
  };
}
