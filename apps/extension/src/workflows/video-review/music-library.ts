import {
  prepareLibraryAudioBinding,
  readLibraryAudioBindingSource,
} from '../../composition/persistence/projects/library-asset-binding';
import { withVoiceoverAttachmentLock } from '../../composition/persistence/projects/voiceover-publication-lock';
import { inspectReviewAudio, prepareReviewAudio, type PreparedReviewAudio } from './audio-import';

export type ReviewMusicSelection = { kind: 'library'; id: string } | { kind: 'file'; file: File };
type MusicAsset = PreparedReviewAudio & { filename: string };
type MusicAttachmentArgs = {
  selection: ReviewMusicSelection;
  aggregateId: string;
  clipId: string;
  signal: AbortSignal;
  assertCurrentTarget(): void;
  attach(assetId: string, duration: number, filename: string): Promise<void>;
  hasDurableReference(assetId: string): Promise<boolean>;
};

/** One explicit insertion, including retry of publication after durable attachment. */
export function createReviewMusicAttachment(args: MusicAttachmentArgs) {
  let prepared: MusicAsset | null = null;
  let attached = false;
  let complete = false;
  let flight: Promise<MusicAsset> | null = null;
  const attachPrepared = async (asset: MusicAsset) => {
    try {
      if (!attached) {
        args.signal.throwIfAborted();
        args.assertCurrentTarget();
        await asset.protect();
        args.signal.throwIfAborted();
        args.assertCurrentTarget();
        await args.attach(asset.assetId, asset.duration, asset.filename);
        attached = true;
      }
      await asset.publish();
      complete = true;
      return asset;
    } finally {
      if (!attached) {
        // A thrown commit may already be durable. Uncertainty retains its claim.
        let retained: boolean | null = null;
        try {
          retained = await args.hasDurableReference(asset.assetId);
        } catch {
          /* Retain. */
        }
        if (retained === true) attached = true;
        else if (retained === false) {
          await asset.cancel();
          prepared = null;
        }
      }
    }
  };
  const perform = async (): Promise<MusicAsset> => {
    args.signal.throwIfAborted();
    args.assertCurrentTarget();
    if (prepared) {
      if (complete) return prepared;
      const asset = prepared;
      return withVoiceoverAttachmentLock(asset.assetId, () => attachPrepared(asset));
    }
    const requiredReview = { aggregateId: args.aggregateId, clipId: args.clipId };
    if (args.selection.kind === 'file') {
      const asset = await prepareReviewAudio(args.selection.file, args.signal, requiredReview);
      prepared = { ...asset, filename: args.selection.file.name };
      const selected = prepared;
      return withVoiceoverAttachmentLock(asset.assetId, () => attachPrepared(selected));
    }
    const source = await readLibraryAudioBindingSource(args.selection.id);
    const duration = await inspectReviewAudio(source.file, args.signal);
    const projectAssetId = source.entry?.id ?? crypto.randomUUID();
    return withVoiceoverAttachmentLock(`project-asset:${projectAssetId}`, async () => {
      args.signal.throwIfAborted();
      args.assertCurrentTarget();
      const binding = await prepareLibraryAudioBinding(source, requiredReview, projectAssetId);
      const asset: MusicAsset = {
        ...binding,
        duration,
        filename: source.filename,
        protect: async () => undefined,
        discard: binding.cancel,
      };
      prepared = asset;
      return attachPrepared(asset);
    });
  };
  return {
    hasRetainedAsset: () => prepared !== null,
    run(): Promise<MusicAsset> {
      if (flight) return flight;
      const pending = perform();
      flight = pending;
      void pending
        .finally(() => {
          if (flight === pending) flight = null;
        })
        .catch(() => undefined);
      return pending;
    },
  };
}
