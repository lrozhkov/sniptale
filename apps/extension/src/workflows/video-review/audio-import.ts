import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import {
  prepareProjectAsset,
  type PreparedProjectAsset,
} from '../../composition/persistence/projects';
import type { QuickEditAudioClip } from '../../features/video/review/advanced/types';
import { createQuickEditAudioClip } from '../../features/video/review/advanced/audio';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';

const IMPORTED_AUDIO_MAX_SECONDS = 3600;
const IMPORTED_AUDIO_MIN_SECONDS = 0.05;
const IMPORTED_AUDIO_MAX_BYTES = 64 * 1024 * 1024;

/** Diagnosable import admission failure. */
export class UnsupportedAudioFileError extends Error {
  readonly reason: 'type' | 'size' | 'duration';
  constructor(reason: 'type' | 'size' | 'duration') {
    super(
      reason === 'type'
        ? 'Unsupported audio file.'
        : reason === 'size'
          ? 'Unsupported audio size.'
          : 'Unsupported audio duration.'
    );
    this.name = 'UnsupportedAudioFileError';
    this.reason = reason;
  }
}

/** Cheap metadata admission for picker rows; unknown duration is checked after selection. */
export function reviewAudioRestriction(value: {
  mimeType: string;
  size: number;
  duration?: number | null;
}): UnsupportedAudioFileError['reason'] | null {
  if (value.mimeType && !value.mimeType.startsWith('audio/')) return 'type';
  if (value.size > IMPORTED_AUDIO_MAX_BYTES) return 'size';
  if (
    value.duration != null &&
    (!Number.isFinite(value.duration) ||
      value.duration < IMPORTED_AUDIO_MIN_SECONDS ||
      value.duration > IMPORTED_AUDIO_MAX_SECONDS)
  )
    return 'duration';
  return null;
}

/** Admission reads selected bytes only and does not acquire persistent ownership. */
export async function inspectReviewAudio(blob: Blob, signal: AbortSignal): Promise<number> {
  signal.throwIfAborted();
  const restriction = reviewAudioRestriction({ mimeType: blob.type, size: blob.size });
  if (restriction) throw new UnsupportedAudioFileError(restriction);
  const duration = await decodeAudioDuration(blob);
  signal.throwIfAborted();
  return duration;
}

async function decodeAudioDuration(blob: Blob): Promise<number> {
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await blob.arrayBuffer());
    if (
      !Number.isFinite(audio.duration) ||
      audio.duration < IMPORTED_AUDIO_MIN_SECONDS ||
      audio.duration > IMPORTED_AUDIO_MAX_SECONDS
    )
      throw new UnsupportedAudioFileError('duration');
    return audio.duration;
  } catch (error) {
    if (error instanceof UnsupportedAudioFileError) throw error;
    throw new UnsupportedAudioFileError('type');
  } finally {
    await context.close();
  }
}

export interface PreparedReviewAudio {
  assetId: string;
  duration: number;
  protect(): Promise<void>;
  cancel(): Promise<void>;
  /** Publishes the staged asset into the media library after a durable attach. */
  publish(): Promise<void>;
  /** Discards the staged asset; a failed publication keeps its recovery journal. */
  discard(): Promise<void>;
}

/** Admission and staging before any publication: type, size, duration, then bytes. */
export async function prepareReviewAudio(
  file: File,
  signal: AbortSignal,
  requiredReview?: { aggregateId: string; clipId: string }
): Promise<PreparedReviewAudio> {
  const duration = await inspectReviewAudio(file, signal);
  const prepared: PreparedProjectAsset = await prepareProjectAsset(
    file,
    file.type.startsWith('audio/') ? file.type : 'audio/mpeg',
    file.name,
    undefined,
    undefined,
    requiredReview
  );
  return {
    assetId: `project-asset:${prepared.id}`,
    duration,
    protect: prepared.protect,
    cancel: prepared.cancel,
    publish: async () => {
      await prepared.publish();
      publishMediaHubLibraryChanged('create', [`project-asset:${prepared.id}`]);
    },
    discard: prepared.discard,
  };
}

/**
 * Two-phase import: the asset is staged under ready protection, the review
 * attaches its durable reference, and only then the asset is published. Any
 * failure or cancellation before publication discards the staged asset.
 */
type ReviewAudioImport = {
  file: File;
  signal: AbortSignal;
  attach(assetId: string, duration: number): Promise<void>;
  assertCurrentTarget(): void;
  hasDurableReference?(assetId: string): boolean | Promise<boolean>;
  onPrepared?(prepared: PreparedReviewAudio): void;
  requiredReview?: { aggregateId: string; clipId: string };
  /** Existing-byte admission and receipt reuse must prepare under their known attachment lock. */
  preparation?: { assetId: string; prepare(): Promise<PreparedReviewAudio> };
};

export async function importReviewAudio(args: ReviewAudioImport): Promise<void> {
  if (args.preparation) {
    const preparation = args.preparation;
    return withVoiceoverAttachmentLock(preparation.assetId, async () => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      const prepared = await preparation.prepare();
      if (prepared.assetId !== preparation.assetId)
        throw new Error('Audio preparation changed identity');
      await attachPreparedReviewAudio(args, prepared);
    });
  }
  const prepared = await prepareReviewAudio(args.file, args.signal, args.requiredReview);
  return withVoiceoverAttachmentLock(prepared.assetId, () =>
    attachPreparedReviewAudio(args, prepared)
  );
}

/** File and existing-byte preparation join the same compensation and publication authority. */
async function attachPreparedReviewAudio(args: ReviewAudioImport, prepared: PreparedReviewAudio) {
  let attached = false;
  try {
    args.onPrepared?.(prepared);
    args.signal.throwIfAborted();
    args.assertCurrentTarget();
    await prepared.protect();
    args.signal.throwIfAborted();
    args.assertCurrentTarget();
    await args.attach(prepared.assetId, prepared.duration);
    // Ownership transfers to the durable reference; a publish failure keeps the
    // staged bytes for recovery instead of deleting referenced material.
    attached = true;
    await prepared.publish();
  } finally {
    if (!attached) {
      let durable = false;
      try {
        durable = (await args.hasDurableReference?.(prepared.assetId)) ?? false;
      } catch {
        // An unavailable durability check must keep the journal and staged bytes.
        durable = true;
      }
      if (!durable) await prepared.cancel();
    }
  }
}

/** Places an imported clip at the target time, bounded by the timeline end. */
export function importedAudioClip(
  assetId: string,
  duration: number,
  atTime: number,
  timelineDuration: number
): QuickEditAudioClip {
  return createQuickEditAudioClip({
    id: `audio-${crypto.randomUUID()}`,
    assetId,
    timelineStart: atTime,
    duration,
    endMax: timelineDuration,
  });
}
