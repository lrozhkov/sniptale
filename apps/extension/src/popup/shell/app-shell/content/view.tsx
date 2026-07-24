import { Suspense } from 'react';

import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import type { PopupCommandPaletteRuntime } from '../../runtime/types/command-palette';
import type { PopupExportRuntime } from '../../runtime/types/export-runtime';
import type { PopupHomeRuntime } from '../../runtime/types/home-runtime';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { LazyExportPage } from '../../lazy-chunks';
import { PopupHomePage } from '../../home/page-shell';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';
import { PopupVideoSetup } from '../video-setup';

type PopupAppHomeRuntime = PopupHomeRuntime & PopupCommandPaletteRuntime;

type PopupAppExportRuntime = PopupExportRuntime;

type PopupAppVideoRuntime = PopupVideoSetupRuntime;

type PopupAppContentRuntime = PopupAppHomeRuntime & PopupAppExportRuntime & PopupAppVideoRuntime;

export function PopupAppContent({ runtime }: { runtime: PopupAppContentRuntime }) {
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
      displayMode={runtime.home.displayMode}
      viewportPresets={runtime.home.viewportPresets}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      galleryStatus={runtime.environment.galleryStatus}
      homeError={runtime.home.homeError}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
    />
  );
}
