import { Suspense } from 'react';

import { DelayedLoadingFallback } from '@sniptale/ui/loading-delay';
import type { PopupExportRuntime } from '../../runtime/types/export-runtime';
import { LazyExportPage } from '../../lazy-chunks';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';

export function PopupAppContentExport({ runtime }: { runtime: PopupExportRuntime }) {
  return (
    <Suspense fallback={<DelayedLoadingFallback fallback={<PopupRouteLoadingFallback />} />}>
      <LazyExportPage
        isActive
        activeTabCapabilities={runtime.environment.activeTabCapabilities}
        {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
      />
    </Suspense>
  );
}
