import { getVideoActiveIdleLabel } from '../helpers';
import {
  ACTIVE_IDLE_STATE_CLASS_NAME,
  ACTIVE_IDLE_STATE_SURFACE_CLASS_NAME,
  ACTIVE_IDLE_STATE_TEXT_CLASS_NAME,
} from '../styles';

export function VideoActiveIdleState({ isBusy }: { isBusy: boolean }) {
  return (
    <div
      className={[
        ACTIVE_IDLE_STATE_CLASS_NAME,
        ACTIVE_IDLE_STATE_SURFACE_CLASS_NAME,
        ACTIVE_IDLE_STATE_TEXT_CLASS_NAME,
      ].join(' ')}
    >
      {getVideoActiveIdleLabel(isBusy)}
    </div>
  );
}
