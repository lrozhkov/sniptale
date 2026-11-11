import { useEffect, useMemo, useRef } from 'react';
import {
  resolveImageModelProfile,
  getImageModelInputSize,
  getImageEditFrameSize,
} from '../../contracts/ai/image-profile';
import { useAIScenarioModelSelection } from '../../workflows/ai-settings/use-scenario-model-selection';
import type { ImageBounds } from '../controller/ai-image/types';
import type { ImageEditorSession, ImageSessionState } from './session';

/** Coordinates model-specific parameters and preparation of the retained source. */
export function useImageModelSelection(
  session: ImageEditorSession,
  state: ImageSessionState,
  sourceSelection: { region: ImageBounds | null; key: string; selectedCount: number }
) {
  const captured = useRef('');
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
  const inputSize = useMemo(() => {
    if (state.source?.intention === 'region' || state.source?.intention === 'layers')
      return getImageEditFrameSize(profile, state.source.contextBounds);
    const base =
      state.base &&
      state.steps.find((step) => step.id === state.base?.stepId)?.variants[state.base.variant]
        ?.image;
    if (base && !getImageModelInputSize(profile, base)) return null;
    return state.source && state.source.intention !== 'new-image'
      ? getImageModelInputSize(profile, state.source.captureBounds)
      : null;
  }, [profile, state.source, state.base, state.steps]);
  const frozen = state.steps.some(
    (step) => step.operationId === state.operationId && step.variants.some(Boolean)
  );
  const captureKey = JSON.stringify([
    state.draft.intention,
    state.draft.context,
    state.draft.regionSource,
    sourceSelection.region,
    sourceSelection.key,
  ]);
  useEffect(() => {
    if (state.status !== 'idle') return;
    if (frozen || state.base || state.draft.intention === 'new-image') {
      void session.prepareSource(inputSize);
      return;
    }
    if (state.draft.intention === 'region' && !sourceSelection.region) return;
    if (state.draft.intention === 'layers' && !sourceSelection.selectedCount) {
      if (state.source) session.setDraft({ intention: 'layers' });
      return;
    }
    if (captured.current === captureKey && (state.source || state.error)) {
      if (state.source) void session.prepareSource(inputSize);
      return;
    }
    captured.current = captureKey;
    void session.refreshSource(sourceSelection.region ?? undefined);
  }, [
    session,
    state.status,
    state.source,
    state.base,
    frozen,
    state.error,
    state.draft.intention,
    sourceSelection.region,
    sourceSelection.selectedCount,
    captureKey,
    inputSize,
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
  return { selection, model, profile, inputSize, currentModel, editing, modelChoiceRequired };
}
