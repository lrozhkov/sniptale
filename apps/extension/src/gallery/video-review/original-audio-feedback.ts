import { translate } from '../../platform/i18n';
import type { useReviewAudio } from './use-review-audio';

/** Placement state stays with the audio owner; the inspector owns its localized notice. */
export function reviewOriginalAudioFeedbackMessage(
  feedback: ReturnType<typeof useReviewAudio>['originalFeedback']
): string | null {
  if (!feedback) return null;
  const keys = {
    'too-short': 'gallery.videoReview.originalAudioTooShort',
    overlap: 'gallery.videoReview.originalAudioOverlap',
    cut: 'gallery.videoReview.originalAudioCut',
    limit: 'gallery.videoReview.originalAudioLimit',
  } as const;
  return translate(keys[feedback]);
}
