// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { controllerMock } = vi.hoisted(() => ({
  controllerMock: vi.fn(),
}));

vi.mock('./section/view-model', () => ({
  useAiProvidersSectionController: controllerMock,
}));

import { useAiProvidersSection } from './useAiProvidersSection';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestValue: ReturnType<typeof useAiProvidersSection> | null = null;

function renderHookHarness() {
  function Harness() {
    latestValue = useAiProvidersSection();
    return null;
  }

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestValue = null;
  controllerMock.mockReset();
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

function verifyUseAiProvidersSectionDelegation() {
  const value = { providers: [], models: [], isLoading: false };
  controllerMock.mockReturnValue(value);

  renderHookHarness();

  expect(controllerMock).toHaveBeenCalledTimes(1);
  expect(latestValue).toBe(value);
}

describe('useAiProvidersSection', () => {
  it(
    'delegates directly to the ai-providers section controller',
    verifyUseAiProvidersSectionDelegation
  );
});
