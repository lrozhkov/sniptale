import { Suspense } from 'react';

import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { LazyVideoSetupPage } from '../../lazy-chunks';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';
import { getPopupVideoSetupProps } from './props';

export function PopupVideoSetup({ runtime }: { runtime: PopupVideoSetupRuntime }) {
  return (
    <Suspense fallback={<DelayedLoadingFallback fallback={<PopupRouteLoadingFallback />} />}>
      <LazyVideoSetupPage {...getPopupVideoSetupProps(runtime)} />
    </Suspense>
  );
}
