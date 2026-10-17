// @vitest-environment jsdom

import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorLayout } from '../../../../ui/compact-inspector-controls/layout';

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
      <CommandPressScope value={true}>
        <InspectorLayout>
          <AutoBlurBlurControls
            blurSettings={blurSettings}
            borderPresets={borderPresets}
            defaultBorderPresetId={DEFAULT_BORDER_PRESET.id}
            setBlurSettings={setBlurSettings}
          />
        </InspectorLayout>
      </CommandPressScope>
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
    await act(async () => {
      option?.click();
      await Promise.resolve();
    });

    expect(setBlurSettings).toHaveBeenCalledWith({
      amount: 12,
      blurType: 'distortion',
      showBorder: true,
      borderPresetId: selectedPreset.id,
    });
  });

  it('keeps choice names passive and activates the switch name once', async () => {
    const update = await renderControls();
    const names = [...container!.querySelectorAll<HTMLElement>('.sniptale-parameter-name')];
    const switchName = names.find((name) => name.textContent === 'content.autoBlur.showBorder')!;
    act(() => switchName.click());
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ amount: 12, blurType: 'distortion', showBorder: true });
    const typeName = names.find((name) => name.textContent === 'content.autoBlur.blurType')!;
    act(() => typeName.click());
    expect(document.body.querySelector('[role="option"]')).toBeNull();
    const choice = typeName
      .closest('.sniptale-parameter-row')!
      .querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
    expect(choice).not.toBeNull();
    act(() => choice.click());
    expect(document.body.querySelector('[role="option"]')).not.toBeNull();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
