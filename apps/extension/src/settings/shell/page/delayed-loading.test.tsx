// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsPageDelayMocks = vi.hoisted(() => ({
  loadedSectionModules: [] as string[],
  loadSettingsMock: vi.fn(),
  settingsCommandPaletteMock: vi.fn(),
  settingsSidebarMock: vi.fn(),
  suspendedSectionLabel: null as string | null,
  suspendedSectionPromise: new Promise<never>(() => undefined),
  useAppLocaleMock: vi.fn(),
  useCommandPaletteHotkeyMock: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: () => settingsPageDelayMocks.useAppLocaleMock(),
    usePageLocaleMetadata: () => settingsPageDelayMocks.useAppLocaleMock(),
  };
});

vi.mock('../../../ui/command-palette/hotkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette/hotkey')>()),
  useCommandPaletteHotkey: (args: unknown) =>
    settingsPageDelayMocks.useCommandPaletteHotkeyMock(args),
}));

vi.mock('@sniptale/ui/skeleton', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/skeleton')>()),
  Skeleton: () => <div data-ui="settings.loading.skeleton" />,
}));

vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../runtime/store/useSettingsStore')>();
  return {
    ...actual,
    useSettingsStore: () => settingsPageDelayMocks.useSettingsStoreMock(),
  };
});

function markerComponent(label: string) {
  return () => {
    if (settingsPageDelayMocks.suspendedSectionLabel === label) {
      throw settingsPageDelayMocks.suspendedSectionPromise;
    }

    return <div>{label}</div>;
  };
}

vi.mock('../../sections/appearance', () => ({
  AppearanceSection: markerComponent('appearance-section'),
}));
vi.mock('../../sections/ai-providers', () => {
  settingsPageDelayMocks.loadedSectionModules.push('ai');
  return { AIProvidersSection: markerComponent('ai-section') };
});
vi.mock('../../sections/viewport-presets', () => {
  settingsPageDelayMocks.loadedSectionModules.push('presets');
  return { PresetsSection: markerComponent('presets-section') };
});
vi.mock('../../sections/save-presets', () => {
  settingsPageDelayMocks.loadedSectionModules.push('saves');
  return { SavePresetsSection: markerComponent('saves-section') };
});
vi.mock('../../sections/highlighter/section', () => {
  settingsPageDelayMocks.loadedSectionModules.push('highlighter');
  return { HighlighterSection: markerComponent('highlighter-section') };
});
vi.mock('../../sections/editor', () => {
  settingsPageDelayMocks.loadedSectionModules.push('editor');
  return { EditorSection: markerComponent('editor-section') };
});
vi.mock('../../sections/image', () => {
  settingsPageDelayMocks.loadedSectionModules.push('image');
  return { ImageSettingsSection: markerComponent('image-section') };
});
vi.mock('../../sections/templates', () => {
  settingsPageDelayMocks.loadedSectionModules.push('templates');
  return { TemplatesSection: markerComponent('templates-section') };
});
vi.mock('../../sections/page-styles', () => {
  settingsPageDelayMocks.loadedSectionModules.push('pagestyles');
  return { PageStylesSection: markerComponent('pagestyles-section') };
});
vi.mock('../../sections/quick-actions', () => {
  settingsPageDelayMocks.loadedSectionModules.push('quickactions');
  return { QuickActionsSection: markerComponent('quickactions-section') };
});
vi.mock('../../sections/permissions', () => {
  settingsPageDelayMocks.loadedSectionModules.push('permissions');
  return { PermissionsSection: markerComponent('permissions-section') };
});
vi.mock('../../sections/privacy', () => {
  settingsPageDelayMocks.loadedSectionModules.push('privacy');
  return { PrivacySection: markerComponent('privacy-section') };
});

vi.mock('../navigation/sidebar', () => ({
  SettingsSidebar: (props: { onTabChange: (tab: string) => void }) => {
    settingsPageDelayMocks.settingsSidebarMock(props);
    return (
      <button type="button" onClick={() => props.onTabChange('ai')}>
        ai
      </button>
    );
  },
}));

vi.mock('../command-palette', () => ({
  SettingsCommandPalette: (props: unknown) => {
    settingsPageDelayMocks.settingsCommandPaletteMock(props);
    return null;
  },
}));

import { SettingsPage } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderPage() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SettingsPage />);
  });
}

async function flushDeferredSection() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function advanceTimersBy(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  settingsPageDelayMocks.loadedSectionModules.length = 0;
  settingsPageDelayMocks.loadSettingsMock.mockReset();
  settingsPageDelayMocks.settingsCommandPaletteMock.mockReset();
  settingsPageDelayMocks.settingsSidebarMock.mockReset();
  settingsPageDelayMocks.suspendedSectionLabel = null;
  settingsPageDelayMocks.useAppLocaleMock.mockReset();
  settingsPageDelayMocks.useCommandPaletteHotkeyMock.mockReset();
  settingsPageDelayMocks.useSettingsStoreMock.mockReturnValue({
    loadSettings: settingsPageDelayMocks.loadSettingsMock,
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SettingsPage delayed loading', () => {
  it('preloads deferred settings sections after the first paint delay', async () => {
    await renderPage();

    expect(settingsPageDelayMocks.loadedSectionModules).toEqual([]);

    await advanceTimersBy(149);
    expect(settingsPageDelayMocks.loadedSectionModules).toEqual([]);

    await advanceTimersBy(1);
    await flushDeferredSection();

    expect(new Set(settingsPageDelayMocks.loadedSectionModules)).toEqual(
      new Set([
        'ai',
        'presets',
        'saves',
        'highlighter',
        'editor',
        'image',
        'templates',
        'pagestyles',
        'quickactions',
        'permissions',
        'privacy',
      ])
    );
  });

  it('shows the settings skeleton only after a slow deferred section stays pending', async () => {
    settingsPageDelayMocks.suspendedSectionLabel = 'ai-section';

    await renderPage();
    await act(async () => {
      container?.querySelector('button')?.click();
    });
    await flushDeferredSection();

    expect(container?.querySelector('[data-ui="settings.loading.skeleton"]')).toBeNull();

    await advanceTimersBy(350);

    expect(container?.querySelector('[data-ui="settings.loading.skeleton"]')).not.toBeNull();
    expect(container?.textContent).not.toContain('ai-section');
  });
});
