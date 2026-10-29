import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIPersistedScenario } from '../../contracts/settings/ai-catalog';
import {
  rememberAIScenarioModelSelection,
  requestAIScenarioModelSelection,
  refreshManagedAICatalogs,
} from './query';

type Context = Awaited<ReturnType<typeof requestAIScenarioModelSelection>>;
type Choice = {
  context: Context | null;
  modelId: string;
  displayName: string | null;
  source: 'explicit' | 'initial';
};

function captureChoice(context: Context, modelId: string, source: Choice['source']): Choice {
  return {
    context,
    modelId,
    displayName:
      context.models.find((model) => model.id === modelId)?.displayName ??
      context.remembered?.displayName ??
      null,
    source,
  };
}

function captureInitialChoice(context: Context): Choice | null {
  const modelId = context.resolution.modelId;
  if (modelId) return captureChoice(context, modelId, context.remembered?.source ?? 'initial');
  const remembered = context.remembered;
  if (!remembered) return null;
  return {
    // An unavailable saved identity cannot authorize recreated current records.
    context: null,
    modelId: remembered.modelId,
    displayName: remembered.displayName,
    source: remembered.source,
  };
}

function hasSameModel(choice: Choice, context: Context): boolean {
  if (!choice.context) return false;
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
    previousProvider.connectionType === currentProvider.connectionType &&
    previousProvider.destinationBinding === currentProvider.destinationBinding
  );
}

/** Owns one mounted interface choice. Opening or reloading an interface never writes a preference. */
export function useAIScenarioModelSelection(scenario: AIPersistedScenario, enabled = true) {
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
    const apply = (next: Context) => {
      if (!active.current || generation.current !== request) return;
      context.current = next;
      setConfiguration(next);
      if (choice.current) {
        const usable = hasSameModel(choice.current, next);
        setModelId(usable ? choice.current.modelId : null);
        setSelectionUnavailable(!usable);
      } else {
        const candidate = next.resolution.modelId;
        choice.current = captureInitialChoice(next);
        setModelId(candidate);
        setSelectionUnavailable(next.resolution.status === 'unavailable');
      }
    };
    try {
      apply(await requestAIScenarioModelSelection(scenario));
    } catch {
      if (active.current && generation.current === request) setConfigurationFailed(true);
      return;
    }
    if (!active.current || generation.current !== request) return;
    try {
      await refreshManagedAICatalogs();
      if (!active.current || generation.current !== request) return;
      apply(await requestAIScenarioModelSelection(scenario));
    } catch {
      // Advisory metadata failure preserves the usable local catalog and visible choice.
    }
  }, [scenario]);

  useEffect(() => {
    active.current = enabled;
    context.current = null;
    choice.current = null;
    setConfiguration(null);
    setModelId(null);
    setSelectionUnavailable(false);
    setSelectionFailed(false);
    if (enabled) void reload();
    return () => {
      active.current = false;
      generation.current += 1;
    };
  }, [enabled, reload]);

  const chooseModel = (id: string | null) => {
    const current = context.current;
    if (!id || !current || busy.current || !current.models.some((model) => model.id === id)) return;
    busy.current = true;
    setSelectionPending(true);
    setSelectionFailed(false);
    setConfigurationFailed(false);
    void rememberAIScenarioModelSelection(current, scenario, id, 'explicit')
      .then(() => {
        if (!active.current || context.current?.scenario !== scenario) return;
        const selected = captureChoice(current, id, 'explicit');
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
        setSelectionPending(false);
      });
  };

  const prepareModelSelection = async (
    signal?: AbortSignal
  ): Promise<{ modelId: string; catalog: Context }> => {
    const selected = choice.current;
    if (!selected || !modelId || busy.current) throw new Error('model-unavailable');
    busy.current = true;
    setSelectionPending(true);
    setSelectionFailed(false);
    setConfigurationFailed(false);
    try {
      signal?.throwIfAborted();
      let next: Context;
      try {
        next = await requestAIScenarioModelSelection(scenario);
      } catch {
        signal?.throwIfAborted();
        if (active.current) setConfigurationFailed(true);
        throw new Error('catalog-unavailable');
      }
      signal?.throwIfAborted();
      if (!active.current || context.current?.scenario !== scenario)
        throw new Error('AI interface is closed.');
      if (!hasSameModel(selected, next)) {
        setModelId(null);
        setSelectionUnavailable(true);
        context.current = next;
        setConfiguration(next);
        throw new Error('model-unavailable');
      }
      try {
        await rememberAIScenarioModelSelection(next, scenario, selected.modelId, selected.source);
      } catch {
        signal?.throwIfAborted();
        if (active.current) setSelectionFailed(true);
        throw new Error('selection-write-failed');
      }
      signal?.throwIfAborted();
      return { modelId: selected.modelId, catalog: next };
    } finally {
      busy.current = false;
      setSelectionPending(false);
    }
  };

  return {
    configuration,
    configurationFailed,
    modelId,
    selectionUnavailable,
    unavailableModelName: selectionUnavailable ? (choice.current?.displayName ?? null) : null,
    selectionFailed,
    selectionPending,
    chooseModel,
    prepareModelSelection,
    retryConfiguration: reload,
  };
}
