// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { highlighterContentPropsSpy, loadingStateSpy, useHighlighterSectionSpy } = vi.hoisted(
  () => ({
    highlighterContentPropsSpy: vi.fn(),
    loadingStateSpy: vi.fn(),
    useHighlighterSectionSpy: vi.fn(),
  })
);

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../section-surface/loading-state', async (importOriginal) => ({
  ...(await importOriginal()),
  DelayedSettingsCenteredLoadingState: () => {
    loadingStateSpy();
    return <div data-testid="settings-loading-state">loading</div>;
  },
}));

vi.mock('./content', () => ({
  HighlighterSectionContent: (props: unknown) => {
    highlighterContentPropsSpy(props);
    return <div data-testid="highlighter-section-content">content</div>;
  },
}));

vi.mock('./useHighlighterSection', async (importOriginal) => ({
  ...(await importOriginal()),
  useHighlighterSection: () => useHighlighterSectionSpy(),
}));

import { HighlighterSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  highlighterContentPropsSpy.mockReset();
  loadingStateSpy.mockReset();
  useHighlighterSectionSpy.mockReset();
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

describe('HighlighterSection', () => {
  it('renders the loading state while the section is still initializing', async () => {
    useHighlighterSectionSpy.mockReturnValue({
      isLoading: true,
      settings: null,
    });

    await renderSection();

    expect(loadingStateSpy).toHaveBeenCalledOnce();
    expect(highlighterContentPropsSpy).not.toHaveBeenCalled();
  });

  it('renders the translated error state when settings failed to load', async () => {
    useHighlighterSectionSpy.mockReturnValue({
      isLoading: false,
      settings: null,
    });

    await renderSection();

    expect(container?.textContent).toContain('common.states.error');
    expect(container?.textContent).toContain('highlighter.section.loadErrorSuffix');
  });

  it('renders content with the loaded settings state', async () => {
    const state = {
      isLoading: false,
      settings: { enabled: true },
    };

    useHighlighterSectionSpy.mockReturnValue(state);

    await renderSection();

    expect(highlighterContentPropsSpy).toHaveBeenCalledWith({
      settings: state.settings,
      state,
    });
  });
});
