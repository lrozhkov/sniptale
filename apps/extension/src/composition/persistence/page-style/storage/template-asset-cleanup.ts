import type { PageStyleRegistry, PageStyleTemplate } from '@sniptale/runtime-contracts/page-style';
import { cloneTemplate } from './clone';
import { cleanupPageStyleAssetReferences, type PageStyleAssetCleanupResult } from './cleanup';
import { preparePageStyleTemplateSave } from './records';
import type { SavePageStyleTemplateInput } from './types';

type DeletePageStyleAssetPort = (assetId: string) => Promise<void>;
type SaveTemplateWithAssetCleanupResult = PageStyleAssetCleanupResult & {
  template: PageStyleTemplate;
};

export async function saveTemplateWithAssetCleanup(args: {
  createId: () => string;
  deleteAsset: DeletePageStyleAssetPort;
  input: SavePageStyleTemplateInput;
  loadRegistry: () => Promise<PageStyleRegistry>;
  now: number;
  writeRegistry: (registry: PageStyleRegistry) => Promise<void>;
}): Promise<SaveTemplateWithAssetCleanupResult> {
  const registry = await args.loadRegistry();
  const prepared = preparePageStyleTemplateSave({
    createId: args.createId,
    input: args.input,
    now: args.now,
    registry,
  });
  const removedAssetIds = collectRemovedTemplateAssetIds(prepared.existing, prepared.template);

  await args.writeRegistry(prepared.registry);
  const cleanupResult = await cleanupPageStyleAssetReferences({
    assetIds: removedAssetIds,
    deleteAsset: args.deleteAsset,
    loadRegistry: args.loadRegistry,
  });

  return { ...cleanupResult, template: cloneTemplate(prepared.template) };
}

function collectRemovedTemplateAssetIds(
  previous: PageStyleTemplate | undefined,
  next: PageStyleTemplate
): Set<string> {
  if (!previous) {
    return new Set();
  }

  const nextAssetIds = new Set(next.patch.assets.map((asset) => asset.assetId));
  return new Set(
    previous.patch.assets
      .map((asset) => asset.assetId)
      .filter((assetId) => !nextAssetIds.has(assetId))
  );
}
