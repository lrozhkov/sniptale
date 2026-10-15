import {
  parseQuickEditPresentationSettings,
  presentationEdgeControl,
  type QuickEditPresentationSettings,
} from '../../features/video/review/advanced/presentation';
import type { ReviewSource } from '../../features/video/review/types';
import type { createReviewPresentationAttachment } from '../../workflows/video-review/presentation-attachment';
import {
  inspectReviewPresentationVideo,
  ReviewPresentationAdmissionError,
} from '../../workflows/video-review/presentation-admission';
import { prepareStaticLogo } from '../../workflows/background-images/static-logo';
import { readLibraryBackground } from '../../composition/background-resources/acquisition';
import { getMediaLibraryEntry } from '../../composition/persistence/media-library';
import { readLibrarySceneBindingSource } from '../../composition/persistence/projects/library-scene-binding';

type Settings = QuickEditPresentationSettings;
type SlotName = 'intro' | 'outro';
type Acquisition = Parameters<typeof createReviewPresentationAttachment>[0]['acquisition'];
/** Identity-bearing picker intent; completion must retain this exact request object. */
export type ReviewPresentationPicker = {
  slot: SlotName;
  kind: 'image' | 'video' | 'media';
  source: 'computer' | 'library';
};
/** A selected source and explicit audio admission choice, retained for retry. */
export type ReviewPresentationSelection = {
  picker: ReviewPresentationPicker;
  input: { file: File } | { mediaId: string };
  muted: boolean;
};
type AdmittedPresentationSelection = {
  acquisition: Acquisition;
  media:
    | { kind: 'image'; width: number; height: number; filename?: string }
    | { kind: 'video'; source: ReviewSource; muted: boolean; filename?: string };
};

/** Reuses source-specific freeze/binding and decode authorities without publishing assets. */
export async function admitPresentationSelection(
  selection: ReviewPresentationSelection,
  signal: AbortSignal
): Promise<AdmittedPresentationSelection> {
  let kind = selection.picker.kind;
  if (kind === 'media') {
    if ('file' in selection.input) {
      kind = selection.input.file.type.startsWith('image/') ? 'image' : 'video';
    } else {
      const entry = await getMediaLibraryEntry(selection.input.mediaId);
      signal.throwIfAborted();
      if (!entry || !['image', 'screenshot', 'video'].includes(entry.kind))
        throw new ReviewPresentationAdmissionError('decode');
      kind = entry.kind === 'video' ? 'video' : 'image';
    }
  }
  let file: File;
  let acquisition: Acquisition;
  if ('file' in selection.input) {
    file = selection.input.file;
    acquisition = { kind: 'private-upload', file };
  } else {
    const { mediaId } = selection.input;
    const entry = kind === 'image' ? await getMediaLibraryEntry(mediaId) : undefined;
    signal.throwIfAborted();
    if (kind === 'image' && (entry?.kind === 'screenshot' || (entry?.workspaceRevision ?? 0) > 0)) {
      const frozen = await readLibraryBackground(mediaId, signal, prepareStaticLogo);
      file = frozen.file;
      acquisition = { kind: 'private-frozen-image', file, originMediaId: mediaId };
    } else {
      const source = await readLibrarySceneBindingSource(mediaId, kind);
      file = source.file;
      acquisition = { kind: 'library-binding', source };
    }
  }
  signal.throwIfAborted();
  if (kind === 'video') {
    const admitted = await inspectReviewPresentationVideo(file, signal, { muted: selection.muted });
    signal.throwIfAborted();
    if (
      acquisition.kind === 'library-binding' &&
      acquisition.source.ref.mimeType !== admitted.source.mimeType
    )
      throw new ReviewPresentationAdmissionError('decode');
    if (
      acquisition.kind !== 'library-binding' &&
      acquisition.file.type !== admitted.source.mimeType
    )
      acquisition = {
        ...acquisition,
        file: new File([file], file.name, { type: admitted.source.mimeType }),
      };
    return {
      acquisition,
      media: {
        kind: 'video',
        source: admitted.source,
        muted: selection.muted,
        filename: file.name,
      },
    };
  }
  const prepared =
    acquisition.kind === 'private-frozen-image' ? file : await prepareStaticLogo(file, signal);
  signal.throwIfAborted();
  if (acquisition.kind === 'library-binding' && prepared.type !== acquisition.source.ref.mimeType)
    acquisition = {
      kind: 'private-frozen-image',
      file: prepared,
      originMediaId: acquisition.source.mediaId,
    };
  else if (acquisition.kind !== 'library-binding') acquisition = { ...acquisition, file: prepared };
  const bitmap = await createImageBitmap(prepared);
  try {
    signal.throwIfAborted();
    return {
      acquisition,
      media: { kind: 'image', width: bitmap.width, height: bitmap.height, filename: file.name },
    };
  } finally {
    bitmap.close();
  }
}
/** Replaces only the admitted kind, retaining the other authored slot variant. */
export function attachedPresentationSettings(
  initial: Settings,
  slot: SlotName,
  media: AdmittedPresentationSelection['media'],
  assetId: string
): Settings {
  const before = initial[slot];
  const framing = { fit: 'contain', fillColor: '#000000ff', crop: { panX: 0, panY: 0 } } as const;
  const variant =
    media.kind === 'image'
      ? {
          ...framing,
          ...before.image,
          assetId,
          ...(media.filename === undefined ? {} : { filename: media.filename }),
          width: media.width,
          height: media.height,
          duration: before.image?.duration ?? 3,
        }
      : {
          ...framing,
          ...before.video,
          assetId,
          ...(media.filename === undefined ? {} : { filename: media.filename }),
          source: media.source,
          trim: { start: 0, end: media.source.duration },
          audio: { muted: media.muted, gain: before.video?.audio.gain ?? 1 },
        };
  const parsed = parseQuickEditPresentationSettings({
    ...initial,
    [slot === 'intro' ? 'introControl' : 'outroControl']: {
      ...presentationEdgeControl(initial, slot),
      mode: 'media',
    },
    [slot]: { ...before, mode: media.kind, [media.kind]: variant },
  });
  if (!parsed) throw new Error('Invalid admitted presentation media.');
  return parsed;
}
