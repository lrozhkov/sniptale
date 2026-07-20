import {
  renderEffectRuntimeComposition,
  type EffectRuntimeRenderedComposition,
} from '../../../features/video/composition/effect-runtime';
import type { VideoCompositionMediaSource } from '../../../features/video/composition/draw/media-source';
import type { VideoCompositionTimelineIndex } from '../../../features/video/composition/timeline/frame';
import { resolveVideoCompositionRenderPasses } from '../../../features/video/composition/timeline/render';
import type { VideoProject } from '../../../features/video/project/types';
import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import { createEffectRuntimeSandboxExecutor } from '../../../workflows/video/effect-runtime-sandbox';
import type { LoadedImagesMap } from '../renderer';

export interface RenderOffscreenProjectEffectFramesInput {
  compositionIndex?: VideoCompositionTimelineIndex;
  clipMediaElements: ReadonlyMap<string, VideoCompositionMediaSource>;
  currentTime: number;
  loadedImages: LoadedImagesMap;
  ownerDocument?: Document;
  project: VideoProject;
}

export interface OffscreenProjectEffectRuntime {
  dispose(): void;
  renderProjectFrames(
    args: RenderOffscreenProjectEffectFramesInput
  ): Promise<EffectRuntimeRenderedComposition | undefined>;
}

export function createOffscreenProjectEffectRuntime(
  args: { ownerDocument?: Document } = {}
): OffscreenProjectEffectRuntime {
  let executor: EffectRuntimeSandboxExecutor | null = null;
  return {
    dispose() {
      executor?.dispose();
      executor = null;
    },
    async renderProjectFrames(projectArgs) {
      if (!projectArgs.project.effectInstances?.some(({ enabled }) => enabled)) return undefined;
      const renderPasses = resolveVideoCompositionRenderPasses(
        projectArgs.project,
        projectArgs.currentTime,
        projectArgs.compositionIndex ? { timelineIndex: projectArgs.compositionIndex } : undefined
      );
      if (!hasEffectRuntimePlans(renderPasses)) return undefined;
      executor ??= createEffectRuntimeSandboxExecutor({
        ...((projectArgs.ownerDocument ?? args.ownerDocument)
          ? { ownerDocument: projectArgs.ownerDocument ?? args.ownerDocument }
          : {}),
      });
      return renderEffectRuntimeComposition({
        clipMediaElements: projectArgs.clipMediaElements,
        executor,
        imageBank: projectArgs.loadedImages,
        overlayFrame: renderPasses.overlayFrame,
        overlayTime: projectArgs.currentTime,
        ...(projectArgs.ownerDocument ? { ownerDocument: projectArgs.ownerDocument } : {}),
        visualPasses: renderPasses.visualPasses,
      });
    },
  };
}

export async function renderOffscreenProjectEffectFrames(
  args: RenderOffscreenProjectEffectFramesInput
): Promise<EffectRuntimeRenderedComposition | undefined> {
  const runtime = createOffscreenProjectEffectRuntime({
    ...(args.ownerDocument ? { ownerDocument: args.ownerDocument } : {}),
  });
  try {
    return await runtime.renderProjectFrames(args);
  } finally {
    runtime.dispose();
  }
}

function hasEffectRuntimePlans(
  renderPasses: ReturnType<typeof resolveVideoCompositionRenderPasses>
): boolean {
  return (
    (renderPasses.overlayFrame.effectRuntimePlans ?? []).length > 0 ||
    renderPasses.visualPasses.some(({ frame }) => (frame.effectRuntimePlans ?? []).length > 0)
  );
}
