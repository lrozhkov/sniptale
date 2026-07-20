import { blobToDataUrl } from '../../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { buildScenarioCaptureSvgMarkup } from '../../../stage-render/svg';
import type { ScenarioProject } from '../../../../../features/scenario/contracts/types/project';
import { SCENARIO_AI_ATTACHMENT_CANVAS, SCENARIO_AI_ATTACHMENT_MAX_BYTES } from './constants';
import { createAttachmentCandidate, createJpegAttachmentCandidates } from './candidate';
import {
  getDownscaledAttachmentSize,
  pickSmallestAttachmentCandidate,
  pickValidAttachmentCandidate,
} from './pick';
import type { ScenarioRenderedAttachment, ScenarioRenderedAttachmentCandidate } from './types';

async function createAttachmentFallbackCandidates(args: {
  stepId: string;
  stepNumber: number;
  svgMarkup: string;
}) {
  const fullSizeJpegs = await createJpegAttachmentCandidates({
    size: SCENARIO_AI_ATTACHMENT_CANVAS,
    stepId: args.stepId,
    stepNumber: args.stepNumber,
    svgMarkup: args.svgMarkup,
  });
  const downscaledJpegs = await createJpegAttachmentCandidates({
    size: getDownscaledAttachmentSize(),
    stepId: args.stepId,
    stepNumber: args.stepNumber,
    svgMarkup: args.svgMarkup,
  });
  return [...fullSizeJpegs, ...downscaledJpegs];
}

function throwAttachmentTooLargeError(
  stepId: string,
  candidates: ScenarioRenderedAttachmentCandidate[]
): never {
  const smallestCandidate = pickSmallestAttachmentCandidate(candidates);
  throw new Error(
    `Scenario attachment for step ${stepId} exceeds ${SCENARIO_AI_ATTACHMENT_MAX_BYTES} bytes` +
      (smallestCandidate ? ` (smallest candidate: ${smallestCandidate.blob.size} bytes)` : '')
  );
}

export async function renderCaptureStepAttachment(args: {
  assetBlob: Blob;
  step: Extract<ScenarioProject['steps'][number], { kind: 'capture' }>;
  stepNumber: number;
}): Promise<ScenarioRenderedAttachment> {
  const [assetDataUrl, assetDimensions] = await Promise.all([
    blobToDataUrl(args.assetBlob),
    measureImageBlob(args.assetBlob),
  ]);
  const svgMarkup = buildScenarioCaptureSvgMarkup({
    assetDataUrl,
    assetDimensions,
    step: args.step,
  });

  const pngCandidate = await createAttachmentCandidate({
    blobType: 'image/png',
    extension: 'png',
    size: SCENARIO_AI_ATTACHMENT_CANVAS,
    stepId: args.step.id,
    stepNumber: args.stepNumber,
    svgMarkup,
  });
  if (pngCandidate.blob.size <= SCENARIO_AI_ATTACHMENT_MAX_BYTES) {
    return pngCandidate;
  }

  const fallbackCandidates = await createAttachmentFallbackCandidates({
    stepId: args.step.id,
    stepNumber: args.stepNumber,
    svgMarkup,
  });
  const validCandidate = pickValidAttachmentCandidate(fallbackCandidates);
  if (validCandidate) {
    return validCandidate;
  }

  throwAttachmentTooLargeError(args.step.id, fallbackCandidates);
}
