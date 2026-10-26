import { useCallback, useEffect, useRef, useState } from 'react';
import { showToast } from '@sniptale/ui/product-feedback/toast-service';
import type { AIModel } from '../../../../contracts/settings';
import type { AIProviderSelectorEntry } from '../../../../contracts/messaging/ai-settings-runtime';
import { requestAIModelSelectionBootstrap } from '../../../../workflows/ai-settings/query';
import { reconcileSelectedAIModelId } from '../../../../features/ai/selection';
import { translate } from '../../../../platform/i18n';
import {
  startQuickEditTextPicker,
  type QuickEditTextReplacementTarget,
} from '../../../selection/quick-edit-runtime';
import { finalizeQuickEditElementChanges } from '../../../selection/quick-edit';
import { setNavigationInputShieldSuspended } from '../../../selection/locker';
import { isTrustedDomEvent } from '../../../platform/trusted-events';
import { requestTextReplacement } from './request';

interface ModelCatalog {
  models: AIModel[];
  providers: AIProviderSelectorEntry[];
  selectedModelId: string | null;
}
const EMPTY_CATALOG: ModelCatalog = { models: [], providers: [], selectedModelId: null };
type RequestError =
  | 'stale'
  | 'failed'
  | 'model-unavailable'
  | 'too-large'
  | 'timeout'
  | 'cancelled';

function useTextReplacementModels(active: boolean) {
  const [catalog, setCatalog] = useState(EMPTY_CATALOG);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!active) return;
    let current = true;
    setCatalog(EMPTY_CATALOG);
    setFailed(false);
    void requestAIModelSelectionBootstrap()
      .then(async (bootstrap) => ({
        models: bootstrap.models,
        providers: bootstrap.providers,
        selectedModelId: await reconcileSelectedAIModelId(
          bootstrap.models,
          bootstrap.defaultModelId
        ),
      }))
      .then((next) => {
        if (current) setCatalog(next);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [active]);
  return {
    ...catalog,
    failed,
    select: (selectedModelId: string | null) =>
      setCatalog((current) => ({ ...current, selectedModelId })),
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
      pending: flight.current !== null,
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
      const text = await requestTextReplacement({
        text: target.text,
        prompt: args.prompt,
        sourceOrigin: readSourceOrigin(target),
        model,
        provider: args.models.providers.find((entry) => entry.id === model.providerId),
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
      if (flight.current === controller && !controller.signal.aborted)
        setError(requestError(failure));
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
