import { FolderOpen } from 'lucide-react';
import { AudioLibrarySelection } from '../../composition/audio-library/selection';
import { translate } from '../../platform/i18n';
import { ReviewButton, reviewTextButtonClassName } from './controls';
import type { useReviewTextVoiceOperation } from './use-text-voice';

/** Gallery keeps its preparation and cancellation authority around the shared audio picker. */
export function ReviewTextVoiceGallery(props: {
  operation: ReturnType<typeof useReviewTextVoiceOperation>;
  disabled?: boolean | undefined;
}) {
  return (
    <div data-ui="gallery.videoReview.textVoiceGallery" className="min-w-0">
      <AudioLibrarySelection
        onSelect={props.operation.prepareLocal}
        onClose={props.operation.cancel}
        trigger={(open) => (
          <ReviewButton
            className={`${reviewTextButtonClassName} whitespace-normal`}
            label={translate('gallery.videoReview.textVoiceChooseAudio')}
            disabled={props.disabled || props.operation.running}
            onClick={open}
          >
            <FolderOpen size={14} aria-hidden="true" />
            {translate('gallery.videoReview.textVoiceChooseAudio')}
          </ReviewButton>
        )}
      />
    </div>
  );
}
