import { TextJobProviderError } from '../../workflows/ai-session/text-request-port';
import type { AIConnectionReason } from '../../contracts/settings/ai-catalog';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { AIModelCatalogPayload } from '../../contracts/messaging/ai-settings-runtime';
import type { ReviewTextProposal } from '../../contracts/ai/review-text';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { useAIScenarioModelSelection } from '../../workflows/ai-settings/use-scenario-model-selection';
import {
  captureReviewTextRewrite,
  generateReviewTextRewrite,
  applyReviewTextRewritePreview,
  reviewTextRewriteWasApplied,
  type ReviewTextRewritePreview,
  type ReviewTextRewriteOptions,
} from '../../workflows/video-review/text-rewrite';
import type { ReviewTextVoiceAccess } from './use-text-voice';

type SelectionPreparation = ReturnType<typeof useAIScenarioModelSelection>['prepareModelSelection'];

export function useReviewTextRewrite(props: {
  access: ReviewTextVoiceAccess;
  ids: readonly string[];
  wholeDocument: boolean;
}) {
  const { access } = props;
  const snapshot = useSyncExternalStore(access.session.subscribe, access.session.getSnapshot);
  const selection = useAIScenarioModelSelection('gallery-text-edit');
  const catalog = selection.configuration;
  const modelId = selection.modelId ?? '';
  const [options, setOptions] = useState<ReviewTextRewriteOptions>({
    prompt: '',
    mode: 'phrases',
    wholeDocument: props.wholeDocument,
    changeIntervals: false,
    resegment: false,
  });
  const [state, setState] = useState({
    running: false,
    applying: false,
    elapsed: 0,
    accepted: false,
    preview: null as ReviewTextRewritePreview | null,
    error: null as string | null,
    providerFailureReason: null as AIConnectionReason | null,
  });
  const lifetime = useRef({
    mounted: true,
    active: null as AbortController | null,
    preview: null as ReviewTextRewritePreview | null,
    accepted: false,
    props,
  });
  lifetime.current.props = props;
  useEffect(() => {
    const owner = lifetime.current;
    owner.mounted = true;
    return () => {
      owner.mounted = false;
      owner.active?.abort();
    };
  }, [access.session]);
  useEffect(
    () =>
      access.context?.registerPending({
        hasPending: () => lifetime.current.active !== null,
        flush: async () => (lifetime.current.active !== null ? false : undefined),
      }),
    [access.context]
  );
  const command = (work: (signal: AbortSignal) => Promise<void>, applying = false) =>
    runTextRewriteAttempt(lifetime.current, work, applying, setState);
  const remember = (preview: ReviewTextRewritePreview | null) => {
    lifetime.current.preview = preview;
    lifetime.current.accepted = false;
    setState((value) => ({
      ...value,
      preview,
      accepted: false,
      error: null,
      providerFailureReason: null,
    }));
  };
  let disclosure: ReviewTextRewritePreview | null = null;
  let disclosureError: string | null = null;
  if (options.prompt.trim()) {
    try {
      disclosure = captureReviewTextRewrite(access.session, props.ids, options);
    } catch (error) {
      disclosureError = error instanceof Error ? error.message : 'failed';
    }
  }
  return {
    ...state,
    snapshot,
    catalog,
    modelId,
    setModelId: (id: string) => {
      if (!lifetime.current.active && !lifetime.current.preview) {
        setState((value) => ({ ...value, error: null, providerFailureReason: null }));
        selection.chooseModel(id);
      }
    },
    selectionPending: selection.selectionPending,
    selectionUnavailable: selection.selectionUnavailable,
    selectionFailed: selection.selectionFailed,
    catalogError: selection.configurationFailed,
    options,
    setOptions,
    disclosure,
    disclosureError,
    reloadModels: selection.retryConfiguration,
    resultDuration:
      buildReviewTimeMap(snapshot.snapshot.workspace.source.duration, snapshot.document.edits).at(
        -1
      )?.resultEnd ?? 0,
    ...createRewriteActions({
      owner: lifetime.current,
      access,
      catalog,
      modelId,
      disclosure,
      command,
      remember,
      prepareSelection: selection.prepareModelSelection,
      markAccepted: () => setState((value) => ({ ...value, accepted: true })),
    }),
  };
}

