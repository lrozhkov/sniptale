import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { loadScenarioImageEditorSource } from './source';

export interface TourImageEditTarget {
  projectId: string;
  slideId: string;
  role: 'image' | 'background';
  assetId: string;
  editDocumentId: string | null;
}

/** The host binds an immutable image version; the embedded editor never supplies a target. */
export async function prepareTourImageEditorPayload(project: GuideProject, slideId: string) {
  const parsed = parseGuideProject(project);
  if (parsed.status !== 'ok') throw new Error('Invalid scenario project.');
  const slide = parsed.project.tour?.slides.find((entry) => entry.id === slideId);
  const image = slide?.kind === 'image' ? slide.image : slide?.background.image;
  if (!image || !slide) throw new Error('The tour image is unavailable.');
  const source = await loadScenarioImageEditorSource(project.id, image);
  const target: TourImageEditTarget = {
    projectId: project.id,
    slideId,
    role: slide.kind === 'image' ? 'image' : 'background',
    assetId: image.assetId,
    editDocumentId: image.editDocumentId,
  };
  return {
    target,
    payload: {
      dataUrl: source.dataUrl,
      title: (slide.title || image.alt).slice(0, 160),
      ...(source.document ? { document: source.document.document } : {}),
    },
  };
}
