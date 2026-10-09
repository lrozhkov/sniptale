import { useCallback, useEffect, useRef, useState } from 'react';
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
}

type Options = { access: ReviewTextVoiceAccess; ids: readonly string[] };
type VoiceState = {
  previews: ReviewTextVoicePreview[];
  accepted: string[];
  running: boolean;
  elapsed: number;
  completed: number;
  total: number;
  error: 'duration' | 'stale' | 'model' | 'failed' | null;
};

/** One form owns attempt progress, partial results and their disposable resource lifetime. */
export function useReviewTextVoiceOperation(props: Options) {
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
    previews: [] as ReviewTextVoicePreview[],
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
        void cleanupReviewTextVoicePreview(props.access.session, preview).catch(() => undefined);
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
  const command = (work: (signal: AbortSignal) => Promise<void>, count: number) => {
    const owner = lifetime.current;
    if (owner.active) return;
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
    void work(controller.signal)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) report(cause);
      })
      .finally(() => {
        clearInterval(timer);
        if (owner.active === controller) owner.active = null;
        if (owner.mounted) setState((current) => ({ ...current, running: false }));
      });
  };
  const readyIds = new Set(state.previews.map((preview) => preview.scope.target.fragmentId));
  const remainingIds = props.ids.filter((id) => !readyIds.has(id));
  return {
    ...state,
    remaining: remainingIds.length,
    modelError,
    clearError: () => setState((current) => ({ ...current, error: null })),
    cancel: () => lifetime.current.active?.abort(),
    generate: (profile: ReviewSpeechProfile, approvedProviderId: string) => {
      const selected = [...remainingIds];
      const captured = structuredClone(profile);
      command(async (signal) => {
        await lifetime.current.props.access.beforeRequest();
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
            if (!lifetime.current.mounted || signal.aborted) {
              await cleanupReviewTextVoicePreview(props.access.session, preview);
              return;
            }
            lifetime.current.previews = [...lifetime.current.previews, preview];
            const ready = lifetime.current.previews;
            setState((current) => ({ ...current, previews: ready }));
          } catch (cause) {
            if (signal.aborted) break;
            report(cause);
          }
          if (lifetime.current.mounted)
            setState((current) => ({ ...current, completed: index + 1 }));
        }
      }, selected.length);
    },
    apply: (selected: readonly ReviewTextVoicePreview[]) =>
      command(async (signal) => {
        await lifetime.current.props.access.beforeRequest();
        for (const [index, preview] of selected.entries()) {
          signal.throwIfAborted();
          try {
            await applyReviewTextVoice(props.access.session, preview, signal);
            if (lifetime.current.mounted && !signal.aborted)
              setState((current) => ({
                ...current,
                accepted: [...new Set([...current.accepted, preview.clipId])],
              }));
          } catch (cause) {
            if (signal.aborted) break;
            report(cause);
          }
          if (lifetime.current.mounted)
            setState((current) => ({ ...current, completed: index + 1 }));
        }
      }, selected.length),
  };
}
