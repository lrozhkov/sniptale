// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { appearanceSectionContentSpy, useAppearanceSectionSpy } = vi.hoisted(() => ({
  appearanceSectionContentSpy: vi.fn(),
  useAppearanceSectionSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  AppearanceSectionContent: (props: unknown) => {
    appearanceSectionContentSpy(props);
    return <div data-testid="appearance-section-content" />;
  },
}));

vi.mock('./controller', () => ({
  useAppearanceSection: () => useAppearanceSectionSpy(),
}));

import { AppearanceSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AppearanceSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  appearanceSectionContentSpy.mockReset();
  useAppearanceSectionSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards appearance section state into the appearance content shell', async () => {
  const sectionState = {
    contextMenu: { enabled: true },
    contextMenuOptions: [],
    languagePreference: 'ru',
    locale: 'ru',
    localeOptions: [],
    preference: 'system',
    resolvedTheme: 'light',
    setLanguagePreference: vi.fn(),
    setPreference: vi.fn(),
    themeOptions: [],
    updateContextMenu: vi.fn(async () => undefined),
  };

  useAppearanceSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(appearanceSectionContentSpy).toHaveBeenCalledWith({ state: sectionState });
  expect(container?.querySelector('[data-testid="appearance-section-content"]')).not.toBeNull();
});
