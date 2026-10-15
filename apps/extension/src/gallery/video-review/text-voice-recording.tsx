import { useEffect, useRef, useState } from 'react';
import { useAudioRecordingDialogSession } from '../../composition/audio-recording/dialog/controller';
import { RecordingDiscardConfirmation } from '../../composition/audio-recording/dialog/dismissal';
import { RecordingLevelMeter } from '../../composition/audio-recording/dialog/level-meter';
import { useRecordingDurationLimit } from '../../composition/audio-recording/dialog/duration-limit';
import type { AudioTrimRange } from '../../composition/audio-recording/session-types';
import {
  captureReviewTextTakeBasis,
  assertReviewTextTakeBasis,
} from '../../workflows/video-review/text-take';
import {
  prepareReviewLocalTextVoice,
  type ReviewLocalTextVoicePreview,
} from '../../workflows/video-review/text-voice-local';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { translate } from '../../platform/i18n';
import { useVoiceoverPlayback } from './voiceover-recording';
import {
  VoiceoverCaptureOptions,
  VoiceoverTakeReview,
  VoiceoverTransport,
} from './voiceover-panel';
import type { ReviewTextVoiceAccess, useReviewTextVoiceOperation } from './use-text-voice';

type Operation = ReturnType<typeof useReviewTextVoiceOperation>;
type Basis = ReturnType<typeof captureReviewTextTakeBasis>;
type Cache = WeakMap<Blob, Map<string, ReviewLocalTextVoicePreview>>;
type Props = {
  access: ReviewTextVoiceAccess;
  fragmentId: string;
  operation: Operation;
  disabled?: boolean | undefined;
};

/** The shared recorder's explicit Save prepares and accepts a take; preparation never counts as retention. */
async function saveRecordedTextTake(args: {
  props: Props;
  basis: Basis | null;
  cache: Cache;
  file: File;
  trim: AudioTrimRange;
  signal: AbortSignal;
  take: Blob;
  onRetained?: (() => void) | undefined;
}) {
  if (!args.basis) throw new Error('stale');
  const key = `${args.trim.trimStart}:${args.trim.trimEnd}`;
  const variants = args.cache.get(args.take) ?? new Map<string, ReviewLocalTextVoicePreview>();
  args.cache.set(args.take, variants);
  let preview = variants.get(key);
  if (!preview) {
    preview = await prepareReviewLocalTextVoice({
      session: args.props.access.session,
      fragmentId: args.props.fragmentId,
      selection: { kind: 'file', file: args.file },
      kind: 'microphone',
      signal: args.signal,
      trimOffset: args.trim.trimStart,
      basis: args.basis,
    });
    variants.set(key, preview);
  }
  await args.props.operation.acceptRecorded(preview, args.signal, args.onRetained);
}

