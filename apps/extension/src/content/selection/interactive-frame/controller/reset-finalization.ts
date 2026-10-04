type ResetFinalizer = { finish: () => void; priority: number };
const finalizers = new Set<ResetFinalizer>();

export function registerInteractiveFrameResetFinalizer(
  finish: () => void,
  priority = 1
): () => void {
  const finalizer = { finish, priority };
  finalizers.add(finalizer);
  return () => finalizers.delete(finalizer);
}

export function finalizeInteractiveFrameEditsForReset(): void {
  for (const finalizer of [...finalizers].sort((a, b) => a.priority - b.priority)) {
    finalizer.finish();
  }
}
