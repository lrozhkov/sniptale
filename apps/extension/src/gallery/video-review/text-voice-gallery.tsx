import { useEffect, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { readLibraryAudioBindingSource } from '../../composition/persistence/projects/library-asset-binding';
import { reviewAudioRestriction } from '../../workflows/video-review/audio-import';
import { translate } from '../../platform/i18n';
import { MusicLibraryDrawer } from './music-library';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import type { useReviewTextVoiceOperation } from './use-text-voice';

/** Existing Library search/upload/audition chooses a disposable proposal in the current inspector. */
export function ReviewTextVoiceGallery(props: {
  operation: ReturnType<typeof useReviewTextVoiceOperation>;
  disabled?: boolean | undefined;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({
    open: false,
    playingId: null as string | null,
    loadingId: null as string | null,
  });
  const lifetime = useRef({
    mounted: true,
    generation: 0,
    audio: null as HTMLAudioElement | null,
    url: '',
    auditioned: new Map<string, Awaited<ReturnType<typeof readLibraryAudioBindingSource>>>(),
  });
  const stop = () => {
    const owner = lifetime.current;
    owner.generation += 1;
    owner.audio?.pause();
    owner.audio = null;
    if (owner.url) URL.revokeObjectURL(owner.url);
    owner.url = '';
    if (owner.mounted) setState((current) => ({ ...current, playingId: null, loadingId: null }));
  };
  useEffect(() => {
    const owner = lifetime.current;
    owner.mounted = true;
    return () => {
      owner.mounted = false;
      stop();
      owner.auditioned.clear();
    };
  }, []);
  const close = () => {
    stop();
    lifetime.current.auditioned.clear();
    props.operation.cancel();
    setState((current) => ({ ...current, open: false }));
  };
  const choose = async (selection: Parameters<typeof props.operation.prepareLocal>[0]) => {
    const auditionedSource =
      selection.kind === 'library' ? lifetime.current.auditioned.get(selection.id) : undefined;
    const captured = auditionedSource ? { ...selection, auditionedSource } : selection;
    stop();
    const pending = props.operation.prepareLocal(captured);
    if (!pending) throw new Error('busy');
    await pending;
    lifetime.current.auditioned.clear();
    if (lifetime.current.mounted) setState((current) => ({ ...current, open: false }));
  };
  const audition = async (id: string) => {
    stop();
    const owner = lifetime.current;
    const generation = owner.generation;
    setState((current) => ({ ...current, loadingId: id }));
    try {
      const source = await readLibraryAudioBindingSource(id);
      if (!owner.mounted || generation !== owner.generation) return;
      owner.auditioned.set(id, source);
      owner.url = URL.createObjectURL(source.file);
      const audio = new Audio(owner.url);
      owner.audio = audio;
      audio.onended = stop;
      await audio.play();
      if (!owner.mounted || generation !== owner.generation) return;
      setState((current) => ({ ...current, playingId: id, loadingId: null }));
    } catch (error) {
      if (owner.mounted && generation === owner.generation) stop();
      throw error;
    }
  };
  return (
    <div ref={anchor} data-ui="gallery.videoReview.textVoiceGallery" className="min-w-0">
      <ReviewButton
        className={`${reviewTextButtonClassName} whitespace-normal`}
        label={translate('gallery.videoReview.textVoiceChooseAudio')}
        disabled={props.disabled || props.operation.running}
        onClick={() => setState((current) => ({ ...current, open: true }))}
      >
        <FolderOpen size={14} />
        {translate('gallery.videoReview.textVoiceChooseAudio')}
      </ReviewButton>
      {state.open && (
        <MusicLibraryDrawer
          label={translate('gallery.videoReview.textVoiceAudioGallery')}
          anchor={anchor.current}
          onClose={close}
          onSelect={(id) => choose({ kind: 'library', id })}
          onUpload={(file) => choose({ kind: 'file', file })}
          onPreview={audition}
          onStopPreview={stop}
          playingId={state.playingId}
          loadingId={state.loadingId}
          unavailable={(item) => {
            const restriction = reviewAudioRestriction({
              mimeType: item.mimeType,
              size: item.size,
            });
            return restriction
              ? translate(
                  restriction === 'size'
                    ? 'gallery.videoReview.musicTooLarge'
                    : 'gallery.videoReview.musicUnsupported'
                )
              : null;
          }}
        />
      )}
    </div>
  );
}
