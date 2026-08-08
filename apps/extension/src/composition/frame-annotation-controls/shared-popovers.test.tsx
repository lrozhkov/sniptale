// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  addBorder: vi.fn(),
  loadHighlighter: vi.fn(),
  setBorderEnabled: vi.fn(),
  createStep: vi.fn(),
  subscribeCallout: vi.fn(() => () => undefined),
  subscribeStep: vi.fn(() => () => undefined),
  updateBorder: vi.fn(),
}));

vi.mock('../persistence/callout-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/callout-presets')>()),
  loadCalloutPresetCatalog: async () => ({
    catalogCustomized: false,
    defaultPresetId: 'system-callout-bubble',
    presets: [],
    systemCatalogRevision: 1,
  }),
  subscribeToCalloutPresetCatalog: persistence.subscribeCallout,
}));
vi.mock('../persistence/step-badge-presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/step-badge-presets')>()),
  loadStepBadgePresetCatalog: async () => ({
    catalogCustomized: false,
    defaultPresetId: 'system-step-badge-default',
    presets: [],
    systemCatalogRevision: 1,
  }),
  createUserStepBadgePreset: persistence.createStep,
  subscribeToStepBadgePresetCatalog: persistence.subscribeStep,
}));
vi.mock('../persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../persistence/highlighter')>()),
  addBorderPresetWithOutcome: persistence.addBorder,
  loadHighlighterSettings: persistence.loadHighlighter,
  setBorderPresetEnabled: persistence.setBorderEnabled,
  updateBorderPresetWithOutcome: persistence.updateBorder,
}));

import {
  createDefaultFrameCallout,
  createDefaultFrameStepBadge,
} from '../../features/highlighter/frame-annotation/defaults';
import { DEFAULT_STEP_BADGE_TEMPLATE } from '../../features/highlighter/step-badge-presets/catalog';
import { FutureCalloutSettingsPopover } from './callout/popover';
import { createCalloutSaveSection } from './callout/save-section';
import { FrameAnnotationCreationFramePopover } from './frame/popover';
import { getAnchorDotPosition, DEFAULT_POPOVER_ANCHOR_GRID } from './popover/anchor-grid';
import { SettingsPopoverHeader } from './popover/header';
import { StepBadgeAnchorGrid } from './step-badge/anchor-grid';
import { StepBadgeAutoFields } from './step-badge/auto-fields';
import { StepBadgePopoverEnabledContent } from './step-badge/enabled-content';
import {
  normalizeStepBadgeFromProp,
  toggleStepBadgeOffset,
  filterStepBadgeValue,
} from './step-badge/helpers';
import { StepBadgePopoverOffsetGrid } from './step-badge/offset-grid';
import { FutureStepBadgeSettingsPopover } from './step-badge/popover';
import { StepBadgeSaveSection } from './step-badge/save-section';
import { createDefaultHighlighterSettings } from '../../features/highlighter/style/defaults';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let portal: HTMLDivElement | null = null;

beforeEach(() => {
  host = document.createElement('div');
  portal = document.createElement('div');
  document.body.append(host, portal);
  root = createRoot(host);
  persistence.loadHighlighter.mockResolvedValue(createDefaultHighlighterSettings());
  persistence.addBorder.mockResolvedValue('applied');
  persistence.updateBorder.mockResolvedValue('applied');
  persistence.setBorderEnabled.mockResolvedValue(undefined);
  persistence.createStep.mockResolvedValue({ id: 'created-step', outcome: 'applied' });
});

afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
  root = null;
  host = null;
  portal = null;
  vi.clearAllMocks();
});

