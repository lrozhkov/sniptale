import { syncVideoClipFrame } from '../../../media';
import { drawProjectFrame, type LoadedImagesMap } from '../../../renderer';
import { renderOffscreenProjectEffectFrames } from '../../../effect-runtime';
import {
  disposeEffectRuntimeComposition,
  type EffectRuntimeRenderedComposition,
} from '../../../../../features/video/composition/effect-runtime';
import type { RenderFrameDrivenCompositeFrameArgs } from './types';

type SyncVideoClipFrame = (
  job: RenderFrameDrivenCompositeFrameArgs['job'],
  project: RenderFrameDrivenCompositeFrameArgs['project'],
  currentTime: number,
  signal?: AbortSignal
) => Promise<void>;

type DrawProjectFrame = (
  context: RenderFrameDrivenCompositeFrameArgs['context'],
  project: RenderFrameDrivenCompositeFrameArgs['project'],
  settings: RenderFrameDrivenCompositeFrameArgs['settings'],
  currentTime: number,
  loadedImages: LoadedImagesMap,
  clipMediaElements: Map<string, HTMLMediaElement>,
  options?: {
    compositionIndex?: RenderFrameDrivenCompositeFrameArgs['compositionIndex'];
    effectRuntimeFrames?: EffectRuntimeRenderedComposition;
  }
) => void;

const syncVideoClipFrameForRender = syncVideoClipFrame as SyncVideoClipFrame;
const drawProjectFrameForRender = drawProjectFrame as DrawProjectFrame;

export async function prepareFrameDrivenCompositeFrame(
  args: RenderFrameDrivenCompositeFrameArgs
): Promise<void> {
  const { currentTime, job, project, signal, throwIfPipelineFailed } = args;

  if (job.cancelled || signal?.aborted) {
    throw new Error('PROJECT_EXPORT_CANCELLED');
  }

  throwIfPipelineFailed();
  await syncVideoClipFrameForRender(job, project, currentTime, signal);
  const effectRuntimeFrames = await renderFrameDrivenEffectFrames(args);
  try {
    if (job.cancelled || signal?.aborted) {
      throw new Error('PROJECT_EXPORT_CANCELLED');
    }
    drawFrameDrivenProjectFrame(args, effectRuntimeFrames);
  } finally {
    disposeEffectRuntimeComposition(effectRuntimeFrames);
  }
}

function renderFrameDrivenEffectFrames(args: RenderFrameDrivenCompositeFrameArgs) {
  const frameArgs = {
    ...(args.compositionIndex ? { compositionIndex: args.compositionIndex } : {}),
    clipMediaElements: args.job.clipMediaElements,
    currentTime: args.currentTime,
    loadedImages: args.loadedImages as LoadedImagesMap,
    ownerDocument: args.canvas.ownerDocument,
    project: args.project,
  };
  return args.effectRuntime
    ? args.effectRuntime.renderProjectFrames(frameArgs)
    : renderOffscreenProjectEffectFrames(frameArgs);
}

function drawFrameDrivenProjectFrame(
  args: RenderFrameDrivenCompositeFrameArgs,
  effectRuntimeFrames: EffectRuntimeRenderedComposition | undefined
) {
  const frameOptions = {
    ...(effectRuntimeFrames ? { effectRuntimeFrames } : {}),
  };
  if (args.compositionIndex) {
    drawProjectFrameForRender(
      args.context,
      args.project,
      args.settings,
      args.currentTime,
      args.loadedImages as LoadedImagesMap,
      args.job.clipMediaElements,
      { ...frameOptions, compositionIndex: args.compositionIndex }
    );
  } else {
    drawProjectFrameForRender(
      args.context,
      args.project,
      args.settings,
      args.currentTime,
      args.loadedImages as LoadedImagesMap,
      args.job.clipMediaElements,
      frameOptions
    );
  }
}
