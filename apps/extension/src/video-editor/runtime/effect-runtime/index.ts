import type { EffectRuntimeSandboxExecutor } from '../../../contracts/effect-runtime/types';
import { createEffectRuntimeSandboxExecutor } from '../../../workflows/video/effect-runtime-sandbox';

export interface VideoEditorEffectRuntime {
  dispose(): void;
  executor: EffectRuntimeSandboxExecutor;
  ownerDocument: Document;
}

export function createVideoEditorEffectRuntime(args: {
  ownerDocument: Document;
}): VideoEditorEffectRuntime {
  const executor = createEffectRuntimeSandboxExecutor({ ownerDocument: args.ownerDocument });
  return {
    dispose: () => executor.dispose(),
    executor,
    ownerDocument: args.ownerDocument,
  };
}
