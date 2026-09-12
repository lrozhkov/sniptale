import type {
  GuideHtmlImageSettings,
  GuideImageBlock,
  GuideProject,
} from '@sniptale/runtime-contracts/scenario/types/guide';

/** Default policy preserves original bytes and permits inspection of the saved image. */
export const DEFAULT_HTML_IMAGES: Readonly<GuideHtmlImageSettings> = {
  content: 'full',
  optimize: false,
  maxEdge: 2560,
  quality: 0.85,
  viewer: true,
};

/** One policy resolver serves export, workbench and the selected-image inspector. */
export function resolveHtmlImageSettings(
  project: GuideProject,
  block?: GuideImageBlock
): GuideHtmlImageSettings {
  return block?.htmlExport ?? project.htmlExport ?? DEFAULT_HTML_IMAGES;
}

/** Each list entry denotes one occurrence; the same immutable raster can have different crops. */
export function guideHtmlImages(project: GuideProject) {
  return project.items.flatMap((item) =>
    item.kind === 'step'
      ? item.blocks.flatMap((block) =>
          block.kind === 'image' ? [{ block, title: item.title, stepId: item.id }] : []
        )
      : []
  );
}

/** Bulk patches preserve unedited effective fields; reset removes overrides instead of copying defaults. */
export function changeHtmlImageSettings(
  project: GuideProject,
  selected: ReadonlySet<string>,
  patch: Partial<GuideHtmlImageSettings> | null
): GuideProject {
  return {
    ...project,
    items: project.items.map((item) =>
      item.kind !== 'step'
        ? item
        : {
            ...item,
            blocks: item.blocks.map((block) => {
              if (block.kind !== 'image' || !selected.has(block.id)) return block;
              if (patch)
                return {
                  ...block,
                  htmlExport: { ...resolveHtmlImageSettings(project, block), ...patch },
                };
              const { htmlExport, ...rest } = block;
              void htmlExport;
              return rest;
            }),
          }
    ),
  };
}

/** Serialization identity excludes viewer behavior and fields that do not change saved pixels. */
export function htmlImageRasterKey(block: GuideImageBlock, settings: GuideHtmlImageSettings) {
  return JSON.stringify([
    block.assetId,
    settings.content,
    settings.content === 'frame'
      ? [
          block.frame.width,
          block.frame.height,
          block.fit,
          block.contentTransform.x,
          block.contentTransform.y,
          block.contentTransform.scale,
        ]
      : null,
    settings.optimize ? [settings.maxEdge, settings.quality] : null,
  ]);
}
