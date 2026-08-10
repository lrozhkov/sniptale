// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRepresentativeColor } from '@sniptale/foundation/paint';

const calls = vi.hoisted(() => ({
  calloutPreset: {
    content: { titleText: 'Preset title' },
    customized: true,
    enabled: true,
    id: 'callout-preset',
    name: 'Callout preset',
    order: 0,
    origin: 'system' as const,
    placement: { anchor: 'top-center' as const, side: 'top' as const },
    style: {},
  },
  calloutCreate: vi.fn(),
  calloutOpen: vi.fn(),
  calloutOverwrite: vi.fn(),
  calloutRefresh: vi.fn(),
  calloutReset: vi.fn(),
  calloutSave: vi.fn(),
  calloutToggle: vi.fn(),
  editorPresetEnabled: true,
  editorResetEnabled: true,
  frameApply: vi.fn(),
  frameApplyPatch: vi.fn(),
  frameCloseEditor: vi.fn(),
  frameEdit: vi.fn(),
  frameRefresh: vi.fn(),
  frameSave: vi.fn(),
  frameSelect: vi.fn(),
  frameToggle: vi.fn(),
  stepCreate: vi.fn(),
  stepFrameVisuals: vi.fn(),
  stepOpen: vi.fn(),
  stepRefresh: vi.fn(),
  stepReset: vi.fn(),
  stepSave: vi.fn(),
  stepToggle: vi.fn(),
  stepUpdate: vi.fn(),
  stepPreset: {
    customized: true,
    enabled: true,
    id: 'step-preset',
    name: 'Step preset',
    order: 0,
    origin: 'system' as const,
    settings: {
      anchor: 'top-left' as const,
      alphabet: 'latin' as const,
      auto: true,
      offsetDirections: [],
      style: {},
      type: 'number' as const,
      value: '1',
    },
  },
  framePreset: { id: 'frame-preset', name: 'Frame preset', width: 3 },
}));

vi.mock('./callout/body', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./callout/body')>()),
  CalloutSettingsPopoverContent: (props: Record<string, any>) => (
    <div>
      <button
        onClick={() => props['handleSettingChange']({ style: { surface: { borderWidth: 7 } } })}
      >
        patch
      </button>
      <button onClick={() => props['onApplyPreset'](props['presets'][0])}>apply</button>
      <button onClick={() => props['onForkPreset'](props['presets'][0])}>fork</button>
      <button onClick={() => props['onResetPreset'](props['presets'][0])}>reset</button>
      <button onClick={() => props['onShowPresets']()}>refresh</button>
      <button onClick={() => props['onTogglePreset'](props['presets'][0])}>toggle</button>
      <button onClick={() => props['handleDelete']()}>disable</button>
      <button data-ui="nested-surface-open" onClick={() => props['onNestedLayerChange']?.(true)}>
        nested-open
      </button>
      <button data-ui="nested-surface-close" onClick={() => props['onNestedLayerChange']?.(false)}>
        nested-close
      </button>
    </div>
  ),
}));
vi.mock('./callout/preset-controller', () => ({
  useCalloutPresetPopoverController: () => ({
    catalog: {
      create: calls.calloutCreate,
      error: null,
      isSaving: false,
      overwrite: calls.calloutOverwrite,
      pendingPresetIds: new Set(),
      presets: [calls.calloutPreset],
      refresh: calls.calloutRefresh,
      toggle: calls.calloutToggle,
      visiblePresets: [calls.calloutPreset],
    },
    editor: {
      close: vi.fn(),
      isOpen: true,
      isSaving: false,
      open: calls.calloutOpen,
      preset: calls.editorPresetEnabled
        ? {
            ...calls.calloutPreset,
            ...(calls.editorResetEnabled ? {} : { customized: false, origin: 'user' as const }),
          }
        : null,
      reset: calls.calloutReset,
      save: calls.calloutSave,
    },
  }),
}));
vi.mock('../../../ui/highlighter-preset-editor/callout', () => ({
  CalloutPresetEditor: (props: Record<string, any>) => (
    <button onClick={() => props['onReset']?.()}>callout-editor</button>
  ),
}));

