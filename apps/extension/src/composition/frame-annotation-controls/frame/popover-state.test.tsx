// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  load: vi.fn(),
  setEnabled: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../../persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../persistence/highlighter')>()),
  addBorderPresetWithOutcome: mocks.add,
  loadHighlighterSettings: mocks.load,
  setBorderPresetEnabled: mocks.setEnabled,
  updateBorderPresetWithOutcome: mocks.update,
}));

import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { useFrameCreationPopoverState } from './popover-state';
import { FrameAnnotationCreationFramePopover } from './popover';
import type { FrameAnnotationStyleSettings } from '../contracts';
import { translate } from '../../../platform/i18n';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ReturnType<typeof useFrameCreationPopoverState> | null = null;
let onChange = vi.fn();
let settings: FrameAnnotationStyleSettings;

function Harness() {
  latest = useFrameCreationPopoverState({ isOpen: true, onChange, settings });
  return null;
}

beforeEach(() => {
  const defaults = createDefaultHighlighterSettings();
  settings = {
    blurSettings: defaults.defaultBlurSettings,
    borderSettings: projectBorderPresetToAppliedSettings(defaults.borderPresets[0]!),
    effectMode: defaults.defaultEffectMode,
    focusSettings: defaults.defaultFocusSettings,
  };
  mocks.add.mockReset().mockResolvedValue('applied');
  mocks.load.mockReset().mockResolvedValue(defaults);
  mocks.setEnabled.mockReset().mockResolvedValue(undefined);
  mocks.update.mockReset().mockResolvedValue('applied');
  onChange = vi.fn();
  latest = null;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

it('owns frame preset selection, manual effects, visibility, create and edit mutations', async () => {
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.settings.borderPresets[0];
  expect(preset).toBeDefined();

  act(() => {
    latest?.border.apply({ effectMode: 'focus' });
    latest?.border.applyPatch({
      color: '#123456',
      effects: {
        blur: { amount: 7, blurType: 'pixelate' },
        focus: { blurAmount: 4, opacity: 0.25 },
        capture: { hideFrame: true },
      },
    });
    if (preset) latest?.border.selectPreset(preset);
    latest?.css.setDraft('border-radius: 4px');
    if (preset) latest?.presetEditor.setEditingPreset(preset);
    latest?.presetEditor.setOpen(true);
  });
  expect(onChange).toHaveBeenCalled();
  expect(latest?.css.draft).toBe('border-radius: 4px');

  await act(async () => preset && latest?.catalog.togglePresetEnabled(preset));
  expect(mocks.setEnabled).toHaveBeenCalledWith(preset?.id, false);

  await act(async () => {
    await latest?.presetSaving.save({ name: 'Saved frame' });
    if (preset) await latest?.presetSaving.save({ overwrite: preset });
    if (preset) await latest?.presetEditor.saveEdited({ ...preset, name: 'Edited frame' });
  });
  expect(mocks.add).toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(latest?.presetEditor.isOpen).toBe(false);
});

it('persists the current blur and focus effects when creating or overwriting a template', async () => {
  const defaults = createDefaultHighlighterSettings();
  const overwrite = defaults.borderPresets[0]!;
  settings = {
    ...settings,
    blurSettings: { ...settings.blurSettings, amount: 23, blurType: 'distortion' },
    focusSettings: { ...settings.focusSettings, blurAmount: 8, opacity: 0.31 },
    borderSettings: {
      ...settings.borderSettings,
      effects: {
        ...settings.borderSettings.effects!,
        blur: { amount: 2, blurType: 'gaussian' },
        focus: { blurAmount: 1, opacity: 0.9 },
      },
    },
  };
  await act(async () => root?.render(<Harness />));

  await act(async () => {
    await latest?.presetSaving.save({ name: 'Effects copy' });
    await latest?.presetSaving.save({ overwrite });
  });

  const expectedEffects = expect.objectContaining({
    blur: { amount: 23, blurType: 'distortion' },
    focus: { blurAmount: 8, opacity: 0.31 },
  });
  expect(mocks.add).toHaveBeenCalledWith(expect.objectContaining({ effects: expectedEffects }));
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({ id: overwrite.id, effects: expectedEffects })
  );
});

it('wires the focus blur control into creation settings', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  settings = { ...settings, effectMode: 'focus' };

  await act(async () =>
    root?.render(
      <FrameAnnotationCreationFramePopover
        anchorEl={anchor}
        isOpen
        onChange={onChange}
        onClose={vi.fn()}
        settings={settings}
      />
    )
  );
  const blurLabel = translate('content.overlayControls.focusBlurLabel');
  const increase = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${blurLabel} increase"]`
  );

  expect(increase).not.toBeNull();
  act(() => increase?.dispatchEvent(new Event('pointerdown', { bubbles: true })));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      focusSettings: expect.objectContaining({ blurAmount: 1 }),
    })
  );

  const dimmingLabel = translate('content.overlayControls.focusDimmingLabelPrefix');
  const dimmingIncrease = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${dimmingLabel} increase"]`
  );
  const decorationToggle = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${translate('content.overlayControls.showBorderTitle')}"]`
  );
  act(() => {
    dimmingIncrease?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    decorationToggle?.click();
  });

  expect(dimmingIncrease).not.toBeNull();
  expect(decorationToggle).not.toBeNull();

  anchor.remove();
});

it('keeps rejected frame preset mutations atomic and clears pending state', async () => {
  mocks.add.mockResolvedValueOnce('rejected');
  mocks.update.mockResolvedValue('rejected');
  await act(async () => root?.render(<Harness />));
  const preset = latest?.catalog.settings.borderPresets[0];

  await act(async () => {
    expect(await latest?.presetSaving.save({ name: 'Rejected' })).toBe(false);
    if (preset) await latest?.presetEditor.saveEdited(preset);
  });

  expect(latest?.presetSaving.isSaving).toBe(false);
});

it('hides presets disabled before opening while retaining in-session visibility', async () => {
  const defaults = createDefaultHighlighterSettings();
  const enabled = defaults.borderPresets[0]!;
  const disabled = { ...enabled, id: 'disabled-before-open', enabled: false };
  mocks.load.mockResolvedValue({ ...defaults, borderPresets: [enabled, disabled] });
  await act(async () => root?.render(<Harness />));
  expect(latest?.catalog.settings.borderPresets.map((preset) => preset.id)).toEqual([enabled.id]);

  mocks.load.mockResolvedValue({
    ...defaults,
    borderPresets: [{ ...enabled, enabled: false }, disabled],
  });
  await act(async () => latest?.catalog.togglePresetEnabled(enabled));
  expect(latest?.catalog.settings.borderPresets.map((preset) => preset.id)).toEqual([enabled.id]);
});
