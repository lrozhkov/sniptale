import { useEffect, useMemo } from 'react';
import {
  resolveImageModelProfile,
  getImageModelOutputSize,
} from '../../contracts/ai/image-profile';
import { useAIScenarioModelSelection } from '../../workflows/ai-settings/use-scenario-model-selection';
import type { ImageEditorSession, ImageSessionState } from './session';

/** Coordinates model-specific parameters and preparation of the retained source. */
export function useImageModelSelection(session: ImageEditorSession, state: ImageSessionState) {
  const editing =
    state.draft.intention !== 'new-image' ||
    state.draft.references.length > 0 ||
    state.base !== null;
  const selection = useAIScenarioModelSelection(editing ? 'image-editing' : 'image-generation');
  const model = selection.configuration?.models.find((entry) => entry.id === selection.modelId);
  const provider = selection.configuration?.providers.find(
    (entry) => entry.id === model?.providerId
  );
  const profile = useMemo(
    () =>
      model && provider
        ? resolveImageModelProfile(model, provider, editing ? 'image-editing' : 'image-generation')
        : null,
    [model, provider, editing]
  );
  const profileKey =
    model && provider && profile
      ? `${model.id}:${provider.destinationBinding}:${JSON.stringify(profile)}`
      : '';
  useEffect(() => {
    if (profile && state.status === 'idle')
      session.configureParameters(profileKey, profile.defaults);
  }, [profile, profileKey, session, state.status]);
  const outputSize = useMemo(
    () => (profile ? getImageModelOutputSize(profile, state.draft.parameters) : null),
    [profile, state.draft.parameters]
  );
  useEffect(() => {
    if (state.status === 'idle') void session.prepareSource(outputSize);
  }, [
    session,
    state.status,
    state.source?.id,
    state.base?.stepId,
    state.base?.variant,
    outputSize,
  ]);
  const currentModel =
    model && provider?.destinationBinding
      ? {
          modelId: model.id,
          modelCode: model.modelCode,
          providerId: provider.id,
          destinationBinding: provider.destinationBinding,
          label: `${provider.name} / ${model.displayName}`,
        }
      : null;
  const modelChoiceRequired = Boolean(currentModel && session.modelChoiceRequired(currentModel));
  return { selection, model, profile, outputSize, currentModel, editing, modelChoiceRequired };
}
