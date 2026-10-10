import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import {
  applyReviewLocalTextVoice,
  prepareReviewLocalTextVoice,
  type ReviewLocalTextVoicePreview,
  type ReviewLocalTextVoiceSelection,
} from '../../workflows/video-review/text-voice-local';
import { cleanupReviewTextTakePreview } from '../../workflows/video-review/text-take';
import type { ReviewSpeechProfile } from '../../features/video/review/speech-transcript';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import {
  applyReviewTextVoice,
  cleanupReviewTextVoicePreview,
  generateReviewTextVoice,
  prepareReviewTextVoiceBatch,
  type ReviewTextVoicePreview,
} from '../../workflows/video-review/text-voice';

/** Flushes all editor owners before the explicitly disclosed whole-workspace Save. */
export interface ReviewTextVoiceAccess {
  session: ReturnType<typeof createVideoReviewSession>;
  beforeRequest(): Promise<void>;
  context?: {
    video: RefObject<HTMLVideoElement | null>;
    registerPending(owner: ReviewSpeechFlushRegistration): () => void;
    beforeAction(action: () => void): void;
    setSilent(value: boolean): void;
  };
}

type Preview = ReviewTextVoicePreview | ReviewLocalTextVoicePreview;
const cleanupPreview = (session: ReviewTextVoiceAccess['session'], preview: Preview) =>
  'staged' in preview
    ? cleanupReviewTextVoicePreview(session, preview)
    : cleanupReviewTextTakePreview(session, preview);

type Options = { access: ReviewTextVoiceAccess; ids: readonly string[] };
type VoiceState = {
  previews: Preview[];
  accepted: string[];
  running: boolean;
  elapsed: number;
  completed: number;
  total: number;
  error: 'duration' | 'stale' | 'model' | 'failed' | null;
};

/** Owns single-flight cancellation, progress and all disposable previews for one mounted form. */
function useTextVoiceAttempt(props: Options) {
  const [state, setState] = useState<VoiceState>({
    previews: [],
    accepted: [],
    running: false,
    elapsed: 0,
    completed: 0,
    total: 0,
    error: null,
  });
  const lifetime = useRef({
    active: null as AbortController | null,
    mounted: true,
    previews: [] as Preview[],
    props,
  });
  lifetime.current.props = props;
  useEffect(() => {
    const owner = lifetime.current;
    owner.mounted = true;
    return () => {
      owner.mounted = false;
      owner.active?.abort();
      for (const preview of owner.previews)
        void cleanupPreview(props.access.session, preview).catch(() => undefined);
    };
  }, [props.access.session]);
  const report = (cause: unknown) => {
    const error: VoiceState['error'] =
      cause instanceof Error && cause.message === 'duration'
        ? 'duration'
        : cause instanceof Error && cause.message === 'stale'
          ? 'stale'
          : 'failed';
    if (lifetime.current.mounted) setState((current) => ({ ...current, error }));
  };
  const modelError = useCallback(() => {
    if (lifetime.current.mounted) setState((current) => ({ ...current, error: 'model' }));
  }, []);
  const command = (
    work: (signal: AbortSignal) => Promise<void>,
    count: number,
    propagate = false
  ) => {
    const owner = lifetime.current;
    if (owner.active || !owner.mounted) return;
    const controller = new AbortController();
    owner.active = controller;
    const started = performance.now();
    setState((current) => ({
      ...current,
      running: true,
      elapsed: 0,
      completed: 0,
      total: count,
      error: null,
    }));
    const timer = setInterval(() => {
      if (owner.mounted)
        setState((current) => ({
          ...current,
          elapsed: Math.floor((performance.now() - started) / 1000),
        }));
    }, 250);
    return work(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) report(cause);
        if (propagate) throw cause;
      })
      .finally(() => {
        clearInterval(timer);
        if (owner.active === controller) owner.active = null;
        if (owner.mounted) setState((current) => ({ ...current, running: false }));
      });
  };
  const remember = (preview: Preview) => {
    lifetime.current.previews = [
      ...lifetime.current.previews.filter((entry) => entry.clipId !== preview.clipId),
      preview,
    ];
    const ready = lifetime.current.previews;
    if (lifetime.current.mounted) setState((current) => ({ ...current, previews: ready }));
  };
  const accept = (preview: Preview) => {
    if (lifetime.current.mounted)
      setState((current) => ({
        ...current,
        accepted: [...new Set([...current.accepted, preview.clipId])],
      }));
  };
  return {
    state,
    command,
    remember,
    accept,
    report,
    modelError,
    isCurrent: () => lifetime.current.mounted,
    beforeRequest: () => lifetime.current.props.access.beforeRequest(),
    complete: (completed: number) => {
      if (lifetime.current.mounted) setState((current) => ({ ...current, completed }));
    },
    clearError: () => setState((current) => ({ ...current, error: null })),
    cancel: () => lifetime.current.active?.abort(),
    discard: (selected: readonly Preview[]) => {
      const ids = new Set(selected.map((preview) => preview.clipId));
      lifetime.current.previews = lifetime.current.previews.filter(
        (preview) => !ids.has(preview.clipId)
      );
      const ready = lifetime.current.previews;
      if (lifetime.current.mounted) setState((current) => ({ ...current, previews: ready }));
      for (const preview of selected)
        void cleanupPreview(props.access.session, preview).catch(() => undefined);
    },
  };
}

