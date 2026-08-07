// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  applyPatch: vi.fn(),
  captured: { current: null as Record<string, unknown> | null },
  refresh: vi.fn(),
  forkPreset: vi.fn(),
  selectPreset: vi.fn(),
  setEditingPreset: vi.fn(),
  setEditorOpen: vi.fn(),
  togglePresetEnabled: vi.fn(),
}));

vi.mock('@sniptale/ui/content-popover-adapter', () => ({
  ContentPopoverAdapter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../popover/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../popover/hooks')>()),
  usePopoverDistanceClose: vi.fn(),
  usePopoverEscapeClose: vi.fn(),
}));
vi.mock('../popover/presentation', () => ({
  useFrameAnnotationPopoverPresentation: () => ({ style: {} }),
}));
vi.mock('../../../ui/highlighter-preset-editor', () => ({ BorderPresetEditor: () => null }));
vi.mock('./views', () => ({
  FrameSettingsPopoverContent: (props: Record<string, unknown>) => {
    mocks.captured.current = props;
    return null;
  },
}));
vi.mock('./popover-state', () => ({
  useFrameCreationPopoverState: () => ({
    border: {
      apply: mocks.apply,
      applyPatch: mocks.applyPatch,
      forkPreset: mocks.forkPreset,
      selectPreset: mocks.selectPreset,
    },
    catalog: {
      pendingPresetIds: new Set(),
      refresh: mocks.refresh,
      settings: {},
      togglePresetEnabled: mocks.togglePresetEnabled,
    },
    css: { draft: '', setDraft: vi.fn() },
    presetEditor: {
      editingPreset: null,
      isOpen: false,
      saveEdited: vi.fn(),
      setEditingPreset: mocks.setEditingPreset,
      setOpen: mocks.setEditorOpen,
    },
    presetSaving: { isSaving: false, save: vi.fn() },
  }),
}));

import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { FrameAnnotationCreationFramePopover } from './popover';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  mocks.captured.current = null;
});

function callCaptured(name: string, ...args: unknown[]) {
  const callback = mocks.captured.current?.[name];
  expect(callback).toBeTypeOf('function');
  (callback as (...values: unknown[]) => void)(...args);
}

it('wires every frame effect callback, including focus blur, through the creation owner', () => {
  const defaults = createDefaultHighlighterSettings();
  const preset = defaults.borderPresets[0]!;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() =>
    root.render(
      <FrameAnnotationCreationFramePopover
        anchorEl={host}
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        settings={{
          blurSettings: defaults.defaultBlurSettings,
          borderSettings: projectBorderPresetToAppliedSettings(preset),
          effectMode: 'focus',
          focusSettings: defaults.defaultFocusSettings,
        }}
      />
    )
  );

  callCaptured('handleBlurChange', 8);
  callCaptured('handleBlurShowBorderChange', false);
  callCaptured('handleBlurTypeChange', 'pixelate');
  callCaptured('handleForkPreset', preset);
  callCaptured('handleFocusChange', 0.25);
  callCaptured('handleFocusBlurChange', 12);
  callCaptured('handleFocusShowBorderChange', false);
  callCaptured('onEffectModeChange', 'focus');
  const manual = mocks.captured.current?.['manual'] as Record<string, unknown>;
  const onCssDraftChange = manual['onCssDraftChange'];
  expect(onCssDraftChange).toBeTypeOf('function');
  (onCssDraftChange as (value: string) => void)('border-radius: 2px');

  expect(mocks.apply).toHaveBeenCalledWith({
    focusSettings: { ...defaults.defaultFocusSettings, blurAmount: 12 },
  });
  expect(mocks.apply).toHaveBeenCalledTimes(7);
  expect(mocks.forkPreset).toHaveBeenCalledWith(preset);

  act(() => root.unmount());
});
