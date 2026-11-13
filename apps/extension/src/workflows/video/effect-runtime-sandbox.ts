import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime';
import type {
  EffectRuntimeFrameFailure,
  EffectRuntimeRenderCommand,
  EffectRuntimeSandboxExecutor,
  EffectRuntimeSceneResult,
} from '../../contracts/effect-runtime/types';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import { EffectRuntimeSandboxSessionManager } from './effect-runtime-sandbox-session';

export { EFFECT_RUNTIME_SANDBOX_PAGE_PATH } from './effect-runtime-sandbox-session';

export type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';

export function createEffectRuntimeSandboxExecutor(
  args: {
    ownerDocument?: Document;
    timeoutMs?: number;
    compositionBackend?: 'gpu-preview' | 'gpu-scene' | 'gpu-scene-plan';
  } = {}
): EffectRuntimeSandboxExecutor {
  const ownerDocument = args.ownerDocument ?? document;
  const loadTimeoutMs = resolveTimeout(
    args.timeoutMs,
    EFFECT_RUNTIME_RESOURCE_LIMITS.sandboxLoadTimeoutMs
  );
  const requestTimeoutMs = resolveTimeout(
    args.timeoutMs,
    EFFECT_RUNTIME_RESOURCE_LIMITS.sandboxRequestTimeoutMs
  );
  const createManager = () =>
    new EffectRuntimeSandboxSessionManager(ownerDocument, {
      loadTimeoutMs,
      requestTimeoutMs,
      ...(args.compositionBackend ? { compositionBackend: args.compositionBackend } : {}),
    });
  let manager = createManager();
  let disposed = false;
  let foregroundUsed = false;
  type WarmSession = {
    manager: EffectRuntimeSandboxSessionManager;
    pending: number;
    ready: boolean;
    closed: boolean;
    retired: boolean;
    adopted: boolean;
  };
  let standby: WarmSession | undefined;
  const retire = (warm: WarmSession | undefined) => {
    if (!warm || warm.retired || warm.adopted) return;
    warm.retired = true;
    if (standby === warm) standby = undefined;
    warm.manager.dispose();
  };
  const foreground = () => {
    if (!foregroundUsed && !disposed) {
      foregroundUsed = true;
      const warm = standby;
      if (warm?.ready && !warm.pending && !warm.retired) {
        standby = undefined;
        warm.adopted = true;
        manager.dispose();
        manager = warm.manager;
      } else retire(warm);
    }
    return manager;
  };
  const createWarmExecutor = (): EffectRuntimeSandboxExecutor | undefined => {
    if (disposed || foregroundUsed || (standby && !standby.closed)) return undefined;
    retire(standby);
    const warm: WarmSession = {
      manager: createManager(),
      pending: 0,
      ready: false,
      closed: false,
      retired: false,
      adopted: false,
    };
    standby = warm;
    warm.manager.preload();
    const run = async <T extends EffectRuntimeSceneResult>(
      request: EffectRuntimeRenderCommand,
      render: () => Promise<T>
    ): Promise<T | EffectRuntimeFrameFailure> => {
      if (warm.closed || warm.retired || warm.adopted)
        return createEffectRuntimeFailure(request, 'stale');
      warm.pending++;
      warm.ready = false;
      try {
        const result = await render();
        if (result.kind === 'error') retire(warm);
        else if (!warm.retired) warm.ready = true;
        return result;
      } catch (error) {
        retire(warm);
        throw error;
      } finally {
        warm.pending--;
      }
    };
    return {
      maximumGpuFramesInFlight: 2,
      maximumWarmFrames: 4,
      preload: () => {
        if (!warm.closed && !warm.retired && !warm.adopted) warm.manager.preload();
      },
      prepareGpuFrame: (request) => run(request, () => warm.manager.prepareGpuFrame(request)),
      renderFrame: (request) => run(request, () => warm.manager.renderFrame(request)),
      dispose: () => {
        if (warm.closed) return;
        warm.closed = true;
        // The parent retains only idle successful startup state; foreground never waits for it.
        if (!warm.ready || warm.pending) retire(warm);
      },
    };
  };
  const scene =
    args.compositionBackend === 'gpu-scene' || args.compositionBackend === 'gpu-scene-plan';
  if (scene) manager.preload();
  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      retire(standby);
      manager.dispose();
    },
    ...(scene
      ? {
          maximumGpuFramesInFlight: 2 as const,
          createWarmExecutor,
          preload: () => {
            if (!disposed) manager.preload();
          },
          prepareGpuFrame: (request: EffectRuntimeRenderCommand) =>
            foreground().prepareGpuFrame(request),
        }
      : {}),
    renderFrame: (request) => foreground().renderFrame(request),
  };
}

function resolveTimeout(explicitTimeoutMs: number | undefined, maximumTimeoutMs: number): number {
  return Math.min(maximumTimeoutMs, Math.max(1, explicitTimeoutMs ?? maximumTimeoutMs));
}
