import type { PopupTabsRuntime } from '../runtime/types/tabs';
import { PopupTabs } from '../tabs';

export function TabsLayer({ runtime }: { runtime: PopupTabsRuntime }) {
  return (
    <PopupTabs
      page={runtime.navigation.page}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
      onChange={runtime.navigation.setPage}
    />
  );
}
