const pendingTransitions = new WeakMap<object, Promise<void>>();

export function runEditorDocumentTransition<T>(
  owner: object | null,
  operation: () => Promise<T>
): Promise<T> {
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
