import type { ScenarioProjectEntry } from '../../composition/persistence/scenario/contracts';
import { getScenarioAssetBlob } from '../../composition/persistence/scenario/store/public';
import {
  commitProjectAggregatePresentation,
  getAggregatePresentation,
} from '../../composition/persistence/aggregate-presentations';
import { createImageThumbnailBlob } from '../../platform/media-utils/image-thumbnail';

const PRESENTATION_WIDTH = 320;
const PRESENTATION_HEIGHT = 180;

function resolveLatestVisualAssetId(entry: ScenarioProjectEntry): string | null {
  const project = entry.project;
  if (project.version === 3) {
    for (let index = project.slides.length - 1; index >= 0; index -= 1) {
      const source = project.slides[index]?.source;
      if (source?.kind === 'capture') return source.assetId;
    }
    return null;
  }

  for (let index = project.steps.length - 1; index >= 0; index -= 1) {
    const step = project.steps[index];
    if (step?.kind === 'capture') return step.assetId;
  }
  return null;
}

export async function refreshScenarioAggregatePresentation(
  entry: ScenarioProjectEntry
): Promise<void> {
  const workspaceRevision = entry.workspaceRevision ?? 0;
  const ref = { id: entry.id, kind: 'scenario' } as const;
  const current = await getAggregatePresentation(ref);
  if (current?.presentationRevision === workspaceRevision) return;

  const assetId = resolveLatestVisualAssetId(entry);
  if (!assetId) throw new Error('The scenario has no visual step for its cover.');
  const source = await getScenarioAssetBlob(assetId);
  if (!source) throw new Error('The current scenario cover source is unavailable.');
  const thumbnailBlob = await createImageThumbnailBlob(
    source,
    PRESENTATION_WIDTH,
    PRESENTATION_HEIGHT
  );
  await commitProjectAggregatePresentation({
    expectedWorkspaceRevision: workspaceRevision,
    ref,
    thumbnailBlob,
  });
}
