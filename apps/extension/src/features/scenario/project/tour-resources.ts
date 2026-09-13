import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourDocument, TourImage } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Includes navigation backgrounds; occurrence identity stays independent of shared media. */
export function getTourImages(tour: TourDocument): TourImage[] {
  return tour.slides.flatMap((slide) => {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    return image ? [image] : [];
  });
}

/** Logical resources of both representations; persistence owns byte acquisition and lifetime. */
export function getScenarioResourceReferences(project: GuideProject) {
  const assets = new Set<string>();
  const documents = new Set<string>();
  const images = project.items.flatMap((item) =>
    item.kind === 'step' ? item.blocks.filter((block) => block.kind === 'image') : []
  );
  for (const image of [...images, ...(project.tour ? getTourImages(project.tour) : [])]) {
    assets.add(image.assetId);
    if (image.editDocumentId) documents.add(image.editDocumentId);
  }
  for (const slide of project.tour?.slides ?? [])
    if (slide.narration) assets.add(slide.narration.assetId);
  return { assets, documents };
}

/** Remaps authored identities in a detached copy; source provenance stays untouched. */
export function remapTourIdentities(
  tour: TourDocument,
  nextId: () => string,
  guideIds: ReadonlyMap<string, string>
): void {
  tour.id = nextId();
  const slides = new Map(tour.slides.map((slide) => [slide.id, nextId()]));
  for (const slide of tour.slides) {
    slide.id = slides.get(slide.id)!;
    if (slide.timing.autoplayTarget)
      slide.timing.autoplayTarget = slides.get(slide.timing.autoplayTarget)!;
    const actions = slide.kind === 'image' ? slide.hotspots : slide.buttons;
    for (const object of actions) {
      object.id = nextId();
      if (object.action.kind === 'slide')
        object.action.slideId = slides.get(object.action.slideId)!;
    }
    if (slide.kind !== 'image') continue;
    for (const object of [...slide.annotations, ...slide.masks]) object.id = nextId();
    if (slide.origin) {
      slide.origin = {
        stepId: guideIds.get(slide.origin.stepId) ?? slide.origin.stepId,
        blockId: guideIds.get(slide.origin.blockId) ?? slide.origin.blockId,
      };
    }
  }
}
