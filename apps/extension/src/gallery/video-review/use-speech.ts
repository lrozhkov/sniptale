import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AIModelSelectionBootstrapPayload } from '../../contracts/messaging/ai-settings-runtime';
import { requestAIModelSelectionBootstrap } from '../../workflows/ai-settings/query';
import { transcribeReviewSpeech } from '../../workflows/video-review/speech-transcription';
import {
  applyReviewSpeech,
  reviewSpeechGeometry,
  generateReviewSpeech,
  type ReviewSpeechPreview,
  type ReviewSpeechSession,
} from '../../workflows/video-review/speech-publication';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { useSpeechEdits } from './use-speech-edits';
import { useSpeechPreviews } from './use-speech-previews';
type Failure =
  | 'interrupted'
  | 'canceled'
  | 'failed'
  | 'stale'
  | 'duration'
  | 'partial-replacement'
  | 'invalid';
function failure(error: unknown): Failure {
  if (error instanceof Error && (error.message === 'interrupted' || error.message === 'timeout'))
    return 'interrupted';
  if (error instanceof Error && (error.name === 'AbortError' || error.message === 'cancelled'))
    return 'canceled';
  return error instanceof Error &&
    (error.message === 'stale' ||
      error.message === 'duration' ||
      error.message === 'partial-replacement' ||
      error.message === 'invalid')
    ? error.message
    : 'failed';
}

/** Coordinates configured model discovery and cancellable remote speech operations. */
export function useReviewSpeech(args: {
  session: ReviewSpeechSession;
  clipId: string;
  beforeAction: ReviewBeforeAction;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
}) {
  const snapshot = useSyncExternalStore(
    args.session.subscribe,
    args.session.getSnapshot,
    args.session.getSnapshot
  );
  const clip = snapshot.document.advancedContent.audio.voiceover.find(
    (entry) => entry.id === args.clipId
  );
  const [catalogs, setCatalogs] = useState<{
    transcription: AIModelSelectionBootstrapPayload;
    speech: AIModelSelectionBootstrapPayload;
  } | null>(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [modelId, setModelId] = useState(clip?.transcript?.transcriptionModelId ?? '');
  const [error, setError] = useState<Failure | null>(null);
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const latestArgs = useRef(args);
  latestArgs.current = args;
  const audio = useSpeechPreviews({
    assetId: clip?.assetId,
    transcript: clip?.transcript,
    geometry: clip ? reviewSpeechGeometry(args.session, args.clipId) : null,
    onError: () => setError('failed'),
  });
  const editor = useSpeechEdits({
    ...args,
    durable: clip?.transcript,
    catalog: catalogs?.speech,
    invalidate: (ids) => {
      controller.current?.abort();
      audio.invalidate(ids);
    },
    onError: (cause) => setError(cause === null ? null : failure(cause)),
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setCatalogs(null);
    void Promise.all([
      requestAIModelSelectionBootstrap('transcription'),
      requestAIModelSelectionBootstrap('speech'),
    ])
      .then(([transcription, speech]) => {
        if (!active) return;
        setCatalogs({ transcription, speech });
        setModelId((current) => current || transcription.defaultModelId || '');
      })
      .catch(() => {
        if (active) setError('failed');
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt]);
  const { hasPending, ...editing } = editor;
  const command = (action: (signal: AbortSignal) => Promise<void>) => {
    if (controller.current) return;
    args.beforeAction(() => {
      if (!mounted.current || controller.current || hasPending()) return;
      const active = new AbortController();
      controller.current = active;
      setRunning(true);
      setError(null);
      void (async () => {
        try {
          await latestArgs.current.flushAdvanced();
          active.signal.throwIfAborted();
          await action(active.signal);
        } catch (cause) {
          if (mounted.current && !active.signal.aborted) setError(failure(cause));
        } finally {
          if (controller.current === active) controller.current = null;
          if (mounted.current) setRunning(false);
        }
      })();
    });
  };
  const generate = (ids: readonly string[]) =>
    command(async (signal) => {
      if (!editor.profile) throw new Error('invalid');
      for (const id of ids) {
        signal.throwIfAborted();
        const preview = await generateReviewSpeech(
          args.session,
          args.clipId,
          id,
          editor.profile,
          signal
        );
        if (signal.aborted || !mounted.current) {
          audio.discard(preview);
          return;
        }
        audio.add(preview);
      }
    });
  return {
    ...editing,
    modelId,
    catalogs,
    error,
    running,
    originalUrl: audio.originalUrl,
    previews: audio.previews,
    reloadModels: () => {
      setError(null);
      setCatalogAttempt((value) => value + 1);
    },
    setModelId,
    recognize: () =>
      command(async (signal) => {
        if (!modelId) throw new Error('invalid');
        await transcribeReviewSpeech(args.session, args.clipId, modelId, signal);
      }),
    generate,
    apply: (items: readonly ReviewSpeechPreview[]) =>
      command(async (signal) => {
        await applyReviewSpeech(args.session, args.clipId, items, signal);
        audio.remove(items);
      }),
    cancel: () => {
      controller.current?.abort();
      setError('canceled');
    },
  };
}
