import { inspectLocalVoiceSource } from '../video/local-voice-source';
import {
  assertLibraryAudioBindingSource,
  prepareLibraryAudioBinding,
  type readLibraryAudioBindingSource,
} from '../../composition/persistence/projects/library-asset-binding';
import type { createVideoReviewSession } from './session';
import {
  applyReviewTextTake,
  assertReviewTextTakeBasis,
  captureReviewTextTakeBasis,
  type ReviewTextTakePreview,
  type ReviewTextTakeOptions,
} from './text-take';

type Session = ReturnType<typeof createVideoReviewSession>;
type Basis = ReturnType<typeof captureReviewTextTakeBasis>;
type LibrarySource = Awaited<ReturnType<typeof readLibraryAudioBindingSource>>;

/** An auditioned Library row keeps its immutable source through proposal preparation. */
export type ReviewLocalTextVoiceSelection =
  | { kind: 'file'; file: File }
  | { kind: 'library'; id: string; auditionedSource?: LibrarySource };

export interface ReviewLocalTextVoicePreview extends ReviewTextTakePreview {
  filename: string;
  library?: { source: LibrarySource; projectAssetId: string };
}

/** Decoding/audition acquires no workspace or asset ownership and never saves the buffer. */
export async function prepareReviewLocalTextVoice(args: {
  session: Session;
  fragmentId: string;
  selection: ReviewLocalTextVoiceSelection;
  kind: 'microphone' | 'gallery';
  signal: AbortSignal;
  trimOffset?: number;
  basis?: Basis;
}): Promise<ReviewLocalTextVoicePreview> {
  const { session, fragmentId, selection, signal } = args;
  signal.throwIfAborted();
  const basis = args.basis ?? captureReviewTextTakeBasis(session, fragmentId);
  if (basis.fragment.id !== fragmentId || (args.kind === 'microphone' && selection.kind !== 'file'))
    throw new Error('invalid-request');
  const offset = args.trimOffset ?? 0;
  if (!Number.isFinite(offset) || offset < 0) throw new Error('duration');
  const { source, file, duration } = await inspectLocalVoiceSource(selection, signal);
  const fragment = basis.fragment;
  const preview: ReviewLocalTextVoicePreview = {
    clipId: `audio-${crypto.randomUUID()}`,
    textSnapshot: {
      kind: args.kind,
      textId: fragment.id,
      revision: fragment.revision,
      timingRevision: fragment.timingRevision,
      text: fragment.text,
      start: fragment.start,
      end: fragment.end,
      timeDomain: fragment.timeDomain,
    },
    geometry: basis.geometry,
    duration,
    resultStart: basis.resultStart + offset,
    blob: file,
    filename: file.name,
    url: '',
    expiresAt: Infinity,
    ...(source
      ? { library: { source, projectAssetId: source.entry?.id ?? crypto.randomUUID() } }
      : {}),
  };
  signal.throwIfAborted();
  assertReviewTextTakeBasis(session, preview);
  if (preview.resultStart + duration > basis.resultDuration) throw new Error('duration');
  preview.url = URL.createObjectURL(file);
  return preview;
}

/** Explicit Apply saves all editor buffers, then uses ordinary clip publication. */
export async function applyReviewLocalTextVoice(
  session: Session,
  preview: ReviewLocalTextVoicePreview,
  signal: AbortSignal,
  onRetained?: () => void,
  options?: ReviewTextTakeOptions
) {
  signal.throwIfAborted();
  // A previously accepted take owns its bytes independently of later text or Library edits.
  const accepted =
    preview.publication &&
    (await session.hasRetainedVoiceoverClip(preview.clipId, preview.publication.assetId));
  if (!accepted) {
    assertReviewTextTakeBasis(session, preview);
    await session.saveBuffered();
    signal.throwIfAborted();
    assertReviewTextTakeBasis(session, preview);
  }
  const library = preview.library;
  await applyReviewTextTake({
    session,
    preview,
    signal,
    filename: preview.filename,
    onRetained,
    options,
    ...(library
      ? {
          preparation: {
            assetId: `project-asset:${library.projectAssetId}`,
            prepare: async () => {
              if (preview.publication) {
                await assertLibraryAudioBindingSource(library.source, library.projectAssetId);
                return preview.publication;
              }
              const binding = await prepareLibraryAudioBinding(
                library.source,
                {
                  aggregateId: session.getSnapshot().snapshot.workspace.aggregateId,
                  clipId: preview.clipId,
                },
                library.projectAssetId
              );
              return {
                ...binding,
                duration: preview.duration,
                protect: async () => undefined,
                discard: binding.cancel,
              };
            },
          },
        }
      : {}),
  });
}
