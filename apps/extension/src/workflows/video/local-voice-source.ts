import { readLibraryAudioBindingSource } from '../../composition/persistence/projects/library-asset-binding';
import { inspectReviewAudio } from '../video-review/audio-import';

type LibrarySource = Awaited<ReturnType<typeof readLibraryAudioBindingSource>>;

/** Inspects the selected immutable source without publishing or acquiring destination ownership. */
export async function inspectLocalVoiceSource(
  selection:
    | { kind: 'file'; file: File }
    | { kind: 'library'; id: string; auditionedSource?: LibrarySource },
  signal: AbortSignal
) {
  const source =
    selection.kind === 'library'
      ? (selection.auditionedSource ?? (await readLibraryAudioBindingSource(selection.id)))
      : null;
  if (selection.kind === 'library' && source?.mediaId !== selection.id)
    throw new Error('invalid-request');
  const file = source?.file ?? (selection.kind === 'file' ? selection.file : null);
  if (!file) throw new Error('invalid-request');
  const duration = await inspectReviewAudio(file, signal);
  return { source, file, duration };
}
