const pendingTransitions = new WeakMap<object, Promise<void>>();
const transitionRevisions = new WeakMap<object, number>();

/** Capture the document command generation before preparing a detached asynchronous edit. */
export function getEditorDocumentTransitionRevision(owner: object | null): number {
  return owner ? (transitionRevisions.get(owner) ?? 0) : 0;
}

/** Pending document commands must settle before a new detached edit can be admitted. */
export function hasPendingEditorDocumentTransition(owner: object | null): boolean {
  return owner !== null && pendingTransitions.has(owner);
}

export function runEditorDocumentTransition<T>(
  owner: object | null,
  operation: () => Promise<T>
): Promise<T> {
  if (owner) transitionRevisions.set(owner, getEditorDocumentTransitionRevision(owner) + 1);
  const predecessor = owner ? pendingTransitions.get(owner) : undefined;
  let result: Promise<T>;
  if (predecessor) {
    result = predecessor.then(operation);
  } else {
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      result = Promise.reject(error);
    }
  }
  if (!owner) return result;

  const settled = result.then(
    () => undefined,
    () => undefined
  );
  pendingTransitions.set(owner, settled);
  return result.finally(() => {
    if (pendingTransitions.get(owner) === settled) pendingTransitions.delete(owner);
  });
}
