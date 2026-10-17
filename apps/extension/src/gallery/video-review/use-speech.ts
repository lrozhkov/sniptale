import {
  parseAudioJobFailureCode,
  sameReviewSpeechTarget,
  type ReviewSpeechTarget,
  type AudioJobFailureCode,
} from '../../contracts/ai/audio';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AIModelSelectionBootstrapPayload } from '../../contracts/messaging/ai-settings-runtime';
import { requestAIModelSelectionBootstrap } from '../../workflows/ai-settings/query';
import { transcribeReviewSpeech } from '../../workflows/video-review/speech-transcription';
import {
  applyReviewSpeechBatch,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  type ReviewSpeechPreview,
  type ReviewSpeechSession,
} from '../../workflows/video-review/speech-publication';
import {
  planReviewSpeechQueue,
  runReviewSpeechQueue,
  type ReviewSpeechQueueSelection,
  type ReviewSpeechQueueProgress,
} from '../../workflows/video-review/speech-queue';
import { buildReviewTimeMap, createReviewTimeMap } from '../../features/video/review/timeline';
import {
  reviewVoiceoverNativeIntervals,
  reviewVoiceoverNativeTime,
} from '../../features/video/review/voiceover-edits';
import type { ReviewBeforeAction } from './note-transitions';
import type { ReviewSpeechFlushRegistration } from './speech-edit-guard';
import { useSpeechEdits } from './use-speech-edits';
import { useSpeechPreviews } from './use-speech-previews';
import type { ReviewSpeechTranscript } from '../../features/video/review/speech-transcript';
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
export interface ReviewSpeechAccess {
  session: ReviewSpeechSession;
  target: ReviewSpeechTarget;
  original?: { file: Blob; sourceAssetId: string } | undefined;
  selection?: { start: number; end: number } | undefined;
  sourceAudioAvailable?: boolean | undefined;
  beforeAction: ReviewBeforeAction;
  flushAdvanced(): Promise<void>;
  registerSpeechFlush(owner: ReviewSpeechFlushRegistration): () => void;
}

