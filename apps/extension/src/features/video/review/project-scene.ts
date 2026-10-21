import type { VideoProject, VideoProjectVideoClip } from '../project/types/model';
import { VideoMediaFitMode } from '../project/types';
import { computeQuickEditSceneLayout, computeQuickEditSceneSize } from './advanced/scene';
import type { QuickEditAdvancedContent, QuickEditUiState } from './advanced/types';
import type { ReviewSource } from './types';

type SceneField = 'background' | 'canvas' | 'windowHeader';

/** Map supported authored scene fields into the existing editable Native scene and media fields. */
export function planReviewProjectScene(args: {
  content: QuickEditAdvancedContent;
  ui: QuickEditUiState;
  source: ReviewSource;
}):
  | { status: 'blocked'; fields: SceneField[] }
  | {
      status: 'prepared';
      scene: Pick<VideoProject, 'width' | 'height' | 'sceneBackground'>;
      video: Pick<VideoProjectVideoClip, 'transform' | 'fitMode'> &
        Partial<
          Pick<
            VideoProjectVideoClip,
            | 'sourceCrop'
            | 'windowHeader'
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
    if (content.canvas) fields.push('canvas');
    if (content.windowHeader) fields.push('windowHeader');
  }
  if (
    (background.enabled && (ui.mode === 'basic' || background.type === 'image')) ||
    background.rememberedImage ||
    background.rememberedLayout ||
    (background.zoomBehavior !== undefined && background.zoomBehavior !== 'window')
  )
    fields.push('background');
  if (fields.length) return { status: 'blocked', fields };
  const input = {
    source,
    background,
    ...(content.canvas ? { canvas: content.canvas } : {}),
    ...(content.windowHeader ? { windowHeader: content.windowHeader } : {}),
  };
  const size = computeQuickEditSceneSize(input);
  const layout = computeQuickEditSceneLayout({
    ...input,
    output: size,
    camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  });
  const paint = background.rememberedPaint;
  const remembered = paint ? { [paint.kind]: structuredClone(paint) } : undefined;
  const fill =
    background.enabled && background.type === 'gradient'
      ? { kind: 'gradient' as const, gradient: structuredClone(background.gradient) }
      : {
          kind: 'solid' as const,
          color: background.enabled && background.type === 'solid' ? background.color : '#00000000',
        };
  return {
    status: 'prepared',
    scene: {
      width: size.width,
      height: size.height,
      sceneBackground: {
        ...fill,
        ...(background.enabled && background.layout.blur !== undefined
          ? { blur: background.layout.blur }
          : {}),
        ...(remembered ? { remembered } : {}),
      },
    },
    video: {
      transform: { ...layout.windowRect, rotation: 0, opacity: 1 },
      fitMode: VideoMediaFitMode.CONTAIN,
      ...(layout.sourceCrop ? { sourceCrop: layout.sourceCrop } : {}),
      ...(content.windowHeader ? { windowHeader: structuredClone(content.windowHeader) } : {}),
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
