import { Suspense } from 'react';

import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import type { PopupRuntimeState } from '../../runtime/types/state';
import { LazyExportPage } from '../../lazy-chunks';
import { PopupHomePage } from '../../home/page-shell';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';
import { PopupVideoSetup } from '../video-setup';

export function PopupAppContent({ runtime }: { runtime: PopupRuntimeState }) {
  if (runtime.navigation.page === 'video') {
    return <PopupVideoSetup runtime={runtime} />;
  }

  if (runtime.navigation.page === 'export') {
    return (
      <Suspense fallback={<DelayedLoadingFallback fallback={<PopupRouteLoadingFallback />} />}>
        <LazyExportPage
          isActive
          activeTabCapabilities={runtime.environment.activeTabCapabilities}
          {...(runtime.environment.pageAccess
            ? { pageAccess: runtime.environment.pageAccess }
            : {})}
        />
      </Suspense>
    );
  }

  return (
    <PopupHomePage
      quickActions={runtime.home.quickActions}
      quickActionsReady={runtime.home.quickActionsReady}
      viewportPresets={runtime.home.viewportPresets}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      galleryStatus={runtime.environment.galleryStatus}
      homeError={runtime.home.homeError}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
    />
  );
}