export function useReviewSpeech(args: ReviewSpeechAccess) {
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
  const timing = reviewSpeechTiming(snapshot, args.target, clip, args.selection);
  const [modelId, setModelId] = useState(clip?.transcript?.transcriptionModelId ?? '');
  const [error, setError] = useState<Failure | null>(null);
  const [running, setRunning] = useState(false);
  const [queueProgress, setQueueProgress] = useState<ReviewSpeechQueueProgress | null>(null);
  const mounted = useRef(true);
  const controller = useRef<AbortController | null>(null);
  const latestArgs = useRef(args);
  latestArgs.current = args;
  const groups = reviewSpeechGroups(snapshot);
  const audio = useSpeechPreviews({
    assetId: clip?.assetId,
    original: args.original?.file,
    target: args.target,
    authorities: groups.map((group) => ({
      ...group,
      geometry: reviewSpeechGeometry(args.session, group.target),
    })),
    onError: () => setError('failed'),
  });
  const { catalogs, reloadModels } = useReviewSpeechCatalog(setModelId, () => setError('failed'));
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
  const { hasPending, ...editing } = editor;
  const command = (action: (signal: AbortSignal) => Promise<void>, flushAdvanced = true) => {
    if (controller.current) return;
    args.beforeAction(() => {
      if (!mounted.current || controller.current || hasPending()) return;
      const active = new AbortController();
      controller.current = active;
      setRunning(true);
      setQueueProgress(null);
      setError(null);
      void (async () => {
        try {
          if (flushAdvanced) await latestArgs.current.flushAdvanced();
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
  const generateQueue = (selected: readonly ReviewSpeechQueueSelection[]) => {
    if (!editor.profile) {
      setError('invalid');
      return;
    }
    let plan: ReturnType<typeof planReviewSpeechQueue>;
    try {
      plan = planReviewSpeechQueue(args.session, selected, editor.profile);
    } catch (cause) {
      setError(failure(cause));
      return;
    }
    command((signal) =>
      runReviewSpeechQueue(args.session, plan, signal, {
        ready: (preview) => {
          if (!mounted.current) throw new DOMException('Unmounted', 'AbortError');
          audio.add(preview);
        },
        progress: (progress) => {
          if (mounted.current) setQueueProgress(progress);
        },
      })
    );
  };
  const generate = (ids: readonly string[]) =>
    generateQueue(ids.map((phraseId) => ({ target: args.target, phraseId })));
  return {
    ...editing,
    target: args.target,
    groups,
    ...timing,
    originalVolume,
    setOriginalVolume,
    selection: args.selection,
    sourceAudioAvailable: args.sourceAudioAvailable,
    modelId,
    catalogs,
    error,
    running,
    queueProgress,
    originalUrl: audio.originalUrl,
    previews: audio.previews.filter((preview) =>
      sameReviewSpeechTarget(preview.scope.target, args.target)
    ),
    allPreviews: audio.previews,
    reloadModels: () => {
      setError(null);
      reloadModels();
    },
    setModelId,
    recognize: (selected = false) =>
      command((signal) => recognizeReviewSpeechSelection(args, modelId, selected, timing, signal)),
    generate,
    generateQueue,
    apply: (items: readonly ReviewSpeechPreview[]) =>
      command(async (signal) => {
        await applySpeechGroups(args.session, items, signal, originalVolume, audio.remove, () =>
          latestArgs.current.flushAdvanced()
        );
      }, false),
    cancel: () => {
      controller.current?.abort();
      setError('canceled');
    },
  };
}

/** All targets share one metadata action; previews leave only after every required publication. */
async function applySpeechGroups(
  session: ReviewSpeechSession,
  items: readonly ReviewSpeechPreview[],
  signal: AbortSignal,
  originalVolume: number,
  remove: (items: readonly ReviewSpeechPreview[]) => void,
  flushAdvanced: () => Promise<void>
) {
  if (!items.length) return;
  const pending = new Map<
    string,
    { target: ReviewSpeechTarget; previews: ReviewSpeechPreview[] }
  >();
  for (const item of items) {
    const key = JSON.stringify(item.scope.target);
    const group = pending.get(key) ?? { target: item.scope.target, previews: [] };
    group.previews.push(item);
    pending.set(key, group);
  }
  await applyReviewSpeechBatch(
    session,
    [...pending.values()].map((group) => ({ ...group, originalVolume })),
    signal,
    { flushAdvanced }
  );
  remove(items);
}

/** Snapshot enumeration is shared by batch presentation and preview admission. */
function reviewSpeechGroups(snapshot: ReturnType<ReviewSpeechSession['getSnapshot']>) {
  const originalTranscript = snapshot.document.advancedContent.audio.originalSpeech?.transcript;
  const groups: {
    target: ReviewSpeechTarget;
    assetId: string;
    transcript: ReviewSpeechTranscript;
  }[] = [
    ...(originalTranscript
      ? [
          {
            target: { kind: 'original' as const },
            assetId: snapshot.snapshot.workspace.sourceAssetId,
            transcript: originalTranscript,
          },
        ]
      : []),
    ...snapshot.document.advancedContent.audio.voiceover.flatMap((entry) =>
      entry.transcript
        ? [
            {
              target: { kind: 'voiceover' as const, clipId: entry.id },
              assetId: entry.assetId,
              transcript: entry.transcript,
            },
          ]
        : []
    ),
  ];
  return groups;
}

/** Model discovery owns its retry lifecycle; remote audio commands keep a separate controller. */
/** Existing configured audio model discovery shared by source speech and authored narration forms. */
export function useReviewSpeechCatalog(
  setModelId: (update: (current: string) => string) => void,
  onError: () => void
) {
  const [catalogs, setCatalogs] = useState<{
    transcription: AIModelSelectionBootstrapPayload;
    speech: AIModelSelectionBootstrapPayload;
  } | null>(null);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const initialized = useRef(false);
  const latestError = useRef(onError);
  latestError.current = onError;
  useEffect(() => {
    let active = true;
    void Promise.all([
      requestAIModelSelectionBootstrap('transcription'),
      requestAIModelSelectionBootstrap('speech'),
    ])
      .then(([transcription, speech]) => {
        if (!active) return;
        setCatalogs({ transcription, speech });
        if (!initialized.current) {
          initialized.current = true;
          setModelId((current) => current || transcription.defaultModelId || '');
        }
      })
      .catch(() => {
        if (active) latestError.current();
      });
    return () => {
      active = false;
    };
  }, [catalogAttempt, setModelId]);
  return { catalogs, reloadModels: () => setCatalogAttempt((value) => value + 1) };
}

/** Pure phrase clocks resolve all rows against one snapshot and one lazy edit map. */
function reviewSpeechTiming(
  snapshot: ReturnType<ReviewSpeechSession['getSnapshot']>,
  target: ReviewSpeechTarget,
  clip: ReturnType<typeof getReviewSpeechTarget> | undefined,
  selection: { start: number; end: number } | undefined
) {
  const timing = originalSpeechTiming(
    target.kind === 'original' ? clip?.nativeEnd : undefined,
    snapshot.document.edits,
    selection
  );
  // All phrase rows in this render resolve against one snapshot and one edit map.
  let resultMap: ReturnType<typeof createReviewTimeMap> | undefined;
  const timeMap = () =>
    (resultMap ??= createReviewTimeMap(
      snapshot.snapshot.workspace.source.duration,
      snapshot.document.edits
    ));
  return {
    ...timing,
    nativeBounds: clip ? { start: clip.nativeStart, end: clip.nativeEnd } : null,
    nativeTimeAtResult: (time: number) => {
      const map = timeMap();
      if (target.kind === 'original') return map.timelineToSource(time);
      const recording = snapshot.document.advancedContent.audio.voiceover.find(
        (entry) => entry.id === target.clipId
      );
      return recording ? reviewVoiceoverNativeTime(recording, time, map.getSegments()) : null;
    },
    resultInterval: (start: number, end: number) => {
      if (target.kind === 'original') return timing.resultInterval(start, end);
      const recording = snapshot.document.advancedContent.audio.voiceover.find(
        (entry) => entry.id === target.clipId
      );
      if (!recording) return null;
      const slices = reviewVoiceoverNativeIntervals(
        recording,
        { start, end },
        timeMap().getSegments()
      );
      const first = slices[0];
      const last = slices.at(-1);
      return first && last ? { start: first.start, end: last.end } : null;
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

/** Validates the selected source interval before the existing transcription workflow. */
async function recognizeReviewSpeechSelection(
  args: ReviewSpeechAccess,
  modelId: string,
  selected: boolean,
  timing: ReturnType<typeof reviewSpeechTiming>,
  signal: AbortSignal
): Promise<void> {
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
}
