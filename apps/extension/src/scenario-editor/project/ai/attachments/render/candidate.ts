import { blobToDataUrl } from '../../../../../platform/media-utils/data-url';
import { SCENARIO_AI_ATTACHMENT_JPEG_QUALITIES } from './constants';
import { renderSvgBlob } from './image';
import type { ScenarioRenderedAttachmentCandidate } from './types';

type AttachmentCandidateInput = {
  blobType: string;
  extension: 'jpg' | 'png';
  quality?: number;
  size: { height: number; width: number };
  stepId: string;
  stepNumber: number;
  svgMarkup: string;
};

export async function createAttachmentCandidate(
  args: AttachmentCandidateInput
): Promise<ScenarioRenderedAttachmentCandidate> {
  const blob = await renderSvgBlob(args);

  return {
    blob,
    dataUrl: await blobToDataUrl(blob),
    filename: `step${args.stepNumber}.${args.extension}`,
    mimeType: blob.type,
    stepId: args.stepId,
    stepNumber: args.stepNumber,
  };
}

export async function createJpegAttachmentCandidates(args: {
  size: { height: number; width: number };
  stepId: string;
  stepNumber: number;
  svgMarkup: string;
}): Promise<ScenarioRenderedAttachmentCandidate[]> {
  return Promise.all(
    SCENARIO_AI_ATTACHMENT_JPEG_QUALITIES.map((quality) =>
      createAttachmentCandidate({
        blobType: 'image/jpeg',
        extension: 'jpg',
        quality,
        size: args.size,
        stepId: args.stepId,
        stepNumber: args.stepNumber,
        svgMarkup: args.svgMarkup,
      })
    )
  );
}
