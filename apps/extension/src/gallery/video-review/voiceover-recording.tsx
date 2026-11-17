import { reviewVoiceoverSampleDelta } from '../../features/video/review/voiceover-timing';
import { reviewInsertionTarget } from './range-placement';
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import { translate } from '../../platform/i18n';
import type { useReviewAudio, ReviewAudioLane } from './use-review-audio';
import {
  importReviewAudio,
  importedAudioClip,
  type PreparedReviewAudio,
} from '../../workflows/video-review/audio-import';
import type { createVideoReviewSession } from '../../workflows/video-review/session';
import {
  createReviewTimeMap,
  sourceToReviewResult,
  type ReviewTimeSegment,
} from '../../features/video/review/timeline';
import {
  reviewCommandInsertion,
  type ReviewCommandContext,
  type ReviewCommandPort,
} from './command-context';
import { anchorReviewVoiceoverAtSource } from '../../features/video/review/voiceover-edits';
import { saveReviewVoiceoverTake } from './voiceover-save';

interface ReviewVoiceoverTransport {
  seek(time: number): void;
  play(): void | Promise<void>;
  pause(): void;
}

/** Captured placement remains fixed while decoding, recording, and publication are pending. */
export interface ReviewAudioInsertion {
  context?: ReviewCommandContext;
  sourceStart: number;
  sourceEnd?: number;
  resultStart?: number;
  resultEnd?: number;
  resultDuration: number;
  segments: readonly ReviewTimeSegment[];
  admit(action: () => void): void;
  isCurrent(): boolean;
}

