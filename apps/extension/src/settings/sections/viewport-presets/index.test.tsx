// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { presetsSectionContentSpy, useViewportPresetsSectionSpy } = vi.hoisted(() => ({
  presetsSectionContentSpy: vi.fn(),
  useViewportPresetsSectionSpy: vi.fn(),
}));

vi.mock('./section-content', () => ({
  PresetsSectionContent: (props: unknown) => {
    presetsSectionContentSpy(props);
    return <div data-testid="presets-section-content" />;
  },
}));

vi.mock('./controller', () => ({
  useViewportPresetsSection: () => useViewportPresetsSectionSpy(),
}));

import { PresetsSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PresetsSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  presetsSectionContentSpy.mockReset();
  useViewportPresetsSectionSpy.mockReset();
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

it('forwards viewport section state into the presets content shell', async () => {
  const sectionState = {
    defaultViewportId: 'native',
    handleAddViewportPreset: vi.fn(),
    viewportPresets: [],
  };

  useViewportPresetsSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(presetsSectionContentSpy).toHaveBeenCalledWith(sectionState);
  expect(container?.querySelector('[data-testid="presets-section-content"]')).not.toBeNull();
});

it('forwards the editing viewport only when the controller exposes one', async () => {
  const editingViewport = { id: 'viewport-1', label: 'Tablet' };
  useViewportPresetsSectionSpy.mockReturnValue({
    defaultViewportId: 'native',
    editingViewport,
    handleAddViewportPreset: vi.fn(),
    viewportPresets: [],
  });

  await renderSection();

  expect(presetsSectionContentSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      editingViewport,
    })
  );
});
