import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIPersistedScenario } from '../../contracts/settings/ai-catalog';
import { rememberAIScenarioModelSelection, requestAIScenarioModelSelection } from './query';

type Context = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
type Choice = { context: Context; modelId: string; source: 'explicit' | 'initial' };

function hasSameModel(choice: Choice, context: Context): boolean {
  const before = choice.context.models.find((model) => model.id === choice.modelId);
  const after = context.models.find((model) => model.id === choice.modelId);
  const previousProvider = choice.context.providers.find(
    (provider) => provider.id === before?.providerId
  );
  const currentProvider = context.providers.find((provider) => provider.id === after?.providerId);
  return Boolean(
    before &&
    after &&
    previousProvider &&
    currentProvider &&
    before.modelCode === after.modelCode &&
    before.providerId === after.providerId &&
    previousProvider.incarnation === currentProvider.incarnation &&
    previousProvider.connectionType === currentProvider.connectionType
  );
}

/** Owns one mounted interface choice. Opening or reloading an interface never writes a preference. */
export function useAIScenarioModelSelection(scenario: AIPersistedScenario) {
  const [configuration, setConfiguration] = useState<Context | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [configurationFailed, setConfigurationFailed] = useState(false);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [selectionUnavailable, setSelectionUnavailable] = useState(false);
  const [selectionPending, setSelectionPending] = useState(false);
  const context = useRef<Context | null>(null);
  const choice = useRef<Choice | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);

  const reload = useCallback(async () => {
    const request = ++generation.current;
    setConfigurationFailed(false);
    try {
      const next = await requestAIScenarioModelSelection(scenario);
      if (!active.current || generation.current !== request) return;
      context.current = next;
      setConfiguration(next);
      if (choice.current) {
        const usable = hasSameModel(choice.current, next);
        setModelId(usable ? choice.current.modelId : null);
        setSelectionUnavailable(!usable);
      } else {
        const candidate = next.resolution.modelId;
        if (candidate)
          choice.current = {
            context: next,
            modelId: candidate,
            source: next.remembered?.source ?? 'initial',
          };
        setModelId(candidate);
        setSelectionUnavailable(next.resolution.status === 'unavailable');
      }
    } catch {
      if (active.current && generation.current === request) setConfigurationFailed(true);
    }
  }, [scenario]);

  useEffect(() => {
    active.current = true;
    context.current = null;
    choice.current = null;
    setConfiguration(null);
    setModelId(null);
    setSelectionUnavailable(false);
    void reload();
    return () => {
      active.current = false;
      generation.current += 1;
    };
  }, [reload]);

  const chooseModel = (id: string | null) => {
    const current = context.current;
    if (!id || !current || busy.current) return;
    busy.current = true;
    setSelectionPending(true);
    setSelectionFailed(false);
    setConfigurationFailed(false);
    void rememberAIScenarioModelSelection(current, scenario, id, 'explicit')
      .then(() => {
        if (!active.current || context.current?.scenario !== scenario) return;
        const selected: Choice = { context: current, modelId: id, source: 'explicit' };
        choice.current = selected;
        const usable = context.current !== null && hasSameModel(selected, context.current);
        setModelId(usable ? id : null);
        setSelectionUnavailable(!usable);
      })
      .catch(() => {
        if (active.current) setSelectionFailed(true);
      })
      .finally(() => {
        busy.current = false;
        if (active.current) setSelectionPending(false);
      });
  };

  const prepareModelSelection = async (signal?: AbortSignal): Promise<string> => {
    const selected = choice.current;
    if (!selected || !modelId || busy.current) throw new Error('Select an available AI model.');
    busy.current = true;
    setSelectionPending(true);
    try {
      signal?.throwIfAborted();
      const next = await requestAIScenarioModelSelection(scenario);
      signal?.throwIfAborted();
      if (!active.current || context.current?.scenario !== scenario)
        throw new Error('AI interface is closed.');
      if (!hasSameModel(selected, next)) {
        setModelId(null);
        setSelectionUnavailable(true);
        context.current = next;
        setConfiguration(next);
        throw new Error('The selected AI model is unavailable. Select another model.');
      }
      await rememberAIScenarioModelSelection(next, scenario, selected.modelId, selected.source);
      signal?.throwIfAborted();
      return selected.modelId;
    } finally {
      busy.current = false;
      if (active.current) setSelectionPending(false);
    }
  };

  return {
    configuration,
    configurationFailed,
    modelId,
    selectionUnavailable,
    selectionFailed,
    selectionPending,
    chooseModel,
    prepareModelSelection,
    retryConfiguration: () => void reload(),
  };
}
