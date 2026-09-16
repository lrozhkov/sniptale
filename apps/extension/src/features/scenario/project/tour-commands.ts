import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type {
  TourDocument,
  TourImage,
  TourSlide,
  TourNarration,
  TourObjectNarration,
} from '@sniptale/runtime-contracts/scenario/types/tour';
import {
  getTourImages,
  getTourAudioResources,
  getTourNarrationTarget,
  getTourNarrationTargets,
} from './tour-resources';

/** Capabilities supplied by the owning project session, never by an AI response. */
export interface TourResourceCatalog {
  images: readonly TourImage[];
  audio: readonly { assetId: string; duration: number }[];
}

/** Whole-slide edits cover nested authored objects through the canonical document schema. */
export type TourCommand =
  | { kind: 'replace-tour'; tour: TourDocument }
  | {
      kind: 'set-narration';
      slideId: string;
      objectId: string | null;
      narration: TourNarration | TourObjectNarration | null;
    }
  | { kind: 'remove-audio-resource'; assetId: string }
  | { kind: 'insert-slide'; slide: TourSlide; beforeId?: string }
  | { kind: 'replace-slide'; slideId: string; slide: TourSlide }
  | { kind: 'move-slide'; slideId: string; beforeId?: string }
  | { kind: 'duplicate-slide'; slideId: string; newId: string }
  | { kind: 'remove-slide'; slideId: string; incoming: 'reject' | 'clear' };

/** Incoming edges are shown before a destructive edit; clearing is an explicit author choice. */
export function getTourIncomingReferences(tour: TourDocument, targetId: string): string[] {
  return tour.slides.flatMap((slide) => {
    if (slide.id === targetId) return [];
    const objects = slide.kind === 'image' ? slide.hotspots : slide.buttons;
    return [
      ...(slide.timing.autoplayTarget === targetId ? [slide.id] : []),
      ...objects
        .filter((object) => object.action.kind === 'slide' && object.action.slideId === targetId)
        .map((object) => object.id),
    ];
  });
}

function indexOf(slides: TourSlide[], id: string): number {
  const index = slides.findIndex((slide) => slide.id === id);
  if (index < 0) throw new Error('Tour slide is unavailable.');
  return index;
}
function insertionIndex(slides: TourSlide[], beforeId: string | undefined): number {
  return beforeId === undefined ? slides.length : indexOf(slides, beforeId);
}

function removeSlide(
  tour: TourDocument,
  command: Extract<TourCommand, { kind: 'remove-slide' }>
): void {
  const index = indexOf(tour.slides, command.slideId);
  if (command.incoming !== 'clear' && getTourIncomingReferences(tour, command.slideId).length)
    throw new Error('Tour slide has incoming navigation.');
  tour.slides.splice(index, 1);
  if (command.incoming !== 'clear') return;
  for (const slide of tour.slides) {
    if (slide.timing.autoplayTarget === command.slideId) slide.timing.autoplayTarget = null;
    for (const object of slide.kind === 'image' ? slide.hotspots : slide.buttons)
      if (object.action.kind === 'slide' && object.action.slideId === command.slideId)
        object.action = { kind: 'none' };
  }
}

function duplicateSlide(slide: TourSlide, id: string, nextId: () => string): TourSlide {
  const copy = structuredClone(slide);
  copy.id = id;
  if (copy.timing.autoplayTarget === slide.id) copy.timing.autoplayTarget = id;
  for (const object of copy.kind === 'image' ? copy.hotspots : copy.buttons) {
    object.id = nextId();
    if (object.action.kind === 'slide' && object.action.slideId === slide.id)
      object.action.slideId = id;
  }
  if (copy.kind === 'image')
    for (const object of [...copy.annotations, ...copy.masks]) object.id = nextId();
  return copy;
}

function setNarration(
  slide: TourSlide,
  command: Extract<TourCommand, { kind: 'set-narration' }>
): void {
  const target = getTourNarrationTarget(slide, command.objectId);
  if (!target) throw new Error('Tour narration target is unavailable.');
  if (command.objectId === null) {
    slide.narration = structuredClone(command.narration);
    return;
  }
  const voice = command.narration;
  target.narration = voice
    ? { ...voice, trigger: 'trigger' in voice ? voice.trigger : 'activation' }
    : null;
}

