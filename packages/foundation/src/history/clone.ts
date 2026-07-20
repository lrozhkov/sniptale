export function cloneHistorySnapshot<T>(snapshot: T): T {
  if (snapshot === null || typeof snapshot !== 'object') {
    return snapshot;
  }

  return structuredClone(snapshot);
}
