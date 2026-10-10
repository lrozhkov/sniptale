import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReviewSpeechTarget } from '../../contracts/ai/audio';
import type { ReviewTextDocument } from '../../features/video/review/text-document';
import {
  applyReviewRecognition,
  prepareReviewRecognition,
  runReviewRecognition,
  reviewRecognitionWasApplied,
  type ReviewRecognitionGrouping,
  type ReviewRecognitionJob,
  type ReviewRecognitionProposal,
} from '../../workflows/video-review/recognition';
import type { ReviewSpeechSession } from '../../workflows/video-review/speech-publication';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { useReviewSpeechCatalog } from './use-speech';

export interface ReviewRecognitionAccess {
  session: ReviewSpeechSession;
  target: ReviewSpeechTarget;
  original?: { file: Blob; sourceAssetId: string } | undefined;
  selection?: { start: number; end: number } | undefined;
  sourceAudioAvailable?: boolean | undefined;
  beforeAction: ReviewBeforeAction;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
}
type RecognitionState = {
  proposal: ReviewRecognitionProposal | null;
  running: boolean;
  applying: boolean;
  accepted: boolean;
  elapsed: number;
  completed: number;
  total: number;
  error: 'model' | 'selection' | 'stale' | 'failed' | null;
};

function validSelectedScope(access: ReviewRecognitionAccess): boolean {
  const selection = access.selection;
  return (
    access.target.kind === 'original' &&
    !!selection &&
    Number.isFinite(selection.start) &&
    Number.isFinite(selection.end) &&
    selection.start >= 0 &&
    selection.end > selection.start &&
    selection.end <= access.session.getSnapshot().snapshot.workspace.source.duration
  );
}

/** Owns cancellation, elapsed time and the sole disposable job/proposal lifetime. */
function useRecognitionAttempt(args: ReviewRecognitionAccess) {
  const { session, registerSpeechFlush } = args;
  const [state, setState] = useState<RecognitionState>({
    proposal: null,
    running: false,
    applying: false,
    accepted: false,
    elapsed: 0,
    completed: 0,
    total: 0,
    error: null,
  });
  const lifetime = useRef({
    mounted: true,
    active: null as AbortController | null,
    job: undefined as ReviewRecognitionJob | undefined,
    proposal: null as ReviewRecognitionProposal | null,
    args,
  });
  lifetime.current.args = args;
  useEffect(() => {
    const owner = lifetime.current;
    owner.mounted = true;
    return () => {
      owner.mounted = false;
      owner.active?.abort();
    };
  }, [session]);
  useEffect(
    () =>
      registerSpeechFlush({
        hasPending: () => lifetime.current.active !== null,
        flush: async () => {
          if (lifetime.current.active !== null) return false;
        },
      }),
    [registerSpeechFlush]
  );
  const command = (work: (signal: AbortSignal) => Promise<void>, applying = false) => {
    const owner = lifetime.current;
    if (!owner.mounted || owner.active) return;
    const controller = new AbortController();
    owner.active = controller;
    const started = performance.now();
    setState((current) => ({ ...current, running: true, applying, elapsed: 0, error: null }));
    const timer = setInterval(() => {
      if (owner.mounted)
        setState((current) => ({
          ...current,
          elapsed: Math.floor((performance.now() - started) / 1000),
        }));
    }, 250);
    void work(controller.signal)
      .catch((cause: unknown) => {
        if (owner.mounted && !controller.signal.aborted)
          setState((current) => ({
            ...current,
            error:
              cause instanceof Error && (cause.message === 'stale' || cause.message === 'selection')
                ? cause.message
                : 'failed',
          }));
      })
      .finally(() => {
        clearInterval(timer);
        if (owner.active === controller) owner.active = null;
        if (owner.mounted) setState((current) => ({ ...current, running: false, applying: false }));
      });
  };
  const acknowledge = () => {
    if (lifetime.current.mounted) setState((current) => ({ ...current, accepted: true }));
  };
  return {
    state,
    setState,
    lifetime,
    command,
    acknowledge,
    cancel: () => {
      if (!state.applying) lifetime.current.active?.abort();
    },
    discard: () => {
      if (lifetime.current.active || lifetime.current.proposal?.receipt) return;
      lifetime.current.proposal = null;
      lifetime.current.job = undefined;
      setState((current) => ({ ...current, proposal: null, accepted: false, error: null }));
    },
    clearError: () => setState((current) => ({ ...current, error: null })),
  };
}

