import { EFFECT_RUNTIME_RESOURCE_LIMITS } from '../../features/video/composition/effect-runtime';
import type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';
import { EffectRuntimeSandboxSessionManager } from './effect-runtime-sandbox-session';

export { EFFECT_RUNTIME_SANDBOX_PAGE_PATH } from './effect-runtime-sandbox-session';

export type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';

export function createEffectRuntimeSandboxExecutor(
  args: { ownerDocument?: Document; timeoutMs?: number } = {}
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
  const manager = new EffectRuntimeSandboxSessionManager(ownerDocument, {
    loadTimeoutMs,
    requestTimeoutMs,
  });
  return {
    dispose: () => manager.dispose(),
    renderFrame: (request) => manager.renderFrame(request),
  };
}

function resolveTimeout(explicitTimeoutMs: number | undefined, maximumTimeoutMs: number): number {
  return Math.min(maximumTimeoutMs, Math.max(1, explicitTimeoutMs ?? maximumTimeoutMs));
}