/** Owns one recording lifecycle: open/close, playback sync, and the saved clip. */
export function useReviewVoiceoverRecording(args: {
  video: RefObject<HTMLVideoElement | null>;
  captureInsertion(): ReviewAudioInsertion | null;
  audio: Pick<ReturnType<typeof useReviewAudio>, 'addImported' | 'markImported'>;
  session: ReturnType<typeof createVideoReviewSession>;
  guard(): boolean;
  flushAdvanced(): Promise<void>;
  onOpenChange?(open: boolean): void;
  transport?: ReviewVoiceoverTransport | undefined;
}) {
  const current = useRef(args);
  current.current = args;
  const [recording, setRecording] = useState(false);
  const requestClose = useRef<(() => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const take = useRef<{
    insertion: ReviewAudioInsertion;
    playbackStart: number;
    session: typeof args.session;
    audio: typeof args.audio;
    flushAdvanced: typeof args.flushAdvanced;
    aggregateId: string;
  } | null>(null);
  const takeIds = useRef(new WeakMap<Blob, string>());
  const preparedTakes = useRef(new WeakMap<Blob, PreparedReviewAudio>());
  const playback = useVoiceoverPlayback(
    args.video,
    () =>
      args.transport
        ? (take.current?.playbackStart ?? 0)
        : (take.current?.insertion.sourceStart ?? 0),
    args.transport
  );
  const insertion = take.current?.insertion;
  return {
    video: args.video,
    opener,
    recording,
    requestClose,
    takeStart: insertion?.sourceStart ?? null,
    takeEnd: insertion?.sourceEnd,
    takeDuration:
      insertion?.resultStart !== undefined
        ? (insertion.resultEnd ?? insertion.resultDuration) - insertion.resultStart
        : insertion?.sourceEnd === undefined
          ? undefined
          : reviewVoiceoverSampleDelta(
              insertion.sourceStart,
              insertion.sourceEnd,
              1,
              insertion.segments
            ),
    open: () => {
      const active = current.current;
      if (!active.guard()) return;
      const captured = active.captureInsertion();
      if (
        !captured ||
        (captured.resultStart !== undefined
          ? captured.resultStart >= (captured.resultEnd ?? captured.resultDuration)
          : captured.sourceEnd !== undefined && captured.sourceStart >= captured.sourceEnd)
      )
        return;
      captured.admit(() => {
        if (!active.guard() || !captured.isCurrent()) return;
        opener.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        take.current = {
          insertion: voiceoverInsertion(captured),
          playbackStart: captured.resultStart ?? captured.sourceStart,
          session: active.session,
          audio: active.audio,
          flushAdvanced: active.flushAdvanced,
          aggregateId: active.session.getSnapshot().snapshot.workspace.aggregateId,
        };
        playback.open(true);
        active.onOpenChange?.(true);
        setRecording(true);
      });
    },
    close: () => {
      playback.close();
      take.current = null;
      current.current.onOpenChange?.(false);
      setRecording(false);
    },
    syncStart: playback.syncStart,
    syncStop: playback.syncStop,
    syncPause: playback.syncStop,
    syncResume: playback.syncResume,
    /** The recorder trims the file; placement is always the retained take plus trim offset. */
    save: (
      file: File,
      trim: AudioTrimRange,
      signal: AbortSignal,
      sourceTake: Blob = file,
      onRetained?: () => void
    ) => {
      if (signal.aborted) return Promise.resolve();
      const target = take.current;
      if (!target) return Promise.reject(new Error('Recording review changed'));
      return saveReviewVoiceoverTake({
        file,
        trim,
        signal,
        take: sourceTake,
        ...(onRetained ? { onRetained } : {}),
        ...(target.insertion.context ? { context: target.insertion.context } : {}),
        sourceStart: target.insertion.sourceStart,
        ...(target.insertion.sourceEnd === undefined
          ? {}
          : { sourceEnd: target.insertion.sourceEnd }),
        ...(target.insertion.resultStart === undefined
          ? {}
          : { resultStart: target.insertion.resultStart }),
        ...(target.insertion.resultEnd === undefined
          ? {}
          : { resultEnd: target.insertion.resultEnd }),
        segments: target.insertion.segments,
        audio: target.audio,
        session: target.session,
        takeIds: takeIds.current,
        preparedTakes: preparedTakes.current,
        isCurrent: () =>
          playback.isOpen() &&
          take.current === target &&
          current.current.session === target.session &&
          target.insertion.isCurrent() &&
          target.session.getSnapshot().snapshot.workspace.aggregateId === target.aggregateId,
        flushAdvanced: target.flushAdvanced,
      });
    },
  };
}

/** Keep ordinary voiceover source anchors; result bounds distinguish positions inside a hold. */
function voiceoverInsertion(insertion: ReviewAudioInsertion): ReviewAudioInsertion {
  const sourceStart = sourceToReviewResult(insertion.sourceStart, insertion.segments);
  const sourceEnd =
    insertion.sourceEnd === undefined
      ? null
      : sourceToReviewResult(insertion.sourceEnd, insertion.segments);
  if (
    insertion.resultStart !== undefined &&
    (sourceStart === null ||
      Math.abs(insertion.resultStart - sourceStart) > 1e-7 ||
      (insertion.resultEnd !== undefined &&
        sourceEnd !== null &&
        Math.abs(insertion.resultEnd - sourceEnd) > 1e-7))
  )
    return insertion;
  const { resultStart: _start, resultEnd: _end, ...source } = insertion;
  return source;
}

/** Owns delayed playback completion and cancellation across recording generations. */
export function useVoiceoverPlayback(
  video: RefObject<HTMLVideoElement | null>,
  startTime: () => number,
  transport?: ReviewVoiceoverTransport
) {
  const generation = useRef(0);
  const openRef = useRef(false);
  const shouldPlay = useRef(false);
  const stop = () => {
    shouldPlay.current = false;
    if (transport) transport.pause();
    else video.current?.pause();
  };
  useEffect(
    () => () => {
      generation.current++;
      openRef.current = false;
      shouldPlay.current = false;
    },
    []
  );
  return {
    isOpen: () => openRef.current,
    open: (alreadyPaused = false) => {
      if (!alreadyPaused) stop();
      generation.current += 1;
      openRef.current = true;
      shouldPlay.current = false;
    },
    close: () => {
      generation.current += 1;
      openRef.current = false;
      stop();
    },
    syncStart: async (playVideo = true) => {
      const node = video.current;
      if (!node || !openRef.current) return;
      const currentGeneration = generation.current;
      if (transport) {
        transport.seek(startTime());
        shouldPlay.current = playVideo;
        if (playVideo) {
          await transport.play();
          if (currentGeneration !== generation.current && !shouldPlay.current) transport.pause();
        }
        return;
      }
      node.currentTime = startTime();
      const canPlay = playVideo && !node.ended && !(node.currentTime >= node.duration);
      shouldPlay.current = canPlay;
      if (canPlay) {
        await node.play();
        if (currentGeneration !== generation.current && !shouldPlay.current) node.pause();
      }
    },
    syncStop: stop,
    syncResume: async (playVideo = true) => {
      if (!openRef.current || !playVideo) return;
      const currentGeneration = generation.current;
      if (transport) {
        shouldPlay.current = true;
        await transport.play();
        if (currentGeneration !== generation.current && !shouldPlay.current) transport.pause();
        return;
      }
      const node = video.current;
      if (!node || node.ended || node.currentTime >= node.duration) return;
      shouldPlay.current = true;
      await node.play();
      if (currentGeneration !== generation.current && !shouldPlay.current) node?.pause();
    },
  };
}

/** Wires captured audio insertion to the existing import and recording owners. */
export function useReviewEditorAudio(args: {
  owner: object;
  busy: boolean;
  canStart(): boolean;
  captureInsertion(): ReviewAudioInsertion | null;
  onPlacementFailure(reason: 'cut' | 'changed'): void;
  video: RefObject<HTMLVideoElement | null>;
  run(action: () => Promise<unknown>): Promise<unknown>;
  flushAdvanced(): Promise<void>;
  audio: Pick<ReturnType<typeof useReviewAudio>, 'addImported' | 'markImported'>;
  session: ReturnType<typeof createVideoReviewSession>;
  onOpenChange?(open: boolean): void;
  transport?: ReviewVoiceoverTransport | undefined;
}) {
  const current = useRef(args);
  current.current = args;
  const mounted = useRef(true);
  const imports = useRef(new Set<AbortController>());
  useEffect(() => {
    mounted.current = true;
    const pending = imports.current;
    return () => {
      mounted.current = false;
      for (const controller of pending) controller.abort();
      pending.clear();
    };
  }, [args.owner]);
  const guard = () => !current.current.busy && current.current.canStart();
  const prepareImport = (
    lane: ReviewAudioLane,
    ready: (attach: (file: File) => void) => void,
    timelineTime?: number
  ) => {
    if (!guard()) return;
    const active = current.current;
    const captured = active.captureInsertion();
    if (!captured) {
      active.onPlacementFailure('cut');
      return;
    }
    const isCurrent = () =>
      mounted.current && current.current.owner === active.owner && captured.isCurrent();
    const placement =
      lane === 'voiceover' && timelineTime === undefined ? voiceoverInsertion(captured) : captured;
    const sourcePlacement =
      lane === 'voiceover' && (timelineTime !== undefined || placement.resultStart === undefined);
    if (lane !== 'voiceover' && captured.resultStart === undefined && timelineTime === undefined) {
      active.onPlacementFailure('cut');
      return;
    }
    const at = timelineTime ?? (sourcePlacement ? placement.sourceStart : placement.resultStart);
    const sourceEnd =
      timelineTime === undefined ? placement.sourceEnd : placement.segments.at(-1)?.sourceEnd;
    if (
      at === undefined ||
      at >=
        (sourcePlacement
          ? (sourceEnd ?? Infinity)
          : (placement.resultEnd ?? placement.resultDuration))
    ) {
      active.onPlacementFailure('cut');
      return;
    }
    captured.admit(() => {
      if (!guard() || !isCurrent()) return;
      ready((file) => {
        if (!guard()) return;
        if (!isCurrent()) {
          active.onPlacementFailure('changed');
          return;
        }
        const controller = new AbortController();
        imports.current.add(controller);
        void active.run(async () => {
          try {
            await importReviewAudio({
              file,
              signal: controller.signal,
              assertCurrentTarget: () => {
                if (!isCurrent()) throw new Error(translate('gallery.videoReview.musicChanged'));
              },
              attach: (assetId, duration) => {
                if (!isCurrent()) throw new Error(translate('gallery.videoReview.musicChanged'));
                active.audio.addImported(
                  sourcePlacement
                    ? anchorReviewVoiceoverAtSource(
                        importedAudioClip(
                          assetId,
                          duration,
                          at,
                          at +
                            Math.min(
                              duration,
                              reviewVoiceoverSampleDelta(
                                at,
                                sourceEnd ?? at + duration,
                                1,
                                placement.segments
                              )
                            )
                        ),
                        placement.segments
                      )
                    : {
                        ...importedAudioClip(
                          assetId,
                          duration,
                          at,
                          timelineTime === undefined
                            ? (placement.resultEnd ?? placement.resultDuration)
                            : placement.resultDuration
                        ),
                        timeDomain: 'result',
                      },
                  lane,
                  duration,
                  file.name,
                  ...(captured.context ? ([captured.context] as const) : ([] as const))
                );
                return active.flushAdvanced();
              },
            });
          } finally {
            imports.current.delete(controller);
          }
        });
      });
    });
  };
  const onImportAudioFile = (file: File, lane: ReviewAudioLane = 'music', timelineTime?: number) =>
    prepareImport(lane, (attach) => attach(file), timelineTime);
  const voiceover = useReviewVoiceoverRecording({
    video: args.video,
    captureInsertion: () => current.current.captureInsertion(),
    transport: args.transport,
    audio: args.audio,
    session: args.session,
    ...(args.onOpenChange ? { onOpenChange: args.onOpenChange } : {}),
    guard,
    flushAdvanced: args.flushAdvanced,
  });
  return { onImportAudioFile, onPrepareImportAudioFile: prepareImport, voiceover };
}

export function useReviewAudioWiring(state: {
  commands: ReviewCommandPort;
  busy: boolean;
  canStart(): boolean;
  setMessage(message: string): void;
  video: RefObject<HTMLVideoElement | null>;
  setVoiceoverSilent(silent: boolean): void;
  seekResult(time: number): void;
  transport: Pick<ReviewVoiceoverTransport, 'play'>;
  pause(): void;
  run(action: () => Promise<unknown>): Promise<unknown>;
  flushAdvanced(): Promise<void>;
  audio: Pick<ReturnType<typeof useReviewAudio>, 'addImported' | 'markImported'>;
  session: ReturnType<typeof createVideoReviewSession>;
}) {
  const captureInsertion = (): ReviewAudioInsertion | null => {
    const context = state.commands.capture();
    if (!context) return null;
    return audioInsertionFromCommand(context, state.commands);
  };
  return useReviewEditorAudio({
    owner: state.commands,
    busy: state.busy,
    canStart: state.canStart,
    captureInsertion,
    onPlacementFailure: (reason) =>
      state.setMessage(
        translate(
          reason === 'cut'
            ? 'gallery.videoReview.placementOnCut'
            : 'gallery.videoReview.musicChanged'
        )
      ),
    video: state.video,
    onOpenChange: state.setVoiceoverSilent,
    transport: { seek: state.seekResult, play: state.transport.play, pause: state.pause },
    run: state.run,
    flushAdvanced: state.flushAdvanced,
    audio: state.audio,
    session: state.session,
  });
}

function audioInsertionFromCommand(
  context: ReviewCommandContext,
  commands: ReviewCommandPort
): ReviewAudioInsertion | null {
  const source = reviewCommandInsertion(context, 'source');
  if (!source) return null;
  const result = reviewCommandInsertion(context, 'result');
  const sourceRange = reviewInsertionTarget(source.time, source.range);
  const resultRange = result ? reviewInsertionTarget(result.time, result.range) : null;
  const map = createReviewTimeMap(context.scope.sourceDuration, context.document.edits);
  return {
    context,
    sourceStart: sourceRange?.start ?? source.time,
    sourceEnd: sourceRange?.end ?? source.duration,
    ...(result
      ? {
          resultStart: resultRange?.start ?? result.time,
          resultEnd: resultRange?.end ?? result.duration,
        }
      : {}),
    resultDuration: map.getDuration(),
    segments: map.getSegments(),
    admit: (action) => commands.admit(context, action),
    isCurrent: () => commands.isCurrent(context, 'temporal'),
  };
}
