import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../../../platform/module-loader/retryable-module-loader';

type AiPickRuntimeModule = typeof import('./runtime');

const aiPickRuntimeModuleLoader = createRetryableModuleLoader<AiPickRuntimeModule>(
  () => import('./runtime')
);
let aiPickEnableRequestVersion = 0;

export function preloadAiPickRuntime(): Promise<void> {
  return preloadModule(aiPickRuntimeModuleLoader);
}

export async function enableAiPickModeDeferred(
  ...args: Parameters<AiPickRuntimeModule['enableAiPickMode']>
): Promise<void> {
  const requestVersion = ++aiPickEnableRequestVersion;
  const { enableAiPickMode } = await aiPickRuntimeModuleLoader.load();
  if (requestVersion !== aiPickEnableRequestVersion) {
    return;
  }

  await enableAiPickMode(...args);
}

export function disableAiPickModeIfLoaded(): void {
  aiPickEnableRequestVersion += 1;
  aiPickRuntimeModuleLoader.getLoaded()?.disableAiPickMode();
}
