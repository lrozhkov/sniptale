import { Suspense, useState, useEffect } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { DelayedSettingsCenteredLoadingState } from '../../section-surface/loading-state';
import { SettingsSectionHeaderActionsProvider } from '../../section-surface';
import { SettingsSidebar } from '../navigation/sidebar';
import { SettingsCommandPalette } from '../command-palette';
import { settingsPageContentClassName, settingsPageLayoutClassName } from '../../section-surface';
import {
  type SettingsRoute,
  updateSettingsRouteView,
} from '../../../platform/navigation/extension-pages/settings-route/codec';
import { useSettingsStore } from '../../runtime/store/useSettingsStore';
import { AISecretUnlockPage } from '../../sections/ai/unlock';
import {
  preloadDeferredSettingsSections,
  renderSettingsRouteContent,
  renderSettingsRouteHeader,
  shouldDeferSettingsTab,
} from './sections';
import { useSettingsRoute } from '../route/history';

function SettingsPageSurface(props: {
  onRouteChange: (route: SettingsRoute) => void;
  route: SettingsRoute;
}) {
  const content = renderSettingsRouteContent(props.route, (view) =>
    props.onRouteChange(updateSettingsRouteView(props.route, view))
  );
  const header = renderSettingsRouteHeader(props.route.section);

  return (
    <div data-ui="settings.page.layout" className={settingsPageLayoutClassName}>
      <SettingsSidebar
        activeTab={props.route.section}
        onTabChange={(section) => props.onRouteChange({ section })}
      />
      <main
        data-ui="settings.page.content"
        className={[settingsPageContentClassName, 'min-h-0 overflow-hidden'].join(' ')}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div data-ui="settings.page.header" className="shrink-0 px-5 pt-4 lg:px-8 lg:pt-6">
            {header}
          </div>
          <div
            data-ui="settings.page.content-scroll"
            className={[
              'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain',
              '[scrollbar-gutter:stable] px-5 pb-4 pt-4 lg:px-8 lg:pb-6 lg:pt-4',
            ].join(' ')}
          >
            {shouldDeferSettingsTab(props.route.section) ? (
              <Suspense fallback={<DelayedSettingsCenteredLoadingState />}>{content}</Suspense>
            ) : (
              content
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SettingsPageStyles() {
  return (
    <style>{`
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.25s ease-out;
      }
      .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `}</style>
  );
}

function SettingsPageMain() {
  const { loadSettings } = useSettingsStore();
  const { navigate, route } = useSettingsRoute();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  usePageLocaleMetadata('settings.navigation.documentTitle');

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const preloadTimeoutId = window.setTimeout(() => {
      void preloadDeferredSettingsSections();
    }, 150);

    return () => {
      window.clearTimeout(preloadTimeoutId);
    };
  }, []);

  return (
    <div
      data-ui="settings.page.root"
      className={
        'sniptale-extension-surface flex h-[100dvh] min-h-0 w-full overflow-hidden ' +
        'bg-[var(--sniptale-color-surface-canvas)] ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
    >
      <SettingsPageSurface route={route} onRouteChange={navigate} />
      <SettingsCommandPalette
        isOpen={commandPaletteOpen}
        activeTab={route.section}
        onClose={() => setCommandPaletteOpen(false)}
        onTabChange={(section) => navigate({ section })}
      />
      <SettingsPageStyles />
    </div>
  );
}

export function SettingsPage() {
  const isAIUnlockPage = new URL(globalThis.location.href).searchParams.get('aiUnlock') === '1';
  return isAIUnlockPage ? (
    <AISecretUnlockPage />
  ) : (
    <SettingsSectionHeaderActionsProvider>
      <SettingsPageMain />
    </SettingsSectionHeaderActionsProvider>
  );
}
