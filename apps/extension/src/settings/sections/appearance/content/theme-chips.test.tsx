// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAppearanceThemeOptions } from '../copy';
import { ThemeChips } from './theme-chips';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState() {
  return {
    locale: 'ru',
    preference: 'system',
    resolvedTheme: 'light',
    setPreference: vi.fn(),
    themeOptions: buildAppearanceThemeOptions('ru'),
  };
}

async function renderWithState(state: ReturnType<typeof createState>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ThemeChips state={state as never} />);
  });
}

describe('ThemeChips', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it('renders the theme mode tiles and forwards selection changes', async () => {
    const state = createState();

    await renderWithState(state);

    expect(container?.textContent).toContain(state.themeOptions[0].label);
    expect(container?.textContent).toContain(state.themeOptions[1].label);
    expect(container?.textContent).toContain(state.themeOptions[2].label);

    const lightButton = container?.querySelector('button:nth-of-type(2)') as HTMLButtonElement;
    expect(lightButton).toBeTruthy();

    await act(async () => {
      lightButton.click();
    });

    expect(state.setPreference).toHaveBeenCalledWith('light');
  });
});
