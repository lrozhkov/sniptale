import type { Canvas } from 'fabric';

const pendingSceneMutations = new WeakMap<Canvas, Promise<void>>();

/** Serialize frame and browser-header mutations on their shared canvas; failures release the next turn. */
export function enqueueEditorSceneMutation<T>(
  canvas: Canvas | null,
  operation: () => Promise<T>
): Promise<T> {
  if (!canvas) return operation();
  const previous = pendingSceneMutations.get(canvas) ?? Promise.resolve();
  const result = previous.then(operation);
  const settled = result.then(
    () => undefined,
    () => undefined
  );
  pendingSceneMutations.set(canvas, settled);
  return result.finally(() => {
    if (pendingSceneMutations.get(canvas) === settled) pendingSceneMutations.delete(canvas);
  });
}
