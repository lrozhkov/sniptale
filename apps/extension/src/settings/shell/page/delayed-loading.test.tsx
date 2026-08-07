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

vi.mock('../../sections/general/interface-browser', () => ({
  AppearanceSection: markerComponent('appearance-section'),
}));
vi.mock('../../sections/ai/connections', () => {
  settingsPageDelayMocks.loadedSectionModules.push('ai-connections');
  return { AIProvidersSection: markerComponent('ai-section') };
});
vi.mock('../../sections/capture/screen-sizes', () => {
  settingsPageDelayMocks.loadedSectionModules.push('screen-sizes');
  return { PresetsSection: markerComponent('presets-section') };
});
vi.mock('../../sections/capture/saving', () => {
  settingsPageDelayMocks.loadedSectionModules.push('saving');
  return { SavePresetsSection: markerComponent('saves-section') };
});
vi.mock('../../sections/styles/annotations', () => {
  settingsPageDelayMocks.loadedSectionModules.push('annotations');
  return { AnnotationsSection: markerComponent('highlighter-section') };
});
vi.mock('../../sections/styles/editor-resources', () => {
  settingsPageDelayMocks.loadedSectionModules.push('editor-resources');
  return { EditorResourcesSection: markerComponent('editor-section') };
});
vi.mock('../../sections/capture/media-quality', () => {
  settingsPageDelayMocks.loadedSectionModules.push('media-quality');
  return { MediaQualitySection: markerComponent('image-section') };
});
vi.mock('../../sections/ai/prompts', () => {
  settingsPageDelayMocks.loadedSectionModules.push('ai-prompts');
  return { AIPromptsSection: markerComponent('templates-section') };
});
vi.mock('../../sections/capture/quick-actions', () => {
  settingsPageDelayMocks.loadedSectionModules.push('quick-actions');
  return { QuickActionsSection: markerComponent('quickactions-section') };
});
vi.mock('../../sections/system/voice-input', () => {
  settingsPageDelayMocks.loadedSectionModules.push('voice-input');
  return { VoiceInputSettingsSection: markerComponent('voice-input-section') };
});
vi.mock('../../sections/system/native-app', () => {
  settingsPageDelayMocks.loadedSectionModules.push('native-app');
  return { NativeAppSection: markerComponent('native-section') };
});
vi.mock('../../sections/system/access-data', () => {
  settingsPageDelayMocks.loadedSectionModules.push('access-data');
  return { AccessDataSection: markerComponent('permissions-section') };
});

vi.mock('../navigation/sidebar', () => ({
  SettingsSidebar: (props: { onTabChange: (tab: string) => void }) => {
    settingsPageDelayMocks.settingsSidebarMock(props);
    return (
      <button type="button" onClick={() => props.onTabChange('ai-connections')}>
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
        'ai-connections',
        'screen-sizes',
        'saving',
        'annotations',
        'editor-resources',
        'media-quality',
        'ai-prompts',
        'quick-actions',
        'voice-input',
        'native-app',
        'access-data',
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
