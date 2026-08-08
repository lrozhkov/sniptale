// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createSystemBorderPresetCatalog } from '../../../../features/highlighter/presets/catalog';
import { AutoBlurBlurControls } from './controls';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createBlurSettings(overrides: Partial<BlurSettings> = {}): BlurSettings {
  return { amount: 12, blurType: 'distortion', showBorder: false, ...overrides };
}

async function renderControls(
  blurSettings = createBlurSettings(),
  setBlurSettings = vi.fn<(settings: BlurSettings) => void>(),
  borderPresets = [DEFAULT_BORDER_PRESET]
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AutoBlurBlurControls
        blurSettings={blurSettings}
        borderPresets={borderPresets}
        defaultBorderPresetId={DEFAULT_BORDER_PRESET.id}
        setBlurSettings={setBlurSettings}
      />
    );
  });
  return setBlurSettings;
}

describe('auto-blur-modal/controls', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it('uses compact blur controls and keeps the frame template available without decoration', async () => {
    const setBlurSettings = await renderControls();
    const typeSelect = container?.querySelector<HTMLButtonElement>(
      '[aria-label="content.autoBlur.blurType"]'
    );
    const templateSelect = container?.querySelector<HTMLButtonElement>(
      '[aria-label="content.autoBlur.frameTemplate"]'
    );
    const frameSwitch = container?.querySelector<HTMLButtonElement>(
      '[aria-label="content.autoBlur.showBorder"]'
    );

    expect(typeSelect).toBeTruthy();
    expect(templateSelect?.disabled).toBe(false);
    act(() => frameSwitch?.click());
    expect(setBlurSettings).toHaveBeenCalledWith({
      amount: 12,
      blurType: 'distortion',
      showBorder: true,
    });
  });

  it('stores a selected frame template in the existing blur settings contract', async () => {
    const presets = createSystemBorderPresetCatalog().slice(0, 2);
    const selectedPreset = presets[1]!;
    const setBlurSettings = await renderControls(
      createBlurSettings({ showBorder: true }),
      vi.fn(),
      presets
    );
    const templateSelect = container?.querySelector<HTMLButtonElement>(
      '[aria-label="content.autoBlur.frameTemplate"]'
    );
    act(() => templateSelect?.click());
    const option = document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')[1];
    act(() => option?.click());

    expect(setBlurSettings).toHaveBeenCalledWith({
      amount: 12,
      blurType: 'distortion',
      showBorder: true,
      borderPresetId: selectedPreset.id,
    });
  });
});
