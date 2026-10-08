import {
  parseAudioJobFailureCode,
  type ReviewSpeechTarget,
  type AudioJobFailureCode,
} from '../../contracts/ai/audio';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AIModelSelectionBootstrapPayload } from '../../contracts/messaging/ai-settings-runtime';
import { requestAIModelSelectionBootstrap } from '../../workflows/ai-settings/query';
import { transcribeReviewSpeech } from '../../workflows/video-review/speech-transcription';
import {
  applyReviewSpeech,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  generateReviewSpeech,
  type ReviewSpeechPreview,
  type ReviewSpeechSession,
} from '../../workflows/video-review/speech-publication';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { useSpeechEdits } from './use-speech-edits';
import { useSpeechPreviews } from './use-speech-previews';
type Failure =
  | AudioJobFailureCode
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
    : (error instanceof Error && parseAudioJobFailureCode(error.message)) || 'failed';
}

/** Coordinates configured model discovery and cancellable remote speech operations. */
export function useReviewSpeech(args: {
  session: ReviewSpeechSession;
  target: ReviewSpeechTarget;
  original?: { file: Blob; sourceAssetId: string } | undefined;
  selection?: { start: number; end: number } | undefined;
  sourceAudioAvailable?: boolean | undefined;
  beforeAction: ReviewBeforeAction;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
}) {
  const snapshot = useSyncExternalStore(
    args.session.subscribe,
    args.session.getSnapshot,
    args.session.getSnapshot
  );
  const clip =
    args.target.kind === 'original' ||
    snapshot.document.advancedContent.audio.voiceover.some(
      (entry) => args.target.kind === 'voiceover' && entry.id === args.target.clipId
    )
      ? getReviewSpeechTarget(args.session, args.target)
      : undefined;
  const [originalVolume, setOriginalVolume] = useState(0);
  const timing = originalSpeechTiming(
    args.target.kind === 'original' ? clip?.nativeEnd : undefined,
    snapshot.document.edits,
    args.selection
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
    original: args.original?.file,
    transcript: clip?.transcript,
    geometry: clip ? reviewSpeechGeometry(args.session, args.target) : null,
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
          args.target,
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
    target: args.target,
    ...timing,
    originalVolume,
    setOriginalVolume,
    selection: args.selection,
    sourceAudioAvailable: args.sourceAudioAvailable,
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
    recognize: (selected = false) =>
      command(async (signal) => {
        if (
          !modelId ||
          args.sourceAudioAvailable === false ||
          (args.target.kind === 'original' &&
            (selected ? timing.selectionDuration : timing.recognitionDuration) <= 0)
        )
          throw new Error('invalid');
        await transcribeReviewSpeech(args.session, args.target, modelId, signal, {
          ...(args.original ? { original: args.original } : {}),
          ...(selected && args.selection ? { selection: args.selection } : {}),
        });
      }),
    generate,
    apply: (items: readonly ReviewSpeechPreview[]) =>
      command(async (signal) => {
        await applyReviewSpeech(args.session, args.target, items, signal, { originalVolume });
        audio.remove(items);
      }),
    cancel: () => {
      controller.current?.abort();
      setError('canceled');
    },
  };
}

/** Retained source seconds are sent to STT; displayed phrase intervals use the edited clock. */
function originalSpeechTiming(
  duration: number | undefined,
  edits: Parameters<typeof buildReviewTimeMap>[1],
  selection: { start: number; end: number } | undefined
) {
  const originalRanges =
    duration !== undefined
      ? buildReviewTimeMap(duration, edits).filter((part) => part.kind !== 'cut')
      : [];
  const recognitionDuration = (selection?: { start: number; end: number }) =>
    originalRanges.reduce(
      (sum, part) =>
        sum +
        Math.max(
          0,
          Math.min(part.sourceEnd, selection?.end ?? part.sourceEnd) -
            Math.max(part.sourceStart, selection?.start ?? part.sourceStart)
        ),
      0
    );
  return {
    resultInterval: (start: number, end: number) => {
      const parts = originalRanges.filter(
        (part) => part.sourceStart < end && part.sourceEnd > start
      );
      const first = parts[0];
      const last = parts.at(-1);
      return first && last
        ? {
            start:
              first.resultStart +
              (Math.max(start, first.sourceStart) - first.sourceStart) / first.rate,
            end: last.resultStart + (Math.min(end, last.sourceEnd) - last.sourceStart) / last.rate,
          }
        : null;
    },
    recognitionDuration: recognitionDuration(),
    selectionDuration: recognitionDuration(selection),
  };
}