vi.mock('./step-badge/body', () => ({
  StepBadgePopoverContent: (props: Record<string, any>) => {
    calls.stepFrameVisuals(props['frameVisuals']);
    return (
      <div>
        <button onClick={() => props['onAlphabetChange']('cyrillic')}>alphabet</button>
        <button onClick={() => props['onAnchorChange']('bottom-right')}>anchor</button>
        <button onClick={() => props['onApplyPreset'](props['presets'][0])}>apply</button>
        <button onClick={() => props['onAutoModeChange'](false)}>auto</button>
        <button onClick={() => props['onForkPreset'](props['presets'][0])}>fork</button>
        <button onClick={() => props['onOffsetToggle']('up')}>offset</button>
        <button onClick={() => props['onResetPreset'](props['presets'][0])}>reset</button>
        <button onClick={() => props['onSettingsChange']({ sizeLevel: 5 })}>settings</button>
        <button onClick={() => props['onShowPresets']()}>refresh</button>
        <button onClick={() => props['onTogglePreset'](props['presets'][0])}>toggle</button>
        <button onClick={() => props['onTypeChange']('letter')}>type</button>
        <button onClick={() => props['onValueChange']('A12')}>value</button>
        <button onClick={() => props['onDisable']()}>disable</button>
      </div>
    );
  },
}));
vi.mock('./step-badge/preset-controller', () => ({
  useStepBadgePresetPopoverController: () => ({
    catalog: {
      create: calls.stepCreate,
      error: null,
      pending: new Set(),
      refresh: calls.stepRefresh,
      reset: calls.stepReset,
      toggle: calls.stepToggle,
      update: calls.stepUpdate,
      visiblePresets: [calls.stepPreset],
    },
    editor: {
      close: vi.fn(),
      isOpen: true,
      isSaving: false,
      open: calls.stepOpen,
      preset: calls.editorPresetEnabled
        ? {
            ...calls.stepPreset,
            ...(calls.editorResetEnabled ? {} : { customized: false, origin: 'user' as const }),
          }
        : null,
      reset: calls.stepReset,
      save: calls.stepSave,
    },
  }),
}));
vi.mock('../../../ui/highlighter-preset-editor/step-badge', () => ({
  StepBadgePresetEditor: (props: Record<string, any>) => (
    <button onClick={() => props['onReset']?.()}>step-editor</button>
  ),
}));

vi.mock('./frame/views', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./frame/views')>()),
  FrameSettingsPopoverContent: (props: Record<string, any>) => (
    <div>
      <button onClick={() => props['handleBlurChange'](10)}>blur</button>
      <button onClick={() => props['handleBlurShowBorderChange'](false)}>blur-border</button>
      <button onClick={() => props['handleBlurTypeChange']('pixelate')}>blur-type</button>
      <button onClick={() => props['handleForkPreset'](calls.framePreset)}>fork</button>
      <button onClick={() => props['handleFocusChange'](0.4)}>focus</button>
      <button onClick={() => props['handleFocusBlurChange'](8)}>focus-blur</button>
      <button onClick={() => props['handleFocusShowBorderChange'](false)}>focus-border</button>
      <button onClick={() => props['handleManualBorderChange']({ width: 5 })}>manual</button>
      <button onClick={() => props['handleSelectPreset'](calls.framePreset)}>select</button>
      <button onClick={() => props['handleTogglePresetEnabled'](calls.framePreset)}>toggle</button>
      <button onClick={() => props['manual'].onCssDraftChange('[frame]{color:red}')}>css</button>
      <button onClick={() => props['onEffectModeChange']('focus')}>mode</button>
      <button onClick={() => props['onShowPresets']()}>refresh</button>
    </div>
  ),
}));
vi.mock('./frame/popover-state', () => ({
  useFrameCreationPopoverState: () => ({
    border: {
      apply: calls.frameApply,
      applyPatch: calls.frameApplyPatch,
      forkPreset: calls.frameSelect,
      selectPreset: calls.frameSelect,
    },
    catalog: {
      pendingPresetIds: new Set(),
      refresh: calls.frameRefresh,
      settings: {},
      togglePresetEnabled: calls.frameToggle,
    },
    css: { draft: '', setDraft: vi.fn() },
    presetEditor: {
      editingPreset: undefined,
      isOpen: false,
      saveEdited: calls.frameSave,
      setEditingPreset: calls.frameEdit,
      setOpen: calls.frameCloseEditor,
    },
    presetSaving: { isSaving: false, save: vi.fn() },
  }),
}));
vi.mock('../../../ui/highlighter-preset-editor', () => ({
  BorderPresetEditor: (props: Record<string, any>) => (
    <button onClick={() => props['onClose']()}>frame-editor</button>
  ),
}));

