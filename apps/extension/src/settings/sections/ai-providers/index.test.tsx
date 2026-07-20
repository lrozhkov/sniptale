// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const aiProvidersSectionMocks = vi.hoisted(() => ({
  contentMock: vi.fn(),
  loadingStateMock: vi.fn(),
  useAiProvidersSectionMock: vi.fn(),
}));

vi.mock('./controller/useAiProvidersSection', () => ({
  useAiProvidersSection: () => aiProvidersSectionMocks.useAiProvidersSectionMock(),
}));

vi.mock('./surface/content', () => ({
  AIProvidersSectionContent: (props: unknown) => {
    aiProvidersSectionMocks.contentMock(props);
    return <div data-testid="ai-providers-content">content</div>;
  },
}));

vi.mock('../../section-surface/loading-state', () => ({
  DelayedSettingsCardLoadingState: () => <div data-testid="settings-card-loading">loading</div>,
  DelayedSettingsCenteredLoadingState: () => {
    aiProvidersSectionMocks.loadingStateMock();
    return <div data-testid="settings-loading">loading</div>;
  },
  SettingsCardLoadingState: () => <div data-testid="settings-card-loading">loading</div>,
  SettingsCenteredLoadingState: () => <div data-testid="settings-loading">loading</div>,
}));

import { AIProvidersSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<AIProvidersSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  aiProvidersSectionMocks.contentMock.mockReset();
  aiProvidersSectionMocks.loadingStateMock.mockReset();
  aiProvidersSectionMocks.useAiProvidersSectionMock.mockReset();
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

it('renders the loading owner state when ai providers data is still loading', async () => {
  aiProvidersSectionMocks.useAiProvidersSectionMock.mockReturnValue({
    isLoading: true,
  });

  await renderSection();

  expect(container?.textContent).toContain('loading');
  expect(aiProvidersSectionMocks.loadingStateMock).toHaveBeenCalledTimes(1);
  expect(aiProvidersSectionMocks.contentMock).not.toHaveBeenCalled();
});

it('renders the content owner state once ai providers data is ready', async () => {
  const state = {
    isLoading: false,
    providers: [],
  };
  aiProvidersSectionMocks.useAiProvidersSectionMock.mockReturnValue(state);

  await renderSection();

  expect(container?.textContent).toContain('content');
  expect(aiProvidersSectionMocks.contentMock).toHaveBeenCalledWith(
    expect.objectContaining({
      state,
    })
  );
});
