import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import type { VideoPreviewRenderer } from '../../../features/video/preview/preferences';
import { createEffectRuntimeSandboxExecutor } from '../../../workflows/video/effect-runtime-sandbox';

export interface VideoEditorEffectRuntime {
  renderer: VideoPreviewRenderer;
  dispose(): void;
  executor: EffectRuntimeSandboxExecutor;
  ownerDocument: Document;
}

export function createVideoEditorEffectRuntime(args: {
  ownerDocument: Document;
  renderer?: VideoPreviewRenderer;
}): VideoEditorEffectRuntime {
  const executor = createEffectRuntimeSandboxExecutor({
    ownerDocument: args.ownerDocument,
    ...(args.renderer === 'legacy' ? {} : { compositionBackend: 'gpu-preview' }),
  });
  return {
    renderer: args.renderer ?? 'gpu',
    dispose: () => executor.dispose(),
    executor,
    ownerDocument: args.ownerDocument,
  };
}