/** Commands share the mounted attempt receiver and its receipt, cancellation and publication lifetime. */
function createRewriteActions({
  owner,
  access,
  catalog,
  modelId,
  disclosure,
  command,
  remember,
  markAccepted,
  prepareSelection,
}: {
  owner: {
    mounted: boolean;
    active: AbortController | null;
    preview: ReviewTextRewritePreview | null;
    accepted: boolean;
    props: { access: ReviewTextVoiceAccess };
  };
  access: ReviewTextVoiceAccess;
  catalog: AIModelCatalogPayload | null;
  modelId: string;
  disclosure: ReviewTextRewritePreview | null;
  command(work: (signal: AbortSignal) => Promise<void>, applying?: boolean): void;
  remember(preview: ReviewTextRewritePreview | null): void;
  markAccepted(): void;
  prepareSelection: SelectionPreparation;
}) {
  return {
    start() {
      const model = catalog?.models.find((entry) => entry.id === modelId);
      const provider = catalog?.providers.find((entry) => entry.id === model?.providerId);
      if (!model || !provider?.destinationBinding || !disclosure || owner.preview) return;
      const captured = structuredClone(disclosure);
      command(async (signal) => {
        await owner.props.access.beforeRequest();
        signal.throwIfAborted();
        const prepared = await prepareSelection(signal);
        const model = prepared.catalog.models.find((entry) => entry.id === prepared.modelId);
        const provider = prepared.catalog.providers.find((entry) => entry.id === model?.providerId);
        if (!model || !provider?.destinationBinding) throw new Error('model-unavailable');
        const selected = {
          modelId: model.id,
          approvedProviderId: provider.id,
          approvedDestination: provider.destinationBinding,
          approvedModelCode: model.modelCode,
        };
        const preview = await generateReviewTextRewrite(access.session, captured, selected, signal);
        signal.throwIfAborted();
        if (owner.mounted) remember(preview);
      });
    },
    apply(mode: 'replace' | 'variant') {
      const preview = owner.preview;
      if (!preview || owner.accepted) return;
      const run = () =>
        command(async (signal) => {
          if (!(await reviewTextRewriteWasApplied(access.session, preview, signal))) {
            await owner.props.access.beforeRequest();
            signal.throwIfAborted();
            await applyReviewTextRewritePreview(access.session, preview, signal, mode);
          }
          if (owner.mounted) {
            owner.accepted = true;
            markAccepted();
          }
        }, true);
      if (preview.receipt || !access.context) run();
      else access.context.beforeAction(run);
    },
    edit(update: (proposal: ReviewTextProposal) => ReviewTextProposal) {
      const preview = owner.preview;
      if (owner.active || !preview?.proposal || preview.receipt || owner.accepted) return;
      remember({ ...preview, proposal: update(preview.proposal) });
    },
    cancel: () => owner.active?.abort(),
    discard: () => {
      if (!owner.active) remember(null);
    },
  };
}

type RewriteState = {
  running: boolean;
  applying: boolean;
  elapsed: number;
  accepted: boolean;
  preview: ReviewTextRewritePreview | null;
  error: string | null;
  providerFailureReason: AIConnectionReason | null;
};

/** One mounted attempt owns preparation, elapsed time, cancellation and late-result disposal. */
function runTextRewriteAttempt(
  owner: Parameters<typeof createRewriteActions>[0]['owner'],
  work: (signal: AbortSignal) => Promise<void>,
  applying: boolean,
  setState: Dispatch<SetStateAction<RewriteState>>
) {
  if (!owner.mounted || owner.active) return;
  const controller = new AbortController();
  owner.active = controller;
  const started = performance.now();
  setState((value) => ({
    ...value,
    running: true,
    applying,
    elapsed: 0,
    error: null,
    providerFailureReason: null,
  }));
  const timer = setInterval(() => {
    if (owner.mounted)
      setState((value) => ({
        ...value,
        elapsed: Math.floor((performance.now() - started) / 1_000),
      }));
  }, 250);
  let onAbort!: () => void;
  const cancelled = new Promise<void>((_resolve, reject) => {
    onAbort = () => reject(new DOMException('Cancelled', 'AbortError'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  void Promise.race([work(controller.signal), cancelled])
    .catch((error: unknown) => {
      if (owner.mounted && !controller.signal.aborted) {
        if (
          error instanceof Error &&
          ['catalog-unavailable', 'selection-write-failed'].includes(error.message)
        )
          return;
        const code =
          error instanceof Error &&
          ['stale', 'too-large', 'model-unavailable', 'invalid', 'invalid-response'].includes(
            error.message
          )
            ? error.message
            : 'failed';
        setState((value) => ({
          ...value,
          error: code,
          providerFailureReason: error instanceof TextJobProviderError ? error.reason : null,
        }));
      }
    })
    .finally(() => {
      clearInterval(timer);
      controller.signal.removeEventListener('abort', onAbort);
      const current = owner.active === controller;
      if (current) owner.active = null;
      if (current && owner.mounted)
        setState((value) => ({ ...value, running: false, applying: false }));
    });
}
