// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommandPaletteProps } from '../../../ui/command-palette/types';

const mocks = vi.hoisted(() => ({
  commandPaletteMock: vi.fn(),
  translateMock: vi.fn((key: string) => `t:${key}`),
}));

vi.mock('../../../ui/command-palette', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../ui/command-palette')>()),
  CommandPalette: (props: CommandPaletteProps) => {
    mocks.commandPaletteMock(props);
    return <div data-testid="palette">palette</div>;
  },
}));

vi.mock('../navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation')>()),
  SettingsTab: undefined,
  SETTINGS_NAV_ITEMS: [
    {
      id: 'appearance',
      icon: () => <svg data-testid="appearance-icon" />,
      label: 'settings.appearance',
    },
    {
      id: 'templates',
      icon: () => <svg data-testid="templates-icon" />,
      label: 'settings.templates',
    },
  ],
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

import { SettingsCommandPalette } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('SettingsCommandPalette', () => {
  it('builds actions for each navigation item and marks the active tab', () => {
    const onClose = vi.fn();
    const onTabChange = vi.fn();

    render(
      <SettingsCommandPalette
        isOpen
        activeTab="appearance"
        onClose={onClose}
        onTabChange={onTabChange}
      />
    );

    const paletteProps = mocks.commandPaletteMock.mock.calls[0]?.[0];
    expect(paletteProps.storageKey).toBe('sniptale.settings.command-palette');
    expect(paletteProps.actions).toHaveLength(2);
    expect(paletteProps.actions[0]).toEqual(
      expect.objectContaining({
        id: 'settings-appearance',
        subtitle: 't:shared.ui.commandPaletteCurrentContextHint',
        title: 't:settings.appearance',
      })
    );
    expect(paletteProps.actions[1]).toEqual(
      expect.objectContaining({
        id: 'settings-templates',
        subtitle: 't:shared.ui.commandPaletteNavigationHint',
        title: 't:settings.templates',
      })
    );

    paletteProps.actions[1].onSelect();
    expect(onTabChange).toHaveBeenCalledWith('templates');
  });
});
