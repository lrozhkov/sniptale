// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsPageMocks = vi.hoisted(() => ({
  loadSettingsMock: vi.fn(),
  settingsCommandPaletteMock: vi.fn(),
  settingsSidebarMock: vi.fn(),
  useAppLocaleMock: vi.fn(),
  useCommandPaletteHotkeyMock: vi.fn(),
  useSettingsStoreMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useAppLocale: () => settingsPageMocks.useAppLocaleMock(),
  usePageLocaleMetadata: () => settingsPageMocks.useAppLocaleMock(),
}));

vi.mock('../../../ui/command-palette/hotkey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette/hotkey')>()),
  useCommandPaletteHotkey: (args: unknown) => settingsPageMocks.useCommandPaletteHotkeyMock(args),
}));

vi.mock('@sniptale/ui/skeleton', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/skeleton')>()),
  Skeleton: () => <div data-ui="settings.loading.skeleton" />,
}));

vi.mock('../../runtime/store/useSettingsStore', async (importOriginal) => ({
  ...(await importOriginal()),
  useSettingsStore: () => settingsPageMocks.useSettingsStoreMock(),
}));

function markerComponent(label: string) {
  return () => <div>{label}</div>;
}

vi.mock('../../sections/appearance', () => ({
  AppearanceSection: markerComponent('appearance-section'),
}));
vi.mock('../../sections/ai-providers', () => {
  return { AIProvidersSection: markerComponent('ai-section') };
});
vi.mock('../../sections/viewport-presets', () => {
  return { PresetsSection: markerComponent('presets-section') };
});
vi.mock('../../sections/save-presets', () => {
  return { SavePresetsSection: markerComponent('saves-section') };
});
vi.mock('../../sections/templates', () => {
  return { TemplatesSection: markerComponent('templates-section') };
});
vi.mock('../../sections/permissions', () => {
  return { PermissionsSection: markerComponent('permissions-section') };
});
vi.mock('../../sections/image', () => {
  return { ImageSettingsSection: markerComponent('image-section') };
});
vi.mock('../../sections/quick-actions', () => {
  return { QuickActionsSection: markerComponent('quickactions-section') };
});
vi.mock('../../sections/highlighter/section', () => {
  return { HighlighterSection: markerComponent('highlighter-section') };
});

vi.mock('../navigation/sidebar', () => ({
  SettingsSidebar: (props: { onTabChange: (tab: string) => void }) => {
    settingsPageMocks.settingsSidebarMock(props);
    return (
      <div data-ui="settings.sidebar">
        {[
          'appearance',
          'ai',
          'presets',
          'saves',
          'highlighter',
          'image',
          'templates',
          'quickactions',
          'permissions',
        ].map((tab) => (
          <button key={tab} type="button" onClick={() => props.onTabChange(tab)}>
            {tab}
          </button>
        ))}
      </div>
    );
  },
}));

vi.mock('../command-palette', () => ({
  SettingsCommandPalette: (props: {
    isOpen: boolean;
    onClose: () => void;
    onTabChange: (tab: string) => void;
  }) => {
    settingsPageMocks.settingsCommandPaletteMock(props);
    return props.isOpen ? (
      <div data-testid="settings-command-palette">
        <button type="button" onClick={() => props.onTabChange('quickactions')}>
          palette-quickactions
        </button>
        <button type="button" onClick={props.onClose}>
          palette-close
        </button>
      </div>
    ) : null;
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

async function flushLazySettingsSection() {
  await act(async () => {
    await Promise.resolve();
  });
}

function clickButton(label: string) {
  const button = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (item) => item.textContent === label
  );
  button?.click();
}

function expectSettingsPageShell() {
  expect(container?.querySelector('[data-ui="settings.page.root"]')?.className).toContain(
    'h-[100dvh]'
  );
  expect(container?.querySelector('[data-ui="settings.page.layout"]')?.className).toContain(
    'min-h-0'
  );
  expect(container?.querySelector('[data-ui="settings.page.content"]')?.className).toContain(
    'overflow-hidden'
  );
  expect(container?.querySelector('[data-ui="settings.page.content-scroll"]')?.className).toContain(
    'overflow-y-auto'
  );
  expect(container?.querySelector('[data-ui="settings.page.content-scroll"]')?.className).toContain(
    '[scrollbar-gutter:stable]'
  );
}

async function openPaletteFromHotkey() {
  const hotkeyArgs = settingsPageMocks.useCommandPaletteHotkeyMock.mock.calls[0]?.[0] as {
    onClose: () => void;
    onOpen: () => void;
  };

  await act(async () => {
    hotkeyArgs.onOpen();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  settingsPageMocks.loadSettingsMock.mockReset();
  settingsPageMocks.settingsCommandPaletteMock.mockReset();
  settingsPageMocks.settingsSidebarMock.mockReset();
  settingsPageMocks.useAppLocaleMock.mockReset();
  settingsPageMocks.useCommandPaletteHotkeyMock.mockReset();
  settingsPageMocks.useSettingsStoreMock.mockReturnValue({
    loadSettings: settingsPageMocks.loadSettingsMock,
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

describe('SettingsPage', () => {
  it('loads settings on mount, registers the command palette hotkey, and opens/closes the palette', async () => {
    await renderPage();

    expect(settingsPageMocks.loadSettingsMock).toHaveBeenCalledTimes(1);
    expect(settingsPageMocks.loadSettingsMock).toHaveBeenCalledWith();
    expect(settingsPageMocks.useAppLocaleMock).toHaveBeenCalledTimes(1);
    expect(container?.textContent).toContain('appearance-section');
    expectSettingsPageShell();

    await openPaletteFromHotkey();
    expect(container?.querySelector('[data-testid="settings-command-palette"]')).not.toBeNull();

    await act(async () => {
      clickButton('palette-close');
    });
    expect(container?.querySelector('[data-testid="settings-command-palette"]')).toBeNull();
  });
});

describe('SettingsPage navigation', () => {
  it('renders each settings tab surface through the owner sidebar and command palette', async () => {
    const settingsTabs: Array<[string, string]> = [
      ['ai', 'ai-section'],
      ['presets', 'presets-section'],
      ['saves', 'saves-section'],
      ['highlighter', 'highlighter-section'],
      ['image', 'image-section'],
      ['templates', 'templates-section'],
      ['quickactions', 'quickactions-section'],
      ['permissions', 'permissions-section'],
      ['appearance', 'appearance-section'],
    ];

    await renderPage();

    for (const [tab, marker] of settingsTabs) {
      await act(async () => {
        clickButton(tab);
      });
      expect(container?.querySelector('[data-ui="settings.loading.skeleton"]')).toBeNull();
      await flushLazySettingsSection();
      expect(container?.textContent).toContain(marker);
    }

    const hotkeyArgs = settingsPageMocks.useCommandPaletteHotkeyMock.mock.calls[0]?.[0] as {
      onOpen: () => void;
    };
    await act(async () => {
      hotkeyArgs.onOpen();
    });
    await act(async () => {
      clickButton('palette-quickactions');
    });
    await flushLazySettingsSection();

    expect(container?.textContent).toContain('quickactions-section');
  });
});
