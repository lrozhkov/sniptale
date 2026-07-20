import { useMemo } from 'react';
import type { AIModel } from '../../../../../contracts/settings';
import { estimateTokens } from '../../../../parser/dom-tree-parser/ai/format';

function resolveSelectedModelSystemPrompt(
  availableModels: AIModel[],
  selectedModelId: string | null
): string {
  return availableModels.find((model) => model.id === selectedModelId)?.systemPrompt?.trim() ?? '';
}

function resolveEffectiveAIModalSystemPrompt(args: {
  availableModels: AIModel[];
  globalSystemPrompt: string;
  selectedModelId: string | null;
}): string {
  return (
    resolveSelectedModelSystemPrompt(args.availableModels, args.selectedModelId) ||
    args.globalSystemPrompt?.trim() ||
    ''
  );
}

function estimateAIModalTotalTokens(args: {
  availableModels: AIModel[];
  globalSystemPrompt: string;
  prompt: string;
  selectedData: string;
  selectedModelId: string | null;
}): number {
  return (
    estimateTokens(args.prompt) +
    estimateTokens(args.selectedData) +
    estimateTokens(
      resolveEffectiveAIModalSystemPrompt({
        availableModels: args.availableModels,
        globalSystemPrompt: args.globalSystemPrompt,
        selectedModelId: args.selectedModelId,
      })
    )
  );
}

export function useAIModalTotalTokens(args: {
  availableModels: AIModel[];
  globalSystemPrompt: string;
  prompt: string;
  selectedData: string;
  selectedModelId: string | null;
}) {
  const { availableModels, globalSystemPrompt, prompt, selectedData, selectedModelId } = args;

  return useMemo(
    () =>
      estimateAIModalTotalTokens({
        availableModels,
        globalSystemPrompt,
        prompt,
        selectedData,
        selectedModelId,
      }),
    [availableModels, globalSystemPrompt, prompt, selectedData, selectedModelId]
  );
}
