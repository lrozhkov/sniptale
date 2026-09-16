/** Only the prepared standalone file crosses into the unprivileged preview runtime. */
export interface TourPreviewMessage {
  kind: 'tour-preview';
  nonce: string;
  blob: Blob;
}
export function readTourPreviewMessage(value: unknown, nonce: string): TourPreviewMessage | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== 'tour-preview' ||
    !('nonce' in value) ||
    value.nonce !== nonce ||
    !('blob' in value) ||
    !(value.blob instanceof Blob) ||
    !/^text\/html(?:;charset=utf-8)?$/i.test(value.blob.type) ||
    !value.blob.size ||
    value.blob.size > 192 * 1024 * 1024
  )
    return null;
  return { kind: 'tour-preview', nonce, blob: value.blob };
}
