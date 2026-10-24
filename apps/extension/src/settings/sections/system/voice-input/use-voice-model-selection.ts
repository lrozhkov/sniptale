import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  VoiceInputPreferences,
  VoiceProviderSelection,
} from '@sniptale/runtime-contracts/voice-input';
import type { AIModelSelectionBootstrapPayload } from '../../../../contracts/messaging/ai-settings-runtime';
import {
  requestAIModelSelectionBootstrap,
  requestAISettingsPageRuntimeData,
} from '../../../../workflows/ai-settings/query';
import {
  saveVoiceInputCorrectionSystemPrompt,
  resetVoiceInputCorrectionSystemPrompt,
} from '../../../runtime/ai-settings/mutations';

const EMPTY_CATALOG: AIModelSelectionBootstrapPayload = {
  chromeAiEnabled: false,
  defaultModelId: null,
  globalSystemPrompt: '',
  models: [],
  providers: [],
};
const defaultDeps = {
  bootstrap: requestAIModelSelectionBootstrap,
  prompt: async () =>
    (await requestAISettingsPageRuntimeData()).voiceInputCorrectionSystemPrompt ?? '',
  savePrompt: saveVoiceInputCorrectionSystemPrompt,
  resetPrompt: resetVoiceInputCorrectionSystemPrompt,
};

/** Accepts only configured providers with a destination binding; selection never grants permission. */
export function voiceProviderSelection(
  catalog: AIModelSelectionBootstrapPayload,
  modelId: string | null
): VoiceProviderSelection | null {
  const model = catalog.models.find((item) => item.id === modelId);
  const provider = catalog.providers.find((item) => item.id === model?.providerId);
  if (
    !model ||
    !provider ||
    provider.connectionType !== 'openai-compatible' ||
    !provider.destinationBinding
  )
    return null;
  return {
    modelId: model.id,
    approvedProviderId: provider.id,
    approvedDestination: provider.destinationBinding,
    approvedModelCode: model.modelCode,
  };
}
function availableCatalog(
  catalog: AIModelSelectionBootstrapPayload
): AIModelSelectionBootstrapPayload {
  return {
    ...catalog,
    models: catalog.models.filter((model) => voiceProviderSelection(catalog, model.id) !== null),
  };
}

export function useVoiceModelSelection(args: {
  preferences: VoiceInputPreferences;
  updatePreference(patch: Partial<VoiceInputPreferences>): Promise<void>;
  deps?: typeof defaultDeps;
}) {
  const deps = args.deps ?? defaultDeps;
  const generation = useRef(0);
  const [transcription, setTranscription] = useState(EMPTY_CATALOG);
  const [correction, setCorrection] = useState(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [acceptedPrompt, setAcceptedPrompt] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);
  const promptMutation = useRef(false);
  const currentDraft = useRef({ prompt, acceptedPrompt });
  currentDraft.current = { prompt, acceptedPrompt };
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const [asr, text, value] = await Promise.all([
        deps.bootstrap('transcription'),
        deps.bootstrap('text'),
        deps.prompt(),
      ]);
      if (current !== generation.current) return;
      setTranscription(availableCatalog(asr));
      setCorrection(availableCatalog(text));
      if (currentDraft.current.prompt === currentDraft.current.acceptedPrompt) setPrompt(value);
      setAcceptedPrompt(value);
    } catch {
      if (current === generation.current) setError(true);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [deps]);
  useEffect(() => {
    void refresh();
    return () => {
      generation.current += 1;
    };
  }, [refresh]);

  const mutatePrompt = async (reset: boolean) => {
    const current = generation.current;
    if (promptMutation.current) return;
    promptMutation.current = true;
    setPromptSaving(true);
    setError(false);
    try {
      if (reset) await deps.resetPrompt();
      else await deps.savePrompt(prompt);
      const value = reset ? await deps.prompt() : prompt;
      if (current !== generation.current) return;
      setPrompt(value);
      setAcceptedPrompt(value);
    } catch {
      if (current === generation.current) setError(true);
    } finally {
      promptMutation.current = false;
      if (current === generation.current) setPromptSaving(false);
    }
  };
  const currentSelectionId = (
    catalog: AIModelSelectionBootstrapPayload,
    selected: VoiceProviderSelection | null | undefined
  ) => {
    if (!selected) return null;
    const current = voiceProviderSelection(catalog, selected.modelId);
    return current &&
      current.approvedProviderId === selected.approvedProviderId &&
      current.approvedDestination === selected.approvedDestination &&
      current.approvedModelCode === selected.approvedModelCode
      ? selected.modelId
      : null;
  };
  return {
    transcriptionSelectionId: currentSelectionId(transcription, args.preferences.transcription),
    correctionSelectionId: currentSelectionId(correction, args.preferences.correction?.model),
    transcription,
    correction,
    loading,
    error,
    prompt,
    promptSaving,
    promptDirty: prompt !== acceptedPrompt,
    refresh,
    setPrompt,
    savePrompt: () => mutatePrompt(false),
    resetPrompt: () => mutatePrompt(true),
    selectTranscription: (id: string | null) =>
      args.updatePreference({ transcription: voiceProviderSelection(transcription, id) }),
    selectCorrection: (id: string | null) =>
      args.updatePreference({
        correction: {
          enabled: args.preferences.correction?.enabled ?? false,
          model: voiceProviderSelection(correction, id),
        },
      }),
  };
}
export type VoiceModelSelectionController = ReturnType<typeof useVoiceModelSelection>;