/** Owns captured text/placement, prepared receipts and playback independently of inspector admission. */
function useTextRecordingTake(
  props: Props,
  context: NonNullable<ReviewTextVoiceAccess['context']>
) {
  const owner = useRef({
    props,
    context,
    pending: null as Basis | null,
    basis: null as Basis | null,
    ownsSilence: false,
    cache: new WeakMap<Blob, Map<string, ReviewLocalTextVoicePreview>>(),
    retained: new WeakSet<Blob>(),
  });
  Object.assign(owner.current, { props, context });
  let maximum = 0;
  try {
    const basis = captureReviewTextTakeBasis(props.access.session, props.fragmentId);
    maximum = Math.max(0, basis.resultDuration - basis.resultStart);
  } catch {
    /* Invalid placement is refused by Start without acquiring a microphone. */
  }
  const playback = useVoiceoverPlayback(context.video, () => {
    const current = owner.current;
    const state = current.props.access.session.getSnapshot();
    return (
      createReviewTimeMap(
        state.snapshot.workspace.source.duration,
        state.document.edits
      ).timelineToSource((current.pending ?? current.basis)?.resultStart ?? 0) ?? 0
    );
  });
  const stop = () => {
    playback.syncStop();
    if (owner.current.ownsSilence) {
      owner.current.ownsSilence = false;
      owner.current.context.setSilent(false);
    }
  };
  const discard = (raw: Blob | null) => {
    const current = owner.current;
    if (raw && !current.retained.has(raw)) {
      const variants = current.cache.get(raw);
      if (variants) current.props.operation.discard([...variants.values()]);
      current.cache.delete(raw);
    }
  };
  return {
    maximum,
    stop,
    discard,
    prepare: () => {
      const current = owner.current;
      current.pending = captureReviewTextTakeBasis(
        current.props.access.session,
        current.props.fragmentId
      );
      playback.open();
    },
    cancelStart: () => {
      owner.current.pending = null;
    },
    beforeStart: async (playVideo: boolean) => {
      const current = owner.current;
      const basis = current.pending;
      if (!basis) throw new Error('stale');
      const fragment = basis.fragment;
      assertReviewTextTakeBasis(current.props.access.session, {
        geometry: basis.geometry,
        expiresAt: Infinity,
        textSnapshot: {
          kind: 'microphone',
          textId: fragment.id,
          revision: fragment.revision,
          timingRevision: fragment.timingRevision,
          text: fragment.text,
          start: fragment.start,
          end: fragment.end,
          timeDomain: fragment.timeDomain,
        },
      });
      current.basis = basis;
      current.pending = null;
      current.ownsSilence = true;
      current.context.setSilent(true);
      await playback.syncStart(playVideo);
    },
    resume: async (playVideo: boolean) => {
      owner.current.ownsSilence = true;
      owner.current.context.setSilent(true);
      await playback.syncResume(playVideo);
    },
    close: (raw: Blob | null) => {
      discard(raw);
      stop();
      playback.close();
      owner.current.pending = null;
    },
    save: (
      file: File,
      trim: AudioTrimRange,
      signal: AbortSignal,
      raw: Blob,
      onRetained?: () => void
    ) =>
      saveRecordedTextTake({
        props: owner.current.props,
        basis: owner.current.basis,
        cache: owner.current.cache,
        file,
        trim,
        signal,
        take: raw,
        onRetained: () => {
          owner.current.retained.add(raw);
          onRetained?.();
        },
      }),
  };
}

/** Owns exclusive inspector admission, discard continuation and one-shot capture rearm. */
function useTextVoiceRecording(
  props: Props,
  context: NonNullable<ReviewTextVoiceAccess['context']>
) {
  const [view, setView] = useState({ open: true, playVideo: true, preparing: false, error: false });
  const take = useTextRecordingTake(props, context);
  const durationLimit = useRecordingDurationLimit(take.maximum);
  const lifetime = useRef({
    mounted: true,
    props,
    view,
    take,
    generation: 0,
    session: null as ReturnType<typeof useAudioRecordingDialogSession> | null,
    continuation: null as ((admitted: false | undefined) => void) | null,
    restart: false,
    rearm: false,
  });
  Object.assign(lifetime.current, { props, view, take });
  const close = () => {
    const owner = lifetime.current;
    owner.generation += 1;
    owner.view = { ...owner.view, open: false, preparing: false };
    owner.take.close(owner.session?.controller.save.audioBlob ?? null);
    const resolve = owner.continuation;
    owner.continuation = null;
    owner.rearm = false;
    setView((current) => ({ ...current, open: false, preparing: false }));
    resolve?.(undefined);
  };
  const session = useAudioRecordingDialogSession({
    isOpen: view.open,
    captureLimitSeconds: durationLimit.seconds,
    timeline: {
      startTime: 0,
      duration: take.maximum,
      beforeStart: () => take.beforeStart(view.playVideo),
      onStop: take.stop,
      onPause: take.stop,
      onResume: () => take.resume(view.playVideo),
    },
    onClose: close,
    onSave: take.save,
  });
  lifetime.current.session = session;
  useEffect(() => {
    const owner = lifetime.current;
    owner.mounted = true;
    return () => {
      owner.mounted = false;
      owner.generation += 1;
      owner.take.close(owner.session?.controller.save.audioBlob ?? null);
      owner.continuation?.(false);
      owner.continuation = null;
    };
  }, []);
  const registerPending = context.registerPending;
  useEffect(
    () =>
      registerPending({
        hasPending: () => {
          const owner = lifetime.current;
          return (
            owner.view.preparing ||
            (owner.view.open &&
              !!owner.session &&
              (owner.session.starting ||
                owner.session.isSaving ||
                owner.session.controller.transport.status !== 'idle'))
          );
        },
        flush: () => {
          const owner = lifetime.current;
          if (owner.session?.isSaving || owner.props.operation.running)
            return Promise.resolve(false as const);
          return new Promise<void | false>((resolve) => {
            owner.continuation = resolve;
            owner.restart = false;
            owner.session?.requestClose();
          });
        },
      }),
    [registerPending]
  );
  const start = async () => {
    const owner = lifetime.current;
    if (owner.view.preparing || props.disabled || props.operation.running || durationLimit.invalid)
      return;
    const generation = ++owner.generation;
    owner.view = { ...owner.view, preparing: true };
    setView((current) => ({ ...current, preparing: true, error: false }));
    try {
      await owner.props.access.beforeRequest();
      if (!owner.mounted || owner.generation !== generation) return;
      owner.take.prepare();
      owner.restart = true;
      if (!owner.view.open) {
        owner.rearm = true;
        setView((current) => ({ ...current, open: true }));
      } else owner.session?.startRecording();
    } catch {
      if (owner.mounted) setView((current) => ({ ...current, error: true }));
    } finally {
      if (owner.mounted && owner.generation === generation) {
        owner.view = { ...owner.view, preparing: false };
        setView((current) => ({ ...current, preparing: false }));
      }
    }
  };
  const startRecording = session.startRecording;
  const confirmationOpen = session.confirmation.open;
  useEffect(() => {
    if (view.open && lifetime.current.rearm && !confirmationOpen) {
      lifetime.current.rearm = false;
      lifetime.current.restart = false;
      startRecording();
    }
  }, [view.open, confirmationOpen, startRecording]);
  return {
    session: {
      ...session,
      starting: (view.open && session.starting) || view.preparing,
      isSaving: (view.open && session.isSaving) || !!props.disabled || props.operation.running,
      startRecording: () => {
        void start();
      },
    },
    maximum: take.maximum,
    durationLimit,
    view,
    setPlayVideo: (playVideo: boolean) => setView((current) => ({ ...current, playVideo })),
    confirmation: {
      ...session.confirmation,
      cancel: () => {
        session.confirmation.cancel();
        take.cancelStart();
        lifetime.current.restart = false;
        lifetime.current.continuation?.(false);
        lifetime.current.continuation = null;
      },
      confirm: () => {
        if (lifetime.current.restart) take.discard(session.controller.save.audioBlob);
        lifetime.current.restart = false;
        session.confirmation.confirm();
      },
    },
  };
}

