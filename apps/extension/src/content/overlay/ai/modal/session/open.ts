import { useEffect } from 'react';
import { reconcileSelectedAIModelId } from '../../../../../features/ai/selection';
import { createLogger } from '@sniptale/platform/observability/logger';
import { requestAIModelSelectionBootstrap } from '../../../../../workflows/ai-settings/query';
import type { AIModalOpenBootstrapEffectProps } from './boot-props';

const logger = createLogger({ namespace: 'content:ai-modal:state' });

function initializeAIModalBootstrapData(
  args: Pick<
    AIModalOpenBootstrapEffectProps,
    'setAvailableModels' | 'setGlobalSystemPrompt' | 'setProviders' | 'setSelectedModelId'
  >
) {
  let cancelled = false;

  void requestAIModelSelectionBootstrap()
    .then(async ({ defaultModelId, globalSystemPrompt, models, providers }) => {
      const selectedModelId = await reconcileSelectedAIModelId(models, defaultModelId);

      return {
        globalSystemPrompt: globalSystemPrompt ?? '',
        models,
        providers,
        selectedModelId,
      };
    })
    .then(({ globalSystemPrompt, models, providers, selectedModelId }) => {
      if (cancelled) {
        return;
      }

      args.setAvailableModels(models);
      args.setGlobalSystemPrompt(globalSystemPrompt);
      args.setProviders(providers);
      args.setSelectedModelId(selectedModelId);
    })
    .catch((error) => logger.error('Failed to load AI settings.', error));

  return () => {
    cancelled = true;
  };
}

export function useAIModalOpenBootstrapEffect(args: AIModalOpenBootstrapEffectProps) {
  const { bootedWhileOpenRef, isOpen, lastPrompt, prompt, setAvailableModels, setPrompt } = args;
  const { setGlobalSystemPrompt, setProviders, setSelectedModelId, textareaRef } = args;

  useEffect(() => {
    if (!isOpen || bootedWhileOpenRef.current) {
      return;
    }

    bootedWhileOpenRef.current = true;

    if (!prompt && lastPrompt) {
      setPrompt(lastPrompt);
    }

    const focusTimeout = window.setTimeout(() => textareaRef.current?.focus(), 100);
    const cancelBootstrapLoad = initializeAIModalBootstrapData({
      setAvailableModels,
      setGlobalSystemPrompt,
      setProviders,
      setSelectedModelId,
    });

    return () => {
      cancelBootstrapLoad();
      window.clearTimeout(focusTimeout);
    };
  }, [
    bootedWhileOpenRef,
    isOpen,
    lastPrompt,
    prompt,
    setAvailableModels,
    setGlobalSystemPrompt,
    setPrompt,
    setProviders,
    setSelectedModelId,
    textareaRef,
  ]);
}