it('renders both shared element popovers as interactive draggable surfaces', async () => {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 36, 32));
  const callout = createDefaultFrameCallout();
  const stepBadge = createDefaultFrameStepBadge();
  const frameSettings = createDefaultHighlighterSettings();
  const stepTemplateSourceChange = vi.fn();

  await act(async () =>
    root?.render(
      <>
        <FutureCalloutSettingsPopover
          anchorEl={anchor}
          headerContext="element"
          isOpen
          onChange={vi.fn()}
          onClose={vi.fn()}
          onDisable={vi.fn()}
          portalTarget={portal!}
          resetKey="frame-1"
          settings={callout}
        />
        <FutureStepBadgeSettingsPopover
          anchorEl={anchor}
          frameVisuals={{ borderColor: '#f97316', borderWidth: 4 }}
          headerContext="element"
          isOpen
          onChange={vi.fn()}
          onClose={vi.fn()}
          onDisable={vi.fn()}
          portalTarget={portal!}
          resetKey="frame-1"
          settings={stepBadge}
          templateSourceControl={{ onChange: stepTemplateSourceChange, value: 'forced' }}
        />
        <FrameAnnotationCreationFramePopover
          anchorEl={anchor}
          headerContext="element"
          isOpen
          onChange={vi.fn()}
          onClose={vi.fn()}
          portalTarget={portal!}
          resetKey="frame-1"
          settings={{
            blurSettings: frameSettings.defaultBlurSettings,
            borderSettings: frameSettings.borderPresets[0]!,
            effectMode: frameSettings.defaultEffectMode,
            focusSettings: frameSettings.defaultFocusSettings,
          }}
        />
      </>
    )
  );

  const popovers = portal?.querySelectorAll<HTMLElement>('.sniptale-content-popover');
  expect(popovers).toHaveLength(3);
  expect(Array.from(popovers ?? []).every((item) => item.style.pointerEvents === 'auto')).toBe(
    true
  );
  expect(
    Array.from(popovers ?? []).every(
      (item) =>
        item.querySelector('.sniptale-settings-popover-header')?.getAttribute('data-draggable') ===
        'true'
    )
  ).toBe(true);
  const stepPopover = portal?.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.future-step-badge-popover"]'
  );
  act(() =>
    stepPopover?.querySelector<HTMLButtonElement>(`button[aria-label="Сохранение"]`)?.click()
  );
  const stepName = stepPopover?.querySelector<HTMLInputElement>(
    'input[aria-label="Название шаблона"]'
  );
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(stepName, 'Shared step');
    stepName?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const createStep = [...(stepPopover?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (button) => button.textContent === 'Создать'
  );
  await act(async () => createStep?.click());
  expect(persistence.createStep).toHaveBeenCalled();

  await act(async () => {
    for (const button of portal?.querySelectorAll<HTMLButtonElement>('button') ?? []) {
      button.click();
      await Promise.resolve();
    }
  });
  expect(stepTemplateSourceChange).toHaveBeenCalledWith('frame-default');
});

it('covers shared badge position, enabled-state, value normalization, and save controls', () => {
  const onAnchorChange = vi.fn();
  const onOffsetToggle = vi.fn();
  const settings = createDefaultFrameStepBadge();
  const contentProps = {
    frameId: 'frame-1',
    frameVisuals: { borderColor: '#f97316', borderWidth: 4 },
    headerContext: 'element' as const,
    isAuto: false,
    localStepBadgeSettings: settings,
    onAlphabetChange: vi.fn(),
    onAnchorChange,
    onApplyPreset: vi.fn(),
    onAutoModeChange: vi.fn(),
    onClose: vi.fn(),
    onConfigurePreset: vi.fn(),
    onCreatePreset: vi.fn(async () => ({ outcome: 'applied' })),
    onDisable: vi.fn(),
    onOffsetToggle,
    onResetPreset: vi.fn(),
    onSettingsChange: vi.fn(),
    onShowPresets: vi.fn(),
    onTogglePreset: vi.fn(),
    onTypeChange: vi.fn(),
    onUpdatePreset: vi.fn(async () => ({ outcome: 'applied' })),
    onValueChange: vi.fn(),
    pendingPresetIds: new Set<string>(),
    presetError: null,
    presets: [],
    templateSettings: DEFAULT_STEP_BADGE_TEMPLATE,
  };

  act(() =>
    root?.render(
      <>
        <StepBadgeAnchorGrid
          onAnchorChange={onAnchorChange}
          onOffsetToggle={onOffsetToggle}
          selectedAnchor="top-left"
          selectedOffsets={['up']}
        />
        <StepBadgeAutoFields
          onAlphabetChange={contentProps.onAlphabetChange}
          onTypeChange={contentProps.onTypeChange}
          settings={{ ...settings, alphabet: 'latin', type: 'letter' }}
        />
        <StepBadgePopoverOffsetGrid
          onOffsetToggle={onOffsetToggle}
          selectedOffsets={['left', 'down']}
        />
        <StepBadgePopoverEnabledContent {...contentProps} />
        <StepBadgePopoverEnabledContent
          {...contentProps}
          localStepBadgeSettings={{ ...settings, enabled: false }}
        />
        <StepBadgeSaveSection
          embedded
          onCreate={contentProps.onCreatePreset}
          onUpdate={contentProps.onUpdatePreset}
          presets={[]}
          settings={DEFAULT_STEP_BADGE_TEMPLATE}
        />
      </>
    )
  );
  act(() =>
    host?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click())
  );
  act(() =>
    host
      ?.querySelector('.sniptale-settings-popover-header-actions')
      ?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  );

  expect(onAnchorChange).toHaveBeenCalled();
  expect(onOffsetToggle).toHaveBeenCalled();
  expect(DEFAULT_POPOVER_ANCHOR_GRID.flat().map(getAnchorDotPosition)).toHaveLength(9);
  expect(normalizeStepBadgeFromProp(undefined)).toMatchObject({ enabled: false, sizeLevel: 3 });
  expect(
    normalizeStepBadgeFromProp({
      enabled: true,
      corner: 'bottom-right',
      size: 'extra-large',
      type: 'number',
      value: '1',
    })
  ).toMatchObject({ anchor: 'bottom-right', sizeLevel: 6 });
  expect(toggleStepBadgeOffset(['up', 'down', 'left'], 'right')).toEqual([]);
  expect(toggleStepBadgeOffset(['up'], 'up')).toEqual([]);
  expect(filterStepBadgeValue({ auto: true, type: 'number', value: 'a12' })).toBe('12');
  expect(filterStepBadgeValue({ auto: false, type: 'letter', value: 'ABC' })).toBe('AB');
});

