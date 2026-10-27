import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import { useAIScenarioModelSelection } from '../../../../workflows/ai-settings/use-scenario-model-selection';
import { translate } from '../../../../platform/i18n';
import {
  startQuickEditTextPicker,
  type QuickEditTextReplacementTarget,
} from '../../../selection/quick-edit-runtime';
import { finalizeQuickEditElementChanges } from '../../../selection/quick-edit';
import { setNavigationInputShieldSuspended } from '../../../selection/locker';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { requestTextReplacement } from './request';

type RequestError =
  | 'stale'
  | 'failed'
  | 'model-unavailable'
  | 'too-large'
  | 'timeout'
  | 'cancelled';

function useTextReplacementModels(active: boolean) {
  const selection = useAIScenarioModelSelection('page-edit', active);
  return {
    models: selection.configuration?.models ?? [],
    providers: selection.configuration?.providers ?? [],
    selectedModelId: selection.modelId,
    failed: selection.configurationFailed,
    pending: selection.selectionPending,
    unavailable: selection.selectionUnavailable,
    selectionFailed: selection.selectionFailed,
    select: selection.chooseModel,
    reload: selection.retryConfiguration,
    prepare: selection.prepareModelSelection,
  };
}

function requestError(error: unknown): RequestError {
  const message = error instanceof Error ? error.message : '';
  if (
    message === 'stale' ||
    message === 'model-unavailable' ||
    message === 'too-large' ||
    message === 'timeout'
  )
    return message;
  return 'failed';
}

function getSubmissionTarget(args: {
  event: Event;
  active: boolean;
  target: QuickEditTextReplacementTarget | null;
  pending: boolean;
  prompt: string;
}): QuickEditTextReplacementTarget | null {
  if (!isTrustedDomEvent(args.event) || !args.active || args.pending || !args.prompt.trim())
    return null;
  return args.target;
}

function readSourceOrigin(target: QuickEditTextReplacementTarget): string | null {
  try {
    return target.element.ownerDocument.location.origin;
  } catch {
    return null;
  }
}

function useTextReplacementRequest(args: {
  active: boolean;
  target: QuickEditTextReplacementTarget | null;
  prompt: string;
  models: ReturnType<typeof useTextReplacementModels>;
  onApplied(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<RequestError | null>(null);
  const flight = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const scope = useRef({ active: args.active, target: args.target });
  scope.current = { active: args.active, target: args.target };
  const cancel = useCallback((showStatus = true) => {
    const current = flight.current;
    flight.current = null;
    current?.abort();
    setBusy(false);
    if (current && showStatus) setError('cancelled');
  }, []);
  useEffect(() => {
    setError(null);
    if (!args.active || !args.target) cancel(false);
    return () => {
      const current = flight.current;
      flight.current = null;
      current?.abort();
    };
  }, [args.active, args.target, cancel]);
  useEffect(() => {
    if (!busy) return;
    const update = () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function submit(event: Event): Promise<void> {
    const target = getSubmissionTarget({
      event,
      active: args.active,
      target: args.target,
      pending: flight.current !== null || args.models.pending,
      prompt: args.prompt,
    });
    if (!target) return;
    const model = args.models.models.find((entry) => entry.id === args.models.selectedModelId);
    if (!model) {
      setError('model-unavailable');
      return;
    }
    if (!target.isCurrent()) {
      setError('stale');
      return;
    }
    const controller = new AbortController();
    flight.current = controller;
    startedAt.current = Date.now();
    setElapsed(0);
    setError(null);
    setBusy(true);
    let applied = false;
    try {
      const prepared = await args.models.prepare(controller.signal);
      controller.signal.throwIfAborted();
      if (!target.isCurrent()) throw new Error('stale');
      const selectedModel = prepared.catalog.models.find((entry) => entry.id === prepared.modelId);
      if (!selectedModel) throw new Error('model-unavailable');
      const text = await requestTextReplacement({
        text: target.text,
        prompt: args.prompt,
        sourceOrigin: readSourceOrigin(target),
        model: selectedModel,
        provider: prepared.catalog.providers.find((entry) => entry.id === selectedModel.providerId),
        signal: controller.signal,
      });
      if (
        flight.current !== controller ||
        controller.signal.aborted ||
        !scope.current.active ||
        scope.current.target !== target
      )
        return;
      if (!target.apply(text)) throw new Error('stale');
      applied = true;
    } catch (failure) {
      if (flight.current === controller && !controller.signal.aborted) {
        const code = failure instanceof Error ? failure.message : '';
        if (code !== 'catalog-unavailable' && code !== 'selection-write-failed')
          setError(requestError(failure));
      }
    } finally {
      if (flight.current === controller) {
        flight.current = null;
        setBusy(false);
      }
    }
    if (applied) args.onApplied();
  }
  return { busy, elapsed, error, cancel, submit };
}

/** Owns one page selection, prompt draft and request lifetime for the toolbar text tool. */
export function useTextRewriteSession(args: {
  active: boolean;
  onClose(): void;
  onApplied(): void;
}) {
  const [target, setTarget] = useState<QuickEditTextReplacementTarget | null>(null);
  const [prompt, setPrompt] = useState('');
  const callbacks = useRef(args);
  callbacks.current = args;
  const closeRef = useRef<(() => void) | null>(null);
  const picker = useRef<ReturnType<typeof startQuickEditTextPicker> | null>(null);
  const models = useTextReplacementModels(args.active);
  const applied = useCallback(() => {
    setTarget(null);
    setPrompt('');
    callbacks.current.onApplied();
  }, []);
  const request = useTextReplacementRequest({
    active: args.active,
    target,
    prompt,
    models,
    onApplied: applied,
  });
  const cancelRequest = request.cancel;
  const close = useCallback(() => {
    cancelRequest(false);
    setTarget(null);
    setPrompt('');
    callbacks.current.onClose();
  }, [cancelRequest]);
  closeRef.current = close;
  useEffect(() => {
    if (!args.active) {
      setTarget(null);
      setPrompt('');
      return;
    }
    try {
      finalizeQuickEditElementChanges();
    } catch {
      showToast(translate('common.errors.saveFailed'), 'error');
      closeRef.current?.();
      return;
    }
    setNavigationInputShieldSuspended(true);
    const runtime = startQuickEditTextPicker({
      onSelect: (next) => {
        cancelRequest(false);
        setTarget(next);
      },
      onFinish: () => closeRef.current?.(),
    });
    picker.current = runtime;
    return () => {
      runtime.dispose();
      picker.current = null;
      setNavigationInputShieldSuspended(false);
    };
  }, [args.active, cancelRequest]);
  useEffect(() => {
    picker.current?.setSelectedTarget(target?.element ?? null);
  }, [target]);
  return { target, prompt, setPrompt, models, request, close };
}
