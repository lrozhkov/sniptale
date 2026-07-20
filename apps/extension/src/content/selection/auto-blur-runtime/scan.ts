import type {
  AutoBlurDetection,
  AutoBlurDetector,
} from '../../../features/highlighter/contracts/auto-blur';
import { hasBlurFrameForRect } from './geometry';
import type { AutoBlurDetectionCandidate, AutoBlurMatch, AutoBlurScanInput } from './types';
import { collectVisibleAutoBlurTextSources, getAutoBlurTextSourceRangeRects } from './visible-text';
import { ruleAutoBlurDetector } from './detectors/rule-detector';

function createDetectionCandidate(detection: AutoBlurDetection): AutoBlurDetectionCandidate | null {
  const source = detection.source as ReturnType<typeof collectVisibleAutoBlurTextSources>[number];
  const rect = getAutoBlurTextSourceRangeRects(source, detection.start, detection.end)[0];

  return rect ? { ...detection, rect } : null;
}

function createMatchId(detection: AutoBlurDetectionCandidate, index: number): string {
  const rect = detection.rect;
  return [
    detection.category,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.width),
    Math.round(rect.height),
    detection.start,
    index,
  ].join(':');
}

function dedupeCandidates(candidates: AutoBlurDetectionCandidate[]): AutoBlurDetectionCandidate[] {
  const sortedCandidates = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const accepted: AutoBlurDetectionCandidate[] = [];

  sortedCandidates.forEach((candidate) => {
    const overlapsAccepted = accepted.some(
      (current) =>
        current.source.element === candidate.source.element &&
        candidate.start < current.end &&
        current.start < candidate.end
    );

    if (!overlapsAccepted) {
      accepted.push(candidate);
    }
  });

  return accepted.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
}

function createAutoBlurMatch(
  detection: AutoBlurDetectionCandidate,
  frames: AutoBlurScanInput['frames'],
  index: number
): AutoBlurMatch {
  return {
    alreadyBlurred: hasBlurFrameForRect(frames, detection.rect),
    category: detection.category,
    confidence: detection.confidence,
    element: detection.source.element,
    id: createMatchId(detection, index),
    rect: detection.rect,
    value: detection.value,
  };
}

export async function scanAutoBlurTargets(
  input: AutoBlurScanInput,
  detector: AutoBlurDetector = ruleAutoBlurDetector
) {
  const sources = collectVisibleAutoBlurTextSources();
  const candidates = detector
    .detect({ sources })
    .map(createDetectionCandidate)
    .filter((candidate): candidate is AutoBlurDetectionCandidate => candidate !== null);

  return {
    matches: dedupeCandidates(candidates).map((detection, index) =>
      createAutoBlurMatch(detection, input.frames, index)
    ),
  };
}
