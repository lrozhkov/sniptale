export const SCENARIO_PREVIEW_MAX_BYTES = 192 * 1024 * 1024;

/** Only a locally prepared standalone guide or tour crosses into the unprivileged runtime. */
export interface TourPreviewMessage {
  kind: 'tour-preview';
  mode: 'guide' | 'tour';
  nonce: string;
  blob: Blob;
}
export function readTourPreviewMessage(value: unknown, nonce: string): TourPreviewMessage | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== 'tour-preview' ||
    !('mode' in value) ||
    (value.mode !== 'guide' && value.mode !== 'tour') ||
    !('nonce' in value) ||
    value.nonce !== nonce ||
    !('blob' in value) ||
    !(value.blob instanceof Blob) ||
    !/^text\/html(?:;charset=utf-8)?$/i.test(value.blob.type) ||
    !value.blob.size ||
    value.blob.size > SCENARIO_PREVIEW_MAX_BYTES
  )
    return null;
  return { kind: 'tour-preview', mode: value.mode, nonce, blob: value.blob };
}

/** Sandbox status has no command or persistence authority. */
export function readScenarioPreviewStatus(
  value: unknown,
  nonce: string
): 'ready' | 'failed' | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    value.kind !== 'scenario-preview-status' ||
    !('nonce' in value) ||
    value.nonce !== nonce ||
    !('status' in value)
  )
    return null;
  return value.status === 'ready' || value.status === 'failed' ? value.status : null;
}
