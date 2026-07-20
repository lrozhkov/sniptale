// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { imageSettingsContentSpy, useImageSettingsSectionSpy } = vi.hoisted(() => ({
  imageSettingsContentSpy: vi.fn(),
  useImageSettingsSectionSpy: vi.fn(),
}));

vi.mock('./content', () => ({
  ImageSettingsSectionContent: (props: unknown) => {
    imageSettingsContentSpy(props);
    return <div data-testid="image-settings-section-content" />;
  },
}));

vi.mock('./controller', () => ({
  useImageSettingsSection: () => useImageSettingsSectionSpy(),
}));

import { ImageSettingsSection } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSection() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ImageSettingsSection />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  imageSettingsContentSpy.mockReset();
  useImageSettingsSectionSpy.mockReset();
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

it('forwards image settings state into the image content shell', async () => {
  const sectionState = {
    imageFormat: 'png',
    imageQuality: 100,
    isLoading: false,
    isQualityDisabled: true,
    handleFormatChange: vi.fn(async () => undefined),
    handleQualityChange: vi.fn(async () => undefined),
  };

  useImageSettingsSectionSpy.mockReturnValue(sectionState);

  await renderSection();

  expect(imageSettingsContentSpy).toHaveBeenCalledWith({ state: sectionState });
  expect(container?.querySelector('[data-testid="image-settings-section-content"]')).not.toBeNull();
});
