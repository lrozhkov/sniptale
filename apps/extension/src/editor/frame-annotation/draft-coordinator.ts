type FlushDraft = () => void;

let activeFlushDraft: FlushDraft | null = null;

export function registerFrameAnnotationDraftFlusher(flush: FlushDraft): () => void {
  activeFlushDraft = flush;
  return () => {
    if (activeFlushDraft === flush) activeFlushDraft = null;
  };
}

export function flushActiveFrameAnnotationDraft(): void {
  activeFlushDraft?.();
}