/** Coordinates authored voice commands through the form's single attempt/resource owner. */
export function useReviewTextVoiceOperation(props: Options) {
  const attempt = useTextVoiceAttempt(props);
  const { state, command, remember, accept, report } = attempt;
  const readyIds = new Set(
    state.previews
      .filter((preview) => preview.textSnapshot.kind === 'ai')
      .map((preview) => preview.textSnapshot.textId)
  );
  const remainingIds = props.ids.filter((id) => !readyIds.has(id));
  return {
    ...state,
    remaining: remainingIds.length,
    modelError: attempt.modelError,
    clearError: attempt.clearError,
    cancel: attempt.cancel,
    discard: attempt.discard,
    prepareLocal: (selection: ReviewLocalTextVoiceSelection) =>
      command(
        async (signal) => {
          if (props.ids.length !== 1) throw new Error('invalid-request');
          await attempt.beforeRequest();
          const preview = await prepareReviewLocalTextVoice({
            session: props.access.session,
            fragmentId: props.ids[0]!,
            selection,
            kind: 'gallery',
            signal,
          });
          if (!attempt.isCurrent() || signal.aborted) {
            await cleanupPreview(props.access.session, preview);
            return;
          }
          remember(preview);
        },
        1,
        true
      ),
    acceptRecorded: async (
      preview: ReviewLocalTextVoicePreview,
      captureSignal: AbortSignal,
      onRetained?: () => void
    ) => {
      if (!attempt.isCurrent()) {
        await cleanupPreview(props.access.session, preview);
        throw new Error('stale');
      }
      remember(preview);
      const pending = command(
        async (attemptSignal) => {
          const signal = AbortSignal.any([attemptSignal, captureSignal]);
          signal.throwIfAborted();
          await attempt.beforeRequest();
          await applyReviewLocalTextVoice(props.access.session, preview, signal, onRetained);
          signal.throwIfAborted();
          accept(preview);
        },
        1,
        true
      );
      if (!pending) throw new Error('stale');
      await pending;
    },
    generate: (profile: ReviewSpeechProfile, approvedProviderId: string) => {
      const selected = [...remainingIds];
      const captured = structuredClone(profile);
      void command(async (signal) => {
        await attempt.beforeRequest();
        signal.throwIfAborted();
        const prepared = await prepareReviewTextVoiceBatch(props.access.session, selected, signal);
        for (const [index, basis] of prepared.entries()) {
          try {
            const preview = await generateReviewTextVoice(
              props.access.session,
              basis.fragment.id,
              captured,
              signal,
              approvedProviderId,
              basis
            );
            if (!attempt.isCurrent() || signal.aborted) {
              await cleanupReviewTextVoicePreview(props.access.session, preview);
              return;
            }
            remember(preview);
          } catch (cause) {
            if (signal.aborted) break;
            report(cause);
          }
          attempt.complete(index + 1);
        }
      }, selected.length);
    },
    apply: (selected: readonly Preview[]) =>
      command(async (signal) => {
        await attempt.beforeRequest();
        for (const [index, preview] of selected.entries()) {
          signal.throwIfAborted();
          try {
            if ('staged' in preview)
              await applyReviewTextVoice(props.access.session, preview, signal);
            else await applyReviewLocalTextVoice(props.access.session, preview, signal);
            if (!signal.aborted) accept(preview);
          } catch (cause) {
            if (signal.aborted) break;
            report(cause);
          }
          attempt.complete(index + 1);
        }
      }, selected.length),
  };
}
