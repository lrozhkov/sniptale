// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ commandPalette: vi.fn(), navigate: vi.fn() }));

vi.mock('../../../ui/command-palette', () => ({
  CommandPalette: (props: unknown) => {
    mocks.commandPalette(props);
    return <div data-testid="palette" />;
  },
}));
vi.mock('../../../platform/i18n/popup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n/popup')>()),
  translate: (key: string) => key,
}));
vi.mock('../navigation/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../navigation/actions')>()),
  openGallery: vi.fn(),
  openGithubRepository: vi.fn(),
  openImageEditor: vi.fn(),
  openScenarioEditor: vi.fn(),
  openSettings: vi.fn(),
  openVideoEditor: vi.fn(),
}));

it('builds navigation and utility actions only when the palette is opened', async () => {
  const { RouteFirstPopupCommandPalette } = await import('./route-first');
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <RouteFirstPopupCommandPalette page="home" onClose={vi.fn()} onNavigate={mocks.navigate} />
    )
  );
  const props = mocks.commandPalette.mock.calls[0]?.[0] as {
    actions: Array<{ id: string; onSelect(): void; subtitle: string }>;
  };
  expect(props.actions).toHaveLength(9);
  expect(props.actions[0]?.subtitle).toBe('shared.ui.commandPaletteCurrentPageHint');
  props.actions.find((action) => action.id === 'popup-page-video')?.onSelect();
  expect(mocks.navigate).toHaveBeenCalledWith('video');
  act(() => root.unmount());
});
