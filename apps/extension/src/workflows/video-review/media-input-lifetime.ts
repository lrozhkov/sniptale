/** Callers construct their audio/video Input after the existing lazy or static import. */
export function bindReviewMediaInput(input: { dispose(): void }, signal: AbortSignal): () => void {
  const abort = () => input.dispose();
  signal.addEventListener('abort', abort, { once: true });
  return () => {
    signal.removeEventListener('abort', abort);
    input.dispose();
  };
}
