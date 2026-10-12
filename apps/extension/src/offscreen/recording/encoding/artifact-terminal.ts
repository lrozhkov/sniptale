/** Producer stop/pump and phase admission remain with each session owner. */
export async function finalizeRecordingArtifact<T extends { size: number }>(
  writer: { finalize(): Promise<T> },
  artifactId: string,
  canComplete: () => boolean,
  onStop: ((artifact: T) => Promise<void> | void) | undefined
): Promise<T | null> {
  const artifact = await writer.finalize();
  if (!canComplete()) return null;
  if (artifact.size === 0) throw new Error(`Recording ${artifactId} produced no media bytes.`);
  await onStop?.(artifact);
  return canComplete() ? artifact : null;
}
/** One terminal promise, shared mechanics without cross-session authority. */
export function createRecordingTerminal<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => undefined);
  let settled = false;
  return {
    promise,
    get settled() {
      return settled;
    },
    resolve(value: T) {
      if (settled) return;
      settled = true;
      resolve(value);
    },
    reject(error: Error) {
      if (settled) return;
      settled = true;
      reject(error);
    },
  };
}
