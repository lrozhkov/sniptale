import type { PopupTabsRuntime } from '../runtime/types/tabs';
import { PopupTabs } from '../tabs';

export function TabsLayer({ runtime }: { runtime: PopupTabsRuntime }) {
  return (
    <PopupTabs
      page={runtime.navigation.page}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
      pendingPage={runtime.navigation.pendingPage}
      onPreload={(page) => {
        void runtime.navigation.preloadPage(page);
      }}
      onChange={(page) => {
        void runtime.navigation.navigateToPage(page, 'tab');
      }}
    />
  );
}