/** Removing a material clears its attachment graph; it never deletes immutable bytes directly. */
function removeAudioResource(tour: TourDocument, assetId: string): void {
  const resources = getTourAudioResources(tour);
  if (!resources.some((resource) => resource.assetId === assetId))
    throw new Error('Tour audio resource is unavailable.');
  tour.audioResources = resources.filter((resource) => resource.assetId !== assetId);
  for (const target of tour.slides.flatMap(getTourNarrationTargets)) {
    if (target.narration?.assetId === assetId) target.narration = null;
  }
}

function applySlideCommand(
  tour: TourDocument,
  command: Exclude<TourCommand, { kind: 'replace-tour' | 'remove-audio-resource' }>,
  nextId: () => string
): void {
  if (command.kind === 'insert-slide') {
    tour.slides.splice(
      insertionIndex(tour.slides, command.beforeId),
      0,
      structuredClone(command.slide)
    );
    return;
  }
  const index = indexOf(tour.slides, command.slideId);
  switch (command.kind) {
    case 'set-narration':
      setNarration(tour.slides[index]!, command);
      return;
    case 'replace-slide':
      if (command.slide.id !== command.slideId)
        throw new Error('A slide edit cannot change identity.');
      tour.slides[index] = structuredClone(command.slide);
      return;
    case 'remove-slide':
      removeSlide(tour, command);
      return;
    case 'duplicate-slide':
      tour.slides.splice(index + 1, 0, duplicateSlide(tour.slides[index]!, command.newId, nextId));
      return;
    case 'move-slide': {
      const target = insertionIndex(tour.slides, command.beforeId);
      if (target === index || target === index + 1) return;
      const [slide] = tour.slides.splice(index, 1);
      tour.slides.splice(target > index ? target - 1 : target, 0, slide!);
    }
  }
}

function immutableImage(image: TourImage): string {
  return JSON.stringify(
    {
      assetId: image.assetId,
      galleryAssetId: image.galleryAssetId,
      editDocumentId: image.editDocumentId,
      width: image.width,
      height: image.height,
      source: image.source,
    },
    (_key, value: unknown) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
          Object.keys(record)
            .sort()
            .map((key) => [key, record[key]])
        );
      }
      return value;
    }
  );
}

function assertResources(tour: TourDocument, catalog: TourResourceCatalog): void {
  const images = new Set(catalog.images.map(immutableImage));
  for (const image of getTourImages(tour))
    if (!images.has(immutableImage(image)))
      throw new Error('Tour image is outside the project resource catalog.');
  for (const resource of getTourAudioResources(tour)) {
    if (
      !catalog.audio.some(
        (audio) => audio.assetId === resource.assetId && audio.duration === resource.duration
      )
    )
      throw new Error('Tour narration is outside the project resource catalog.');
  }
}

/** One detached batch becomes one Undo entry; persistence still owns revision and media writes. */
export function applyTourCommands(
  project: GuideProject,
  commands: readonly TourCommand[],
  resources: TourResourceCatalog,
  nextId: () => string = () => crypto.randomUUID()
): GuideProject {
  if (project.purpose === 'step-template')
    throw new Error('A step template cannot contain a tour.');
  if (commands.length === 0 || commands.length > 1000)
    throw new Error('Invalid tour command count.');
  const next = structuredClone(project);
  if (next.tour && getTourAudioResources(next.tour).length)
    next.tour.audioResources = getTourAudioResources(next.tour);
  for (const command of commands) {
    if (command.kind === 'replace-tour') {
      const retained = next.tour ? getTourAudioResources(next.tour) : [];
      next.tour = structuredClone(command.tour);
      if (retained.length) next.tour.audioResources ??= retained;
    } else {
      if (!next.tour) throw new Error('Tour is unavailable.');
      if (command.kind === 'remove-audio-resource') removeAudioResource(next.tour, command.assetId);
      else applySlideCommand(next.tour, command, nextId);
    }
  }
  const parsed = parseGuideProject(next);
  if (parsed.status !== 'ok' || !parsed.project.tour)
    throw new Error('Tour command result is invalid.');
  assertResources(parsed.project.tour, resources);
  return parsed.project;
}
