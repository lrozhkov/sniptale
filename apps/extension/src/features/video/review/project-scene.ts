import type {
  VideoProject,
  VideoProjectAsset,
  VideoProjectVideoClip,
} from '../project/types/model';
import { isVideoProjectAsset } from '../project/validation/assets';
import { VideoMediaFitMode } from '../project/types';
import { fitQuickEditSourceCrop } from './advanced/canvas';
import { computeQuickEditSceneLayout, computeQuickEditSceneSize } from './advanced/scene';
import type { QuickEditAdvancedContent, QuickEditUiState } from './advanced/types';
import type { ReviewSource } from './types';

type SceneField = 'background' | 'canvas' | 'windowHeader' | 'watermark' | 'scene-assets';

/** Admitted material supplied by the existing resource-acquisition workflow. */
export interface ReviewProjectSceneImageResource {
  reviewAssetId: string;
  asset: VideoProjectAsset;
}

/** Include retained images independently of their current display mode. */
export function reviewProjectSceneImageReferences(content: QuickEditAdvancedContent): string[] {
  const background = content.background;
  return [
    ...new Set([
      ...(background.enabled && background.type === 'image' ? [background.assetId] : []),
      ...(background.rememberedImage ? [background.rememberedImage.assetId] : []),
      ...(content.watermark?.image ? [content.watermark.image.assetId] : []),
    ]),
  ];
}

function planSceneImages(
  content: QuickEditAdvancedContent,
  supplied: readonly ReviewProjectSceneImageResource[]
): Map<string, VideoProjectAsset> | null {
  const references = new Set(reviewProjectSceneImageReferences(content));
  if (supplied.length !== references.size) return null;
  const images = new Map<string, VideoProjectAsset>();
  const ids = new Set<string>();
  for (const { reviewAssetId, asset } of supplied) {
    if (
      !references.has(reviewAssetId) ||
      images.has(reviewAssetId) ||
      !isVideoProjectAsset(asset) ||
      ids.has(asset.id) ||
      asset.type !== 'IMAGE' ||
      !asset.id ||
      asset.source.kind !== 'project-asset' ||
      !/^project-asset:\S{1,242}$/u.test(reviewAssetId) ||
      asset.source.projectAssetId !== reviewAssetId.slice('project-asset:'.length) ||
      !Number.isInteger(asset.metadata.width) ||
      asset.metadata.width <= 0 ||
      !Number.isInteger(asset.metadata.height) ||
      asset.metadata.height <= 0 ||
      asset.metadata.duration !== null ||
      asset.metadata.hasAudio ||
      !asset.metadata.mimeType.startsWith('image/')
    )
      return null;
    images.set(reviewAssetId, structuredClone(asset));
    ids.add(asset.id);
  }
  const watermark = content.watermark?.image;
  if (watermark) {
    const image = images.get(watermark.assetId);
    if (
      !image ||
      image.metadata.width !== watermark.width ||
      image.metadata.height !== watermark.height
    )
      return null;
  }
  return images;
}