import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { createDefaultHighlighterSettings } from '../../features/highlighter/style/defaults';
import { FutureCalloutSettingsPopover } from './callout/popover';
import { FrameCreationPopovers } from './creation-popovers';
import { FrameAnnotationCreationFramePopover } from './frame/popover';
import { FutureStepBadgeSettingsPopover } from './step-badge/popover';

let root: Root;
let host: HTMLDivElement;
let anchor: HTMLButtonElement;
let portal: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  portal = document.createElement('div');
  anchor = document.createElement('button');
  document.body.append(host, anchor, portal);
  root = createRoot(host);
  calls.editorPresetEnabled = true;
  calls.editorResetEnabled = true;
});

it('does not open persistent preset editors from the inline settings surfaces', async () => {
  const renderPopovers = () => (
    <>
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        portalTarget={portal}
        settings={createDefaultFrameCallout()}
      />
      <FutureStepBadgeSettingsPopover
        anchorEl={anchor}
        frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDisable={vi.fn()}
        portalTarget={portal}
        settings={createDefaultFrameStepBadge()}
      />
    </>
  );

  calls.editorPresetEnabled = false;
  await act(async () => root.render(renderPopovers()));
  expect(portal.querySelectorAll('.sniptale-modal')).toHaveLength(0);

  calls.editorPresetEnabled = true;
  calls.editorResetEnabled = false;
  await act(async () => root.render(renderPopovers()));
  expect(portal.querySelectorAll('.sniptale-modal')).toHaveLength(0);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('keeps parent Escape dismissal disabled until the nested Surface layer closes', async () => {
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <FutureCalloutSettingsPopover
        anchorEl={anchor}
        isOpen
        onChange={vi.fn()}
        onClose={onClose}
        onDisable={vi.fn()}
        portalTarget={portal}
        settings={createDefaultFrameCallout()}
      />
    )
  );
  await act(async () =>
    portal.querySelector<HTMLButtonElement>('[data-ui="nested-surface-open"]')!.click()
  );
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(onClose).not.toHaveBeenCalled();
  await act(async () =>
    portal.querySelector<HTMLButtonElement>('[data-ui="nested-surface-close"]')!.click()
  );
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it('clears nested Surface dismissal suppression when the parent closes and reopens', async () => {
  const onClose = vi.fn();
  const renderPopover = (isOpen: boolean) => (
    <FutureCalloutSettingsPopover
      anchorEl={anchor}
      isOpen={isOpen}
      onChange={vi.fn()}
      onClose={onClose}
      onDisable={vi.fn()}
      portalTarget={portal}
      settings={createDefaultFrameCallout()}
    />
  );
  await act(async () => root.render(renderPopover(true)));
  await act(async () =>
    portal.querySelector<HTMLButtonElement>('[data-ui="nested-surface-open"]')!.click()
  );
  await act(async () => root.render(renderPopover(false)));
  await act(async () => root.render(renderPopover(true)));
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(onClose).toHaveBeenCalledOnce();
});

it('wires every callout and numbering mutation through the shared popover owners', async () => {
  const onCalloutChange = vi.fn();
  const onStepChange = vi.fn();
  await act(async () =>
    root.render(
      <>
        <FutureCalloutSettingsPopover
          anchorEl={anchor}
          isOpen
          onChange={onCalloutChange}
          onClose={vi.fn()}
          onDisable={vi.fn()}
          portalTarget={portal}
          settings={createDefaultFrameCallout()}
        />
        <FutureStepBadgeSettingsPopover
          anchorEl={anchor}
          frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
          isOpen
          onChange={onStepChange}
          onClose={vi.fn()}
          onDisable={vi.fn()}
          portalTarget={portal}
          settings={{ ...createDefaultFrameStepBadge(), auto: false }}
        />
      </>
    )
  );
  const editors = portal.querySelectorAll<HTMLElement>('.sniptale-modal');
  expect(editors).toHaveLength(0);
  await act(async () => {
    portal
      .querySelectorAll<HTMLButtonElement>('.sniptale-callout-settings-popover button')
      .forEach((button) => button.click());
    await Promise.resolve();
  });
  expect(onCalloutChange).toHaveBeenCalled();
  expect(calls.calloutReset).toHaveBeenCalled();
  expect(calls.calloutRefresh).toHaveBeenCalled();
  expect(calls.calloutToggle).toHaveBeenCalled();
  expect(onStepChange).toHaveBeenCalled();
  expect(calls.stepRefresh).toHaveBeenCalled();
  expect(calls.stepToggle).toHaveBeenCalled();
});

it('wires every frame effect and preset command through the shared frame popover', () => {
  const settings = createDefaultHighlighterSettings();
  act(() =>
    root.render(
      <FrameAnnotationCreationFramePopover
        anchorEl={anchor}
        isOpen
        onChange={vi.fn()}
        onClose={vi.fn()}
        settings={{
          blurSettings: settings.defaultBlurSettings,
          borderSettings: settings.borderPresets[0]!,
          effectMode: settings.defaultEffectMode,
          focusSettings: settings.defaultFocusSettings,
        }}
      />
    )
  );
  act(() =>
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click())
  );
  expect(calls.frameApply).toHaveBeenCalled();
  expect(calls.frameApplyPatch).toHaveBeenCalled();
  expect(calls.frameSelect).toHaveBeenCalled();
  expect(calls.frameToggle).toHaveBeenCalled();
  expect(calls.frameRefresh).toHaveBeenCalled();
});

it('projects creation settings into the three shared popovers and supports an injected frame host', () => {
  const highlighter = createDefaultHighlighterSettings();
  const update = vi.fn();
  const close = vi.fn();
  const renderFramePopover = vi.fn((args: Record<string, any>) => (
    <button data-custom-frame-popover="true" onClick={() => args['onChange'](args['settings'])}>
      frame
    </button>
  ));
  const ref = { current: anchor };
  const settings = {
    blurSettings: highlighter.defaultBlurSettings,
    borderSettings: highlighter.borderPresets[0]!,
    callout: createDefaultFrameCallout(),
    effectMode: highlighter.defaultEffectMode,
    focusSettings: highlighter.defaultFocusSettings,
    stepBadge: createDefaultFrameStepBadge(),
  };
  act(() =>
    root.render(
      <FrameCreationPopovers
        activeMenu="callout"
        calloutRef={ref}
        close={close}
        frameRef={ref}
        renderFramePopover={renderFramePopover}
        settings={settings}
        showCallout
        showStepBadge
        stepBadgeRef={ref}
        update={update}
      />
    )
  );
  expect(renderFramePopover).toHaveBeenCalledWith(expect.objectContaining({ isOpen: false }));
  expect(document.querySelector('[data-custom-frame-popover="true"]')).not.toBeNull();
  act(() =>
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click())
  );
  expect(update).toHaveBeenCalled();

  act(() =>
    root.render(
      <FrameCreationPopovers
        activeMenu="step-badge"
        calloutRef={ref}
        close={close}
        frameRef={ref}
        renderFramePopover={renderFramePopover}
        settings={settings}
        showCallout
        showStepBadge
        stepBadgeRef={ref}
        update={update}
      />
    )
  );
  act(() =>
    document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click())
  );
  expect(update).toHaveBeenCalledWith({ stepBadge: null });
  expect(calls.stepFrameVisuals).toHaveBeenLastCalledWith({
    borderColor: settings.borderSettings.color,
    borderWidth: settings.borderSettings.width,
    fillColor: getRepresentativeColor(settings.borderSettings.fillPaint),
  });

  act(() =>
    root.render(
      <FrameCreationPopovers
        activeMenu={null}
        calloutRef={ref}
        close={close}
        frameRef={ref}
        settings={{ ...settings, callout: null, stepBadge: null }}
        showCallout={false}
        showStepBadge={false}
        stepBadgeRef={ref}
        update={update}
      />
    )
  );
  expect(document.querySelector('[data-custom-frame-popover="true"]')).toBeNull();
});
