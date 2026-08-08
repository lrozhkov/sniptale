import type {
  AutoBlurDetection,
  AutoBlurDetector,
} from '../../../features/highlighter/contracts/auto-blur';
import { getAutoBlurRectUnion, hasBlurFrameForRect } from './geometry';
import type { AutoBlurDetectionCandidate, AutoBlurMatch, AutoBlurScanInput } from './types';
import { collectVisibleAutoBlurTextSources, getAutoBlurTextSourceRangeRects } from './visible-text';
import { ruleAutoBlurDetector } from './detectors/rule-detector';
import { visitAutoBlurPageViewports } from './full-page';
import { throwIfAutoBlurScanAborted } from './cancellation';

function createDetectionCandidate(
  detection: AutoBlurDetection,
  scrollDelta: { x: number; y: number }
): AutoBlurDetectionCandidate | null {
  const source = detection.source as ReturnType<typeof collectVisibleAutoBlurTextSources>[number];
  const currentRect = getAutoBlurRectUnion(
    getAutoBlurTextSourceRangeRects(source, detection.start, detection.end)
  );

  return currentRect
    ? {
        ...detection,
        rect: {
          ...currentRect,
          x: currentRect.x + scrollDelta.x,
          y: currentRect.y + scrollDelta.y,
        },
      }
    : null;
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
  throwIfAutoBlurScanAborted(input.signal);
  const candidates: AutoBlurDetectionCandidate[] = [];
  const collectCandidates = (scrollDelta: { x: number; y: number }) => {
    throwIfAutoBlurScanAborted(input.signal);
    const sources = collectVisibleAutoBlurTextSources();
    candidates.push(
      ...detector
        .detect({ sources })
        .map((detection) => createDetectionCandidate(detection, scrollDelta))
        .filter((candidate): candidate is AutoBlurDetectionCandidate => candidate !== null)
    );
  };

  if (input.mode === 'full-page') {
    await visitAutoBlurPageViewports(collectCandidates, input.signal);
  } else {
    collectCandidates({ x: 0, y: 0 });
  }

  return {
    matches: dedupeCandidates(candidates).map((detection, index) =>
      createAutoBlurMatch(detection, input.frames, index)
    ),
  };
}
