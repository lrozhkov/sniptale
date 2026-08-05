// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  calloutController,
  highlighterContentPropsSpy,
  loadingStateSpy,
  stepBadgeController,
  useHighlighterSectionSpy,
} = vi.hoisted(() => ({
  calloutController: { catalog: null, isLoading: true },
  highlighterContentPropsSpy: vi.fn(),
  loadingStateSpy: vi.fn(),
  stepBadgeController: { catalog: null, isLoading: true },
  useHighlighterSectionSpy: vi.fn(),
}));

vi.mock('../callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../callout-presets')>()),
  useCalloutPresetCatalogController: () => calloutController,
}));

vi.mock('../step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../step-badge-presets')>()),
  useStepBadgePresetCatalogController: () => stepBadgeController,
}));

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
      status: {
        isLoading: true,
        settings: null,
      },
    });

    await renderSection();

    expect(loadingStateSpy).toHaveBeenCalledOnce();
    expect(highlighterContentPropsSpy).not.toHaveBeenCalled();
  });

  it('renders the translated error state when settings failed to load', async () => {
    useHighlighterSectionSpy.mockReturnValue({
      status: {
        isLoading: false,
        settings: null,
      },
    });

    await renderSection();

    expect(container?.textContent).toContain('common.states.error');
    expect(container?.textContent).toContain('highlighter.section.loadErrorSuffix');
  });

  it('renders content with the loaded settings state', async () => {
    const controller = {
      effects: { handleUpdateBlurSettings: vi.fn() },
      presets: { handleAddPreset: vi.fn() },
      status: {
        isLoading: false,
        settings: { enabled: true },
      },
    };

    useHighlighterSectionSpy.mockReturnValue(controller);

    await renderSection();

    expect(highlighterContentPropsSpy).toHaveBeenCalledWith({
      calloutPresets: calloutController,
      effects: controller.effects,
      presets: controller.presets,
      settings: controller.status.settings,
      stepBadgePresets: stepBadgeController,
    });
  });
});
