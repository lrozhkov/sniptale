import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../ui/compact-inspector-controls/layout';
import '../../../ui/compact-inspector-controls/inspector-surface.css';
import './interface.css';
import { Suspense, useState, useEffect, useRef } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { DelayedSettingsCenteredLoadingState } from '../../section-surface/loading-state';
import {
  SettingsNavigationLockProvider,
  SettingsSectionHeaderActionsProvider,
  useSettingsNavigationLock,
} from '../../section-surface';
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
import { useSettingsStickyNavScrollPadding } from './sticky-nav-scroll';
import { RecordingMediaAccessProvider } from '../../runtime/recording-media-access/provider';

function SettingsPageSurface(props: {
  navigationLocked: boolean;
  onRouteChange: (route: SettingsRoute) => void;
  route: SettingsRoute;
}) {
  const contentScrollRef = useRef<HTMLDivElement>(null);
  useSettingsStickyNavScrollPadding(contentScrollRef);
  const content = renderSettingsRouteContent(props.route, (view) =>
    props.onRouteChange(updateSettingsRouteView(props.route, view))
  );
  const header = renderSettingsRouteHeader(props.route.section);

  return (
    <div data-ui="settings.page.layout" className={settingsPageLayoutClassName}>
      <SettingsSidebar
        activeTab={props.route.section}
        disabled={props.navigationLocked}
        onTabChange={(section) => props.onRouteChange({ section })}
      />
      <main
        data-ui="settings.page.content"
        className={[
          settingsPageContentClassName,
          'sniptale-inspector-surface min-h-0 overflow-hidden',
        ].join(' ')}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div data-ui="settings.page.header" className="shrink-0 px-4 pt-3">
            {header}
          </div>
          <div
            ref={contentScrollRef}
            data-ui="settings.page.content-scroll"
            className={[
              'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain',
              '[scrollbar-gutter:stable] px-4 pb-3 pt-3',
              '[--settings-scroll-inset-x:1rem]',
              '[--settings-scroll-inset-top:0.75rem]',
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
      .sniptale-settings-workspace .animate-fadeIn {
        animation: fadeIn 0.25s ease-out;
      }
      .sniptale-settings-workspace .line-clamp-2 {
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
  const { locked: navigationLocked } = useSettingsNavigationLock();
  const { navigate, route } = useSettingsRoute({ navigationBlocked: navigationLocked });
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  usePageLocaleMetadata('settings.navigation.documentTitle');

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => {
      if (!navigationLocked) setCommandPaletteOpen(true);
    },
    onClose: () => setCommandPaletteOpen(false),
  });

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (navigationLocked) setCommandPaletteOpen(false);
  }, [navigationLocked]);

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
        'sniptale-extension-surface sniptale-compact-workspace sniptale-settings-workspace ' +
        'sniptale-inspector-surface flex w-full ' +
        'bg-[var(--sniptale-color-surface-canvas)] ' +
        'text-[var(--sniptale-color-text-primary)]'
      }
    >
      <SettingsPageSurface
        route={route}
        navigationLocked={navigationLocked}
        onRouteChange={navigate}
      />
      <SettingsCommandPalette
        isOpen={commandPaletteOpen && !navigationLocked}
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
  return (
    <CommandPressScope value={true}>
      <InspectorLayout>
        <div className="sniptale-settings-viewport">
          {isAIUnlockPage ? (
            <AISecretUnlockPage />
          ) : (
            <SettingsSectionHeaderActionsProvider>
              <SettingsNavigationLockProvider>
                <RecordingMediaAccessProvider>
                  <SettingsPageMain />
                </RecordingMediaAccessProvider>
              </SettingsNavigationLockProvider>
            </SettingsSectionHeaderActionsProvider>
          )}
        </div>
      </InspectorLayout>
    </CommandPressScope>
  );
}
