import type { CaptureCompositionKind, ScenarioCaptureSlideInput } from './types';

const POINTER_SEQUENCE_DISTANCE = 72;
const SPARSE_BODY_LENGTH = 12;

export function selectCaptureComposition(input: ScenarioCaptureSlideInput): CaptureCompositionKind {
  if ((input.captureMetadata.pointerRange?.distance ?? 0) >= POINTER_SEQUENCE_DISTANCE) {
    return 'click-sequence';
  }
  if (input.target?.rect) {
    return 'target-focused';
  }
  if (isSparseWalkthrough(input)) {
    return 'sparse-viewport';
  }
  if (input.interactionPoint || input.body.trim()) {
    return 'side-note-walkthrough';
  }

  return 'full-screen-context';
}

function isSparseWalkthrough(input: ScenarioCaptureSlideInput): boolean {
  return (
    !input.interactionPoint && !input.target?.rect && input.body.trim().length >= SPARSE_BODY_LENGTH
  );
}