/** Owns one disposable recognition proposal, explicit retry and acceptance in the mounted inspector. */
export function useReviewRecognition(args: ReviewRecognitionAccess) {
  const snapshot = useSyncExternalStore(
    args.session.subscribe,
    args.session.getSnapshot,
    args.session.getSnapshot
  );
  const [modelId, setModelId] = useState('');
  const [grouping, setGrouping] = useState<ReviewRecognitionGrouping>('sentences-pauses');
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const attempt = useRecognitionAttempt(args);
  const { state, setState, lifetime, command, acknowledge } = attempt;
  const modelError = useCallback(
    () => setState((current) => ({ ...current, error: 'model' })),
    [setState]
  );
  const { catalogs, reloadModels } = useReviewSpeechCatalog(setModelId, modelError);
  const selectionUnavailable = selectionOnly && !validSelectedScope(args);
  const recognize = (approvedProviderId: string) => {
    if (selectionUnavailable) {
      setState((current) => ({ ...current, error: 'selection' }));
      return;
    }
    const model = catalogs?.transcription.models.find((entry) => entry.id === modelId);
    if (!model || model.providerId !== approvedProviderId || args.sourceAudioAvailable === false) {
      modelError();
      return;
    }
    const source = args.original;
    const selected = selectionOnly ? args.selection : undefined;
    const selectedOnly = selectionOnly;
    const chosenGrouping = grouping;
    const chosenModel = model.id;
    const target = structuredClone(args.target);
    args.beforeAction(() =>
      command(async (signal) => {
        const owner = lifetime.current;
        if (
          selectedOnly &&
          (!validSelectedScope(owner.args) ||
            owner.args.selection?.start !== selected?.start ||
            owner.args.selection?.end !== selected?.end)
        )
          throw new Error('selection');
        if (
          owner.proposal?.receipt &&
          !state.accepted &&
          (await reviewRecognitionWasApplied(owner.args.session, owner.proposal, signal))
        ) {
          acknowledge();
          return;
        }
        await owner.args.flushAdvanced();
        signal.throwIfAborted();
        const job = await prepareReviewRecognition(
          owner.args.session,
          target,
          chosenModel,
          approvedProviderId,
          signal,
          {
            ...(source ? { original: source } : {}),
            ...(selected ? { selection: selected } : {}),
            grouping: chosenGrouping,
            ...(owner.job && !owner.proposal ? { previous: owner.job } : {}),
          }
        );
        owner.job = job;
        owner.proposal = null;
        setState((current) => ({
          ...current,
          proposal: null,
          accepted: false,
          completed: 0,
          total: job.chunks.length,
        }));
        const proposal = await runReviewRecognition(
          owner.args.session,
          job,
          signal,
          (completed, total) => {
            if (owner.mounted) setState((current) => ({ ...current, completed, total }));
          }
        );
        signal.throwIfAborted();
        if (!owner.mounted) return;
        owner.proposal = proposal;
        setMode('add');
        setState((current) => ({ ...current, proposal }));
      })
    );
  };
  const apply = () => {
    const owner = lifetime.current;
    const proposal = owner.proposal;
    if (!proposal || state.accepted || !proposal.document.fragments.length) return;
    const accept = () =>
      command(async (signal) => {
        // Read acceptance before touching buffers; an absent receipt must join pending owners too.
        if (
          proposal.receipt &&
          (await reviewRecognitionWasApplied(owner.args.session, proposal, signal))
        ) {
          acknowledge();
          return;
        }
        await owner.args.flushAdvanced();
        signal.throwIfAborted();
        await applyReviewRecognition(owner.args.session, proposal, signal, mode);
        acknowledge();
      }, true);
    if (proposal.receipt) accept();
    else args.beforeAction(accept);
  };
  const setText = (
    update: (current: ReviewTextDocument | undefined) => ReviewTextDocument | undefined
  ) => {
    const owner = lifetime.current;
    if (!owner.proposal || owner.active || owner.proposal.receipt) return;
    const document = update(owner.proposal.document);
    if (!document) return;
    const proposal = { ...owner.proposal, document };
    owner.proposal = proposal;
    setState((current) => ({ ...current, proposal }));
  };
  return {
    ...state,
    snapshot,
    modelId,
    setModelId,
    grouping,
    setGrouping,
    selectionOnly,
    selectionUnavailable,
    setSelectionOnly,
    mode,
    setMode,
    catalogs,
    reloadModels,
    recognize,
    apply,
    setText,
    cancel: attempt.cancel,
    discard: attempt.discard,
    clearError: attempt.clearError,
  };
}