/** Map supported authored scene fields into the existing editable Native scene and media fields. */
export function planReviewProjectScene(args: {
  content: QuickEditAdvancedContent;
  ui: QuickEditUiState;
  source: ReviewSource;
  imageAssets?: readonly ReviewProjectSceneImageResource[];
}):
  | { status: 'blocked'; fields: SceneField[] }
  | {
      status: 'prepared';
      assets: VideoProjectAsset[];
      scene: Pick<VideoProject, 'width' | 'height' | 'sceneBackground'> &
        Partial<Pick<VideoProject, 'watermark' | 'rememberedCanvas'>>;
      video: Pick<VideoProjectVideoClip, 'transform' | 'fitMode'> &
        Partial<
          Pick<
            VideoProjectVideoClip,
            | 'sourceCrop'
            | 'rememberedSourceCrop'
            | 'windowHeader'
            | 'rememberedWindowHeader'
            | 'windowCornerRadius'
            | 'shadowIntensity'
            | 'shadowColor'
            | 'shadowMode'
          >
        >;
    } {
  const { content, ui, source } = args;
  const background = content.background;
  const fields: SceneField[] = [];
  if (ui.mode === 'basic') {
    if (content.watermark && content.watermark.mode !== 'none') fields.push('watermark');
  }
  if (
    (background.enabled && ui.mode === 'basic') ||
    background.rememberedLayout ||
    (background.zoomBehavior !== undefined && background.zoomBehavior !== 'window')
  )
    fields.push('background');
  if (fields.length) return { status: 'blocked', fields };
  const images = planSceneImages(content, args.imageAssets ?? []);
  if (!images) return { status: 'blocked', fields: ['scene-assets'] };
  const input = {
    source,
    background,
    ...(ui.mode === 'advanced' && content.canvas ? { canvas: content.canvas } : {}),
    ...(ui.mode === 'advanced' && content.windowHeader
      ? { windowHeader: content.windowHeader }
      : {}),
  };
  const size = computeQuickEditSceneSize(input);
  const layout = computeQuickEditSceneLayout({
    ...input,
    output: size,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const paint = background.rememberedPaint;
  const remembered = {
    ...(paint ? { [paint.kind]: structuredClone(paint) } : {}),
    ...(background.rememberedImage
      ? {
          image: {
            kind: 'image' as const,
            assetId: images.get(background.rememberedImage.assetId)!.id,
            imageFit: background.rememberedImage.imageFit,
          },
        }
      : {}),
  };
  const fill =
    background.enabled && background.type === 'image'
      ? {
          kind: 'image' as const,
          assetId: images.get(background.assetId)!.id,
          imageFit: background.imageFit,
        }
      : background.enabled && background.type === 'gradient'
        ? { kind: 'gradient' as const, gradient: structuredClone(background.gradient) }
        : {
            kind: 'solid' as const,
            color:
              background.enabled && background.type === 'solid' ? background.color : '#00000000',
          };
  return {
    status: 'prepared',
    assets: [...images.values()],
    scene: {
      width: size.width,
      height: size.height,
      ...(ui.mode === 'basic' && content.canvas
        ? { rememberedCanvas: { width: content.canvas.width, height: content.canvas.height } }
        : {}),
      ...(content.watermark
        ? {
            watermark: {
              ...structuredClone(content.watermark),
              ...(content.watermark.image
                ? {
                    image: {
                      ...structuredClone(content.watermark.image),
                      assetId: `project-asset:${images.get(content.watermark.image.assetId)!.id}`,
                    },
                  }
                : {}),
            },
          }
        : {}),
      sceneBackground: {
        ...fill,
        ...(background.enabled && background.layout.blur !== undefined
          ? { blur: background.layout.blur }
          : {}),
        ...(Object.keys(remembered).length ? { remembered } : {}),
      },
    },
    video: {
      transform: { ...layout.windowRect, rotation: 0, opacity: 1 },
      fitMode: VideoMediaFitMode.CONTAIN,
      ...(layout.sourceCrop ? { sourceCrop: layout.sourceCrop } : {}),
      ...(ui.mode === 'basic' && content.canvas?.crop
        ? {
            rememberedSourceCrop: fitQuickEditSourceCrop(
              source,
              content.canvas,
              content.canvas.crop
            ),
          }
        : {}),
      ...(content.windowHeader
        ? ui.mode === 'advanced'
          ? { windowHeader: structuredClone(content.windowHeader) }
          : { rememberedWindowHeader: structuredClone(content.windowHeader) }
        : {}),
      ...(background.enabled
        ? {
            windowCornerRadius: background.layout.cornerRadius,
            ...(background.layout.shadow
              ? {
                  shadowIntensity: background.layout.shadow.intensity,
                  shadowColor: background.layout.shadow.color,
                  shadowMode: 'BACKDROP' as const,
                }
              : {}),
          }
        : {}),
    },
  };
}
