import {
  SCENARIO_AI_ATTACHMENT_CANVAS,
  SCENARIO_AI_ATTACHMENT_DOWNSCALED_WIDTH,
  SCENARIO_AI_ATTACHMENT_MAX_BYTES,
} from './constants';
import type { ScenarioRenderedAttachmentCandidate } from './types';

export function getDownscaledAttachmentSize() {
  return {
    height: Math.round(
      SCENARIO_AI_ATTACHMENT_CANVAS.height *
        (SCENARIO_AI_ATTACHMENT_DOWNSCALED_WIDTH / SCENARIO_AI_ATTACHMENT_CANVAS.width)
    ),
    width: SCENARIO_AI_ATTACHMENT_DOWNSCALED_WIDTH,
  };
}

export function pickSmallestAttachmentCandidate(candidates: ScenarioRenderedAttachmentCandidate[]) {
  return [...candidates].sort((left, right) => left.blob.size - right.blob.size)[0]!;
}

export function pickValidAttachmentCandidate(candidates: ScenarioRenderedAttachmentCandidate[]) {
  return [...candidates]
    .filter((candidate) => candidate.blob.size <= SCENARIO_AI_ATTACHMENT_MAX_BYTES)
    .sort((left, right) => left.blob.size - right.blob.size)[0];
}
