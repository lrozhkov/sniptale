import type { ReactNode } from 'react';
import { Volume2 } from 'lucide-react';
import { translate } from '../../platform/i18n';

/** One remembered inspector section for both single and bulk presentation modes. */
export function reviewActionAudioSection(content: ReactNode) {
  return {
    id: 'action-audio',
    label: translate('gallery.videoReview.actionAudio'),
    icon: Volume2,
    content,
  };
}
