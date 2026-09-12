import { resolveGuideNumbering } from './numbering';
import { blobToDataUrl } from '../../../platform/media-utils/data-url';
import type {
  GuideProject,
  GuideImageBlock,
} from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioRecentStep } from '../contracts/types/project';

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

/** Library previews include imported images and text-only steps, in document order. */
export async function buildGuidePreviewSteps(args: {
  getAssetBlob: (assetId: string) => Promise<Blob | undefined>;
  project: GuideProject;
  limit?: number;
}): Promise<ScenarioRecentStep[]> {
  const numbering = resolveGuideNumbering(args.project.items);
  const steps = args.project.items
    .flatMap((item, position) => (item.kind === 'step' ? [{ step: item, position }] : []))
    .slice(0, args.limit ?? 6);
  return Promise.all(
    steps.map(async ({ step, position }) => {
      const image = step.blocks.find((block) => block.kind === 'image');
      const blob = image ? await args.getAssetBlob(image.assetId) : undefined;
      return {
        id: step.id,
        title: step.title || (image?.caption ?? ''),
        position,
        numberLabel: numbering.get(step.id)?.label ?? null,
        previewDataUrl: blob ? await blobToDataUrl(blob) : '',
      };
    })
  );
}