it('projects callout save actions through the canonical shared settings snapshot', async () => {
  const callout = createDefaultFrameCallout();
  const preset = {
    ...callout,
    ...callout.content,
    content: { titleText: 'Preset title' },
    id: 'preset-1',
    name: 'Preset',
    order: 0,
    origin: 'user' as const,
  };
  const create = vi.fn(async () => ({ id: 'created-callout', outcome: 'applied' }));
  const overwrite = vi.fn(async () => true);
  const onCreated = vi.fn();
  const section = createCalloutSaveSection({
    create,
    error: null,
    isSaving: false,
    overwrite,
    onCreated,
    presets: [preset],
    settings: callout,
  });

  await expect(section.onCreate('Saved')).resolves.toBe(true);
  await expect(section.onOverwrite('missing')).resolves.toBe(false);
  await expect(section.onOverwrite('preset-1')).resolves.toBe(true);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Saved' }));
  expect(onCreated).toHaveBeenCalledWith('created-callout');
  expect(onCreated).toHaveBeenCalledWith('preset-1');
  expect(overwrite).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'preset-1', name: 'Preset' })
  );

  const { connectorAttachments: _attachments, ...detachedPlacement } = callout.placement;
  const detached = createCalloutSaveSection({
    create,
    error: null,
    isSaving: false,
    overwrite,
    presets: [],
    settings: {
      ...callout,
      placement: detachedPlacement,
    },
  });
  await expect(detached.onCreate('Detached')).resolves.toBe(true);
});

it('runs the shared draggable header actions without leaking pointer events', () => {
  const action = vi.fn();
  const close = vi.fn();
  const destructive = vi.fn();
  const source = vi.fn();
  act(() =>
    root?.render(
      <SettingsPopoverHeader
        action={{ label: 'Mode', onClick: action }}
        closeLabel="Close"
        context="element"
        destructiveAction={{ label: 'Disable', onClick: destructive }}
        sourceAction={{
          description: 'Use the template linked to the frame',
          label: 'From frame',
          onClick: source,
        }}
        drag={{
          isDragging: true,
          onPointerDown: vi.fn(),
          onPointerMove: vi.fn(),
          onPointerUp: vi.fn(),
          position: { left: 0, top: 0 },
        }}
        onClose={close}
        title="Settings"
      />
    )
  );
  act(() =>
    host?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click())
  );
  expect(action).toHaveBeenCalledOnce();
  expect(destructive).toHaveBeenCalledOnce();
  expect(source).toHaveBeenCalledOnce();
  expect(host?.querySelector('[title="Use the template linked to the frame"]')).not.toBeNull();
  expect(close).toHaveBeenCalledOnce();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
