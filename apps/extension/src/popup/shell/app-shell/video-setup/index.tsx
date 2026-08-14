import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { getResolvedVideoSetupPage } from '../../lazy-chunks';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';
import { getPopupVideoSetupProps } from './props';

export function PopupVideoSetup({ runtime }: { runtime: PopupVideoSetupRuntime }) {
  const VideoSetupPage = getResolvedVideoSetupPage();
  if (!VideoSetupPage) return <PopupRouteLoadingFallback />;
  return <VideoSetupPage {...getPopupVideoSetupProps(runtime)} />;
}
