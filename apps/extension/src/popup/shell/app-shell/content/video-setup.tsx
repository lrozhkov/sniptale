import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { PopupVideoSetup } from '../video-setup';

export function PopupAppContentVideoSetup({ runtime }: { runtime: PopupVideoSetupRuntime }) {
  return <PopupVideoSetup runtime={runtime} />;
}
