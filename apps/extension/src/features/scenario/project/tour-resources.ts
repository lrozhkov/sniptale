import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  TourAudioResource,
  TourDocument,
  TourImage,
  TourSlide,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import { getTourSlideObjects } from '@sniptale/runtime-contracts/scenario/types/tour';

/** Includes stage and navigation backgrounds; occurrence identity stays independent of shared media. */
export function getTourImages(tour: TourDocument): TourImage[] {
  const images = tour.slides.flatMap((slide) => {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    return image ? [image] : [];
  });
  if (tour.stage.image) images.push(tour.stage.image);
  return images;
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
  for (const resource of project.tour ? getTourAudioResources(project.tour) : [])
    assets.add(resource.assetId);
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
  const objects = new Map(
    tour.slides.flatMap((slide) =>
      (slide.kind === 'image'
        ? getTourSlideObjects(slide).map((entry) => entry.object)
        : slide.buttons
      ).map((object) => [object.id, nextId()] as const)
    )
  );
  for (const slide of tour.slides) {
    slide.id = slides.get(slide.id)!;
    for (const object of slide.kind === 'image'
      ? getTourSlideObjects(slide).map((entry) => entry.object)
      : slide.buttons) {
      object.id = objects.get(object.id)!;
      if ('action' in object && object.action.kind === 'slide')
        object.action.slideId = slides.get(object.action.slideId)!;
      if ('action' in object && object.action.kind === 'action')
        object.action.actionId = objects.get(object.action.actionId) ?? object.action.actionId;
    }
    if (slide.kind === 'image' && slide.origin) {
      slide.origin = {
        stepId: guideIds.get(slide.origin.stepId) ?? slide.origin.stepId,
        blockId: guideIds.get(slide.origin.blockId) ?? slide.origin.blockId,
      };
    }
  }
}

/** Slide first, followed by authored objects in display order; targets belong to the supplied document. */
export function getTourNarrationTargets(slide: TourSlide) {
  return [
    ...(slide.kind === 'navigation' ? [slide] : []),
    ...(slide.kind === 'image' ? slide.actions.map((entry) => entry.object) : slide.buttons),
  ];
}

/** Exact attachment lookup; missing objects are never redirected to the slide. */
export function getTourNarrationTarget(slide: TourSlide, objectId: string | null) {
  return objectId === null
    ? slide.kind === 'navigation'
      ? slide
      : undefined
    : getTourNarrationTargets(slide).find((target) => target !== slide && target.id === objectId);
}

/** Projects current bindings and detached materials without mutating a read. */
export function getTourAudioResources(tour: TourDocument): TourAudioResource[] {
  const resources = new Map(
    (tour.audioResources ?? []).map((resource) => [resource.assetId, { ...resource }])
  );
  for (const slide of tour.slides)
    for (const target of getTourNarrationTargets(slide)) {
      const voice = target.narration;
      if (voice && !resources.has(voice.assetId))
        resources.set(voice.assetId, {
          assetId: voice.assetId,
          duration: voice.duration,
          name: voice.assetId,
        });
    }
  const music = tour.backgroundMusic;
  if (music && !resources.has(music.assetId))
    resources.set(music.assetId, {
      assetId: music.assetId,
      duration: music.duration,
      name: music.assetId,
    });
  return [...resources.values()];
}

/** One cue per attachment. Entry cues are ordered; activation only addresses the requested object. */
export function getTourNarrationCues(
  slide: TourSlide,
  event: { kind: 'enter' } | { kind: 'activation'; objectId: string }
) {
  return getTourNarrationTargets(slide).flatMap((target) => {
    const narration = target.narration;
    if (!narration) return [];
    const objectId = target === slide ? null : target.id;
    const trigger =
      slide.kind === 'image' ? 'enter' : 'trigger' in narration ? narration.trigger : 'enter';
    if (event.kind !== trigger || (event.kind === 'activation' && event.objectId !== objectId))
      return [];
    return [{ slideId: slide.id, objectId, narration }];
  });
}
