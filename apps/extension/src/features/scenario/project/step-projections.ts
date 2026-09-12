import { resolveGuideNumbering } from './numbering';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import type {
  GuideProject,
  GuideImageBlock,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioRecentStep, ScenarioPreviewStep } from '../contracts/types/project';

/** Projects recent captured images without changing document ordering or media ownership. */
export async function buildRecentScenarioSteps(args: {
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>;
  limit?: number;
  project: GuideProject;
}): Promise<ScenarioRecentStep[]> {
  const numbering = resolveGuideNumbering(args.project.items);
  const candidates = args.project.items
    .flatMap((item, position) => {
      if (item.kind !== 'step') return [];
      const image = item.blocks.find(
        (block): block is GuideImageBlock =>
          block.kind === 'image' && block.source.kind === 'capture'
      );
      return image ? [{ item, image, position }] : [];
    })
    .slice(-(args.limit ?? 7))
    .reverse();
  const steps = await Promise.all(
    candidates.map(async ({ item, image, position }): Promise<ScenarioRecentStep | null> => {
      const blob = await args.getAssetBlob(image.assetId);
      if (!blob || image.source.kind !== 'capture') return null;
      const { kind: _kind, ...metadata } = image.source;
      return {
        id: item.id,
        title: item.title || image.caption,
        position,
        numberLabel: numbering.get(item.id)?.label ?? null,
        previewDataUrl: await blobToDataUrl(blob),
        metadata,
      };
    })
  );
  return steps.filter((step): step is ScenarioRecentStep => step !== null);
}

/** Projects every library step and image without eagerly acquiring media bytes. */
export function buildGuidePreviewSteps({
  project,
}: {
  project: GuideProject;
}): ScenarioPreviewStep[] {
  const numbering = resolveGuideNumbering(project.items);
  return project.items.flatMap((step, position) => {
    if (step.kind !== 'step') return [];
    const images = step.blocks.flatMap((block) =>
      block.kind === 'image'
        ? [
            {
              id: block.id,
              assetId: block.assetId,
              alt: block.alt,
              caption: block.caption,
              frame: { ...block.frame },
              fit: block.fit,
              contentTransform: { ...block.contentTransform },
            },
          ]
        : []
    );
    return [
      {
        id: step.id,
        title: step.title,
        position,
        numberLabel: numbering.get(step.id)?.label ?? null,
        images,
      },
    ];
  });
}