/** The current inspector holds capture and its existing discard confirmation; no recording window is opened. */
export function ReviewTextVoiceRecording(props: Props) {
  const context = props.access.context;
  return context ? <TextVoiceRecordingBody {...props} context={context} /> : null;
}

function TextVoiceRecordingBody(
  props: Props & { context: NonNullable<ReviewTextVoiceAccess['context']> }
) {
  const recording = useTextVoiceRecording(props, props.context);
  const { session } = recording;
  const { transport, trim } = session.controller;
  const capturing = transport.status === 'recording' || transport.status === 'paused';
  return (
    <div className="min-w-0 space-y-2" data-ui="gallery.videoReview.textVoiceRecording">
      {trim ? (
        <VoiceoverTakeReview
          session={session}
          durationLimit={recording.durationLimit}
          saveLabel={translate('gallery.videoReview.textVoiceLocalSave')}
        />
      ) : (
        <>
          <VoiceoverCaptureOptions
            session={session}
            capturing={capturing}
            playVideo={recording.view.playVideo}
            onPlayVideo={recording.setPlayVideo}
            durationLimit={recording.durationLimit}
            maximum={recording.maximum}
          />
          <VoiceoverTransport
            session={session}
            limit={recording.durationLimit.seconds}
            invalid={recording.durationLimit.invalid || !!props.disabled || props.operation.running}
          />
          <RecordingLevelMeter meter={session.controller.meter} preparing={session.starting} />
        </>
      )}
      {session.starting && (
        <p role="status" className="text-xs">
          {translate('videoEditor.app.recordAudioPreparing')}
        </p>
      )}
      {(recording.view.error || session.saveError || transport.error) && (
        <p role="alert" className="text-xs">
          {session.saveError || transport.error || translate('gallery.videoReview.speechChanged')}
        </p>
      )}
      <RecordingDiscardConfirmation
        dialogClassName="sniptale-compact-workspace"
        value={recording.confirmation}
      />
    </div>
  );
}
