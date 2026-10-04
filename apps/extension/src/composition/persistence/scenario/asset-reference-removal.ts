import type {
  GuideImageSlotBlock,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { TourNarration } from '@sniptale/runtime-contracts/scenario/types/tour';
import type { ScenarioProjectEntry } from './contracts';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';

function removeFromProject(project: GuideProject, assetIds: ReadonlySet<string>): boolean {
  let changed = false;
  for (const item of project.items) {
    if (item.kind !== 'step') continue;
    item.blocks = item.blocks.map((block) => {
      if (block.kind !== 'image' || !assetIds.has(block.assetId)) return block;
      changed = true;
      const slot: GuideImageSlotBlock = {
        kind: 'image-slot',
        id: block.id,
        frame: block.frame,
        fit: block.fit,
        alt: block.alt,
        caption: block.caption,
        ...(block.captionAlignment === undefined
          ? {}
          : { captionAlignment: block.captionAlignment }),
        ...(block.width === undefined ? {} : { width: block.width }),
        ...(block.rowStart === undefined ? {} : { rowStart: block.rowStart }),
      };
      return slot;
    });
  }
  const tour = project.tour;
  if (!tour) return changed;
  if (tour.audioResources) {
    tour.audioResources = tour.audioResources.filter((resource) => {
      if (!assetIds.has(resource.assetId)) return true;
      changed = true;
      return false;
    });
  }
  for (const slide of tour.slides) {
    const image = slide.kind === 'image' ? slide.image : slide.background.image;
    if (image && assetIds.has(image.assetId)) {
      if (slide.kind === 'image') slide.image = null;
      else slide.background.image = null;
      changed = true;
    }
    if (removeNarration(slide, assetIds)) changed = true;
    const objects =
      slide.kind === 'image'
        ? [...slide.hotspots, ...slide.annotations, ...slide.masks]
        : slide.buttons;
    for (const object of objects) if (removeNarration(object, assetIds)) changed = true;
  }
  return changed;
}

function removeNarration(
  target: { narration?: TourNarration | null | undefined },
  assetIds: ReadonlySet<string>
): boolean {
  if (!target.narration || !assetIds.has(target.narration.assetId)) return false;
  target.narration = null;
  return true;
}

/** Purely strips selected child references from current and retained scenario content. */
export function removeScenarioAssetReferences(
  entry: ScenarioProjectEntry,
  assetIds: ReadonlySet<string>,
  updatedAt: number
): ScenarioProjectEntry {
  if (!Number.isFinite(updatedAt) || updatedAt < 0)
    throw new Error('Invalid scenario update time.');
  const parsed = parseScenarioProjectEntry(entry);
  if (!parsed) throw new Error('Scenario project content is unavailable.');
  if (assetIds.size === 0) return parsed;
  const detached = structuredClone(parsed);
  let changed = removeFromProject(detached.project, assetIds);
  for (const version of detached.history ?? []) {
    if (removeFromProject(version.project, assetIds)) changed = true;
  }
  if (!changed) return parsed;
  const revised = createScenarioProjectEntry({
    existing: parsed,
    project: detached.project,
    updatedAt,
    historyPolicy: 'preserve',
  });
  const { history: _oldHistory, ...withoutHistory } = revised;
  const next: ScenarioProjectEntry = {
    ...withoutHistory,
    ...(detached.history?.length ? { history: detached.history } : {}),
  };
  const validated = parseScenarioProjectEntry(next);
  if (!validated) throw new Error('Scenario asset reference removal produced invalid content.');
  return validated;
}
