import { Pause, Play } from 'lucide-react';
import { getVideoActivePauseResumeLabel } from '../helpers';
import {
  ACTIVE_PRIMARY_BUTTON_CLASS_NAME,
  ACTIVE_PRIMARY_BUTTON_HOVER_CLASS_NAME,
  ACTIVE_PRIMARY_BUTTON_HOVER_SURFACE_CLASS_NAME,
  ACTIVE_PRIMARY_BUTTON_SURFACE_CLASS_NAME,
  ACTIVE_PRIMARY_BUTTON_TEXT_CLASS_NAME,
  ACTIVE_PRIMARY_BUTTON_TONE_CLASS_NAME,
} from '../styles';

export function VideoActivePrimaryControl({
  isPaused,
  onPauseResume,
}: {
  isPaused: boolean;
  onPauseResume: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPauseResume}
      className={[
        ACTIVE_PRIMARY_BUTTON_CLASS_NAME,
        ACTIVE_PRIMARY_BUTTON_SURFACE_CLASS_NAME,
        ACTIVE_PRIMARY_BUTTON_TONE_CLASS_NAME,
        ACTIVE_PRIMARY_BUTTON_TEXT_CLASS_NAME,
        ACTIVE_PRIMARY_BUTTON_HOVER_CLASS_NAME,
        ACTIVE_PRIMARY_BUTTON_HOVER_SURFACE_CLASS_NAME,
      ].join(' ')}
    >
      {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      {getVideoActivePauseResumeLabel(isPaused)}
    </button>
  );
}
