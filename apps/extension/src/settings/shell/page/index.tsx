import { Suspense, useState, useEffect } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { DelayedSettingsCenteredLoadingState } from '../../section-surface/loading-state';
import { SettingsSidebar } from '../navigation/sidebar';
import { SettingsCommandPalette } from '../command-palette';
import { settingsPageContentClassName, settingsPageLayoutClassName } from '../../section-surface';
import { type SettingsTab } from '../navigation';
import { useSettingsStore } from '../../runtime/store/useSettingsStore';
import { AISecretUnlockPage } from '../../sections/ai-unlock';
import {
  preloadDeferredSettingsSections,
  renderSettingsTabContent,
  shouldDeferSettingsTab,
} from './sections';

function SettingsPageSurface(props: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const content = renderSettingsTabContent(props.activeTab);

  return (
    <div data-ui="settings.page.layout" className={settingsPageLayoutClassName}>
      <SettingsSidebar activeTab={props.activeTab} onTabChange={props.onTabChange} />
      <main
        data-ui="settings.page.content"
        className={[settingsPageContentClassName, 'min-h-0 overflow-hidden'].join(' ')}
      >
        <div className="h-full min-h-0 pb-4 pr-5 pt-4 lg:pb-5 lg:pr-6 lg:pt-5">
          <div
            data-ui="settings.page.content-scroll"
            className={[
              'h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain',
              '[scrollbar-gutter:stable] p-6 lg:p-8',
            ].join(' ')}
          >
            {shouldDeferSettingsTab(props.activeTab) ? (
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

function SettingsPageBackdrop() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0" aria-hidden="true" />
      <div
        className={[
          'pointer-events-none fixed inset-x-0 top-0 h-[320px]',
          'bg-[radial-gradient(circle_at_top,' +
            'color-mix(in_srgb,var(--sniptale-color-accent-soft)_26%,transparent),' +
            'transparent_68%)]',
        ].join(' ')}
      />
      <div
        className={[
          'pointer-events-none fixed inset-y-0 right-0 w-[28vw]',
          'bg-[radial-gradient(circle_at_center,' +
            'color-mix(in_srgb,var(--sniptale-color-info)_10%,transparent),' +
            'transparent_74%)]',
        ].join(' ')}
      />
    </>
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
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => getInitialSettingsTab());
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
      <SettingsPageBackdrop />
      <SettingsPageSurface activeTab={activeTab} onTabChange={setActiveTab} />
      <SettingsCommandPalette
        isOpen={commandPaletteOpen}
        activeTab={activeTab}
        onClose={() => setCommandPaletteOpen(false)}
        onTabChange={setActiveTab}
      />
      <SettingsPageStyles />
    </div>
  );
}

export function SettingsPage() {
  const isAIUnlockPage = new URL(globalThis.location.href).searchParams.get('aiUnlock') === '1';
  return isAIUnlockPage ? <AISecretUnlockPage /> : <SettingsPageMain />;
}

function getInitialSettingsTab(): SettingsTab {
  const section = new URL(globalThis.location.href).searchParams.get('section');
  if (
    section === 'native-app' ||
    section === 'native-hotkeys' ||
    section === 'native-screenshots' ||
    section === 'native-video' ||
    section === 'native-telemetry'
  ) {
    return 'nativeApp';
  }
  if (section === 'permissions') {
    return 'permissions';
  }
  return 'appearance';
}
