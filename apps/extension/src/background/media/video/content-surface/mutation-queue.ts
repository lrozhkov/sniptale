// policyStateId: video-recording-surface-lease - serializes device mutations and rollback for one authorized surface.
const mediaMutationTails = new Map<string, Promise<void>>();

/** Serializes sensitive device changes for one content surface, including rollback. */
export function runSerializedVideoRecordingMediaMutation<T>(
  surfaceSessionId: string,
  operation: () => Promise<T>
): Promise<T> {
  const predecessor = mediaMutationTails.get(surfaceSessionId) ?? Promise.resolve();
  const result = predecessor.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined
  );
  mediaMutationTails.set(surfaceSessionId, tail);
  void tail.finally(() => {
    if (mediaMutationTails.get(surfaceSessionId) === tail) {
      mediaMutationTails.delete(surfaceSessionId);
    }
  });
  return result;
}

export function resetVideoRecordingMediaMutationQueueForTests(): void {
  mediaMutationTails.clear();
}
