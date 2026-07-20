import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../../../../platform/module-loader/retryable-module-loader';
import type { AiPickControllerContext } from '../types';

type AiPickSubmitModule = typeof import('.');

const aiPickSubmitModuleLoader = createRetryableModuleLoader<AiPickSubmitModule>(() => import('.'));

export function preloadAiPickSubmit(): Promise<void> {
  return preloadModule(aiPickSubmitModuleLoader);
}

export async function submitAiPickPromptDeferred(
  context: AiPickControllerContext,
  prompt: string,
  selectedData?: string,
  modelId?: string | null
) {
  const { submitAiPickPrompt } = await aiPickSubmitModuleLoader.load();
  return submitAiPickPrompt(context, prompt, selectedData, modelId);
}
