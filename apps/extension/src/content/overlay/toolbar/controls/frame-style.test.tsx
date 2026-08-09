// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { EffectMode } from '../../../../features/highlighter/contracts';
import type {
  ToolbarFutureFrameCalloutActions,
  ToolbarFutureFrameStepBadgeActions,
  ToolbarFutureFrameStyle,
} from '../types';
import { useToolbarMenuState } from '../state/menu';
import { FutureFrameStyleControls } from './frame-style';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';
import { createDefaultFrameStepBadge } from '../../../../features/highlighter/frame-annotation/defaults';
import {
  getFrameSessionBorderPreset,
  resetFrameSessionBorderPreset,
} from '../../../selection/frame-runtime/session/border-preset';
import {
  getAnnotationTemplateSources,
  resetAnnotationTemplateSources,
} from '../../../selection/frame-runtime/session/annotation-template-source';
import { dispatchFutureFrameDefaultsChanged } from '../../../platform/page-context/frame-events';

const popoverMocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  calloutProps: null as Record<string, unknown> | null,
  stepBadgeProps: null as Record<string, unknown> | null,
}));
const forkSessionMocks = vi.hoisted(() => ({
  load: vi.fn().mockReturnValue(new Promise(() => undefined)),
  persist: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./annotation-fork-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./annotation-fork-session')>()),
  loadAnnotationForkDrafts: forkSessionMocks.load,
  persistAnnotationForkDrafts: forkSessionMocks.persist,
}));

vi.mock('../../../selection/frame-settings-popover', () => ({
  FrameSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.props = props;
    return <div data-ui="future-frame-style-popover" data-open={String(props['isOpen'])} />;
  },
}));

vi.mock('../../../../composition/frame-annotation-controls/callout/popover', () => ({
  FutureCalloutSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.calloutProps = props;
    return <div data-ui="future-frame-callout-popover" />;
  },
}));

vi.mock('../../../../composition/frame-annotation-controls/step-badge/popover', () => ({
  FutureStepBadgeSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.stepBadgeProps = props;
    return <div data-ui="future-frame-step-badge-popover" />;
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createStyle(effectMode: ToolbarFutureFrameStyle['effectMode']): ToolbarFutureFrameStyle {
  return {
    blurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
    borderSettings: DEFAULT_BORDER_PRESET,
    effectMode,
    focusSettings: { opacity: 0.5, showBorder: false },
  };
}

function Harness(props: {
  compactMenus?: boolean;
  futureFrameStyle: ToolbarFutureFrameStyle;
  onFutureFrameEffectModeChange: (mode: ToolbarFutureFrameStyle['effectMode']) => void;
  futureFrameCalloutActions?: ToolbarFutureFrameCalloutActions;
  futureFrameStepBadgeActions?: ToolbarFutureFrameStepBadgeActions;
}) {
  const toolbarMenuState = useToolbarMenuState();
  return <FutureFrameStyleControls {...props} toolbarMenuState={toolbarMenuState} />;
}

function renderControls(
  futureFrameStyle: ToolbarFutureFrameStyle,
  onFutureFrameEffectModeChange: (mode: ToolbarFutureFrameStyle['effectMode']) => void,
  compactMenus = false
) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <Harness
        compactMenus={compactMenus}
        futureFrameStyle={futureFrameStyle}
        onFutureFrameEffectModeChange={onFutureFrameEffectModeChange}
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  popoverMocks.props = null;
  popoverMocks.calloutProps = null;
  popoverMocks.stepBadgeProps = null;
  forkSessionMocks.load.mockReset().mockReturnValue(new Promise(() => undefined));
  forkSessionMocks.persist.mockReset().mockResolvedValue(undefined);
  resetFrameSessionBorderPreset();
  resetAnnotationTemplateSources();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  resetAnnotationTemplateSources();
});

it('forwards compact menu presentation to future frame settings', () => {
  renderControls(createStyle('blur'), vi.fn(), true);

  expect(popoverMocks.props?.['compact']).toBe(true);
  expect(
    container?.querySelector('[data-ui="content.toolbar.future-frame-effects-group"]')
  ).not.toBeNull();
  expect(container?.querySelector('[data-ui="content.toolbar.future-frame-style"]')).not.toBeNull();
  expect(container?.querySelector('[data-ui="content.toolbar.future-frame-blur"]')).toBeNull();
  expect(container?.querySelector('[data-ui="content.toolbar.future-frame-focus"]')).toBeNull();
  expect(
    container?.querySelector('[data-ui="content.toolbar.future-frame-effects-group"]')
      ?.parentElement
  ).toBe(container);
  expect(container?.querySelector('.sniptale-frame-annotation-creation-controls')).toBeNull();
});

it('opens one dynamic effect menu and projects mode changes from that menu', () => {
  const onFutureFrameEffectModeChange = vi.fn();
  renderControls(createStyle('border'), onFutureFrameEffectModeChange);

  const effectButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-style"]'
  );
  act(() => effectButton?.click());

  expect(popoverMocks.props).toMatchObject({
    effectMode: 'border',
    isOpen: true,
    scope: 'session',
  });
  expect(popoverMocks.props?.['anchorEl']).toBe(effectButton);

  act(() => {
    (popoverMocks.props?.['onEffectModeChange'] as ((mode: EffectMode) => void) | undefined)?.(
      'blur'
    );
  });
  expect(onFutureFrameEffectModeChange).toHaveBeenCalledWith('blur');
  expect(popoverMocks.props).toMatchObject({ effectMode: 'blur', isOpen: true });

  act(() => effectButton?.click());
  expect(popoverMocks.props?.['isOpen']).toBe(false);
});

it('projects a mode change made from an existing frame', () => {
  const onFutureFrameEffectModeChange = vi.fn();
  renderControls(createStyle('border'), onFutureFrameEffectModeChange);
  renderControls(createStyle('focus'), onFutureFrameEffectModeChange);

  const effectButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-style"]'
  );
  expect(effectButton?.getAttribute('aria-pressed')).toBe('true');
  expect(effectButton?.getAttribute('title')).toBe('content.interactiveFrame.effectFocus');
  expect(onFutureFrameEffectModeChange).not.toHaveBeenCalled();
});

it('enables future comments and opens their settings from the toolbar button', () => {
  const settings = createDefaultCalloutSettings();
  const onEnableFutureFrameCallout = vi.fn(() => settings);
  const onFutureFrameCalloutChange = vi.fn();
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <Harness
        futureFrameStyle={createStyle('border')}
        futureFrameCalloutActions={{
          enable: onEnableFutureFrameCallout,
          set: onFutureFrameCalloutChange,
        }}
        onFutureFrameEffectModeChange={vi.fn()}
      />
    );
  });

  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-callout"]'
  );
  expect(
    container.querySelector('[data-ui="content.toolbar.future-frame-annotations-group"]')
  ).not.toBeNull();
  act(() => button?.click());

  expect(onEnableFutureFrameCallout).toHaveBeenCalledOnce();
  expect(onFutureFrameCalloutChange).toHaveBeenCalledWith(settings);
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(popoverMocks.calloutProps).toMatchObject({
    isOpen: true,
    settings,
    portalTarget: expect.anything(),
  });
});

it('enables future numbering and opens the shared settings menu', () => {
  const settings = createDefaultFrameStepBadge();
  const enable = vi.fn(() => settings);
  const set = vi.fn();
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <Harness
        futureFrameStyle={createStyle('border')}
        futureFrameStepBadgeActions={{ enable, set }}
        onFutureFrameEffectModeChange={vi.fn()}
      />
    );
  });

  const button = container.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-step-badge"]'
  );
  act(() => button?.click());

  expect(enable).toHaveBeenCalledOnce();
  expect(set).toHaveBeenCalledWith(settings);
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(popoverMocks.stepBadgeProps).toMatchObject({
    isOpen: true,
    settings,
    portalTarget: expect.anything(),
  });
});

it('exposes independent frame-default and forced template controls to both toolbar menus', () => {
  const callout = createDefaultCalloutSettings();
  const stepBadge = createDefaultFrameStepBadge();
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root?.render(
      <Harness
        futureFrameCalloutActions={{ enable: () => callout, set: vi.fn() }}
        futureFrameStepBadgeActions={{ enable: () => stepBadge, set: vi.fn() }}
        futureFrameStyle={{
          ...createStyle('border'),
          futureCallout: callout,
          futureStepBadge: stepBadge,
        }}
        onFutureFrameEffectModeChange={vi.fn()}
      />
    );
  });

  expect(popoverMocks.calloutProps?.['templateSourceControl']).toMatchObject({
    value: 'frame-default',
  });
  expect(popoverMocks.stepBadgeProps?.['templateSourceControl']).toMatchObject({
    value: 'frame-default',
  });

  act(() => {
    const calloutControl = popoverMocks.calloutProps?.['templateSourceControl'] as {
      onChange: (source: 'forced') => void;
    };
    calloutControl.onChange('forced');
  });
  expect(getAnnotationTemplateSources().callout).toBe('forced');
  expect(popoverMocks.calloutProps?.['templateSourceControl']).toMatchObject({ value: 'forced' });
  expect(getAnnotationTemplateSources().stepBadge).toBe('frame-default');
});

it('keeps capture visibility out of the future-frame toolbar', () => {
  renderControls(createStyle('border'), vi.fn());
  expect(
    container?.querySelector('[data-ui="content.toolbar.future-frame-capture-visibility"]')
  ).toBeNull();
  expect(getFrameSessionBorderPreset().effects?.capture).toEqual({ hideFrame: false });
});

it('updates the visible toolbar defaults after an element fork is promoted', () => {
  const callout = createDefaultCalloutSettings();
  callout.style.surface.fillPaint = { kind: 'solid', color: '#123456ff' };
  const baseStepBadge = createDefaultFrameStepBadge();
  const stepBadge = {
    ...baseStepBadge,
    style: { ...baseStepBadge.style, diameter: 30 },
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Harness
        futureFrameCalloutActions={{ enable: () => callout, set: vi.fn() }}
        futureFrameStepBadgeActions={{ enable: () => stepBadge, set: vi.fn() }}
        futureFrameStyle={createStyle('border')}
        onFutureFrameEffectModeChange={vi.fn()}
      />
    );
  });

  act(() => dispatchFutureFrameDefaultsChanged({ kind: 'callout', settings: callout }));
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.future-frame-callout"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(popoverMocks.calloutProps?.['settings']).toMatchObject({
    style: { surface: { fillPaint: { kind: 'solid', color: '#123456ff' } } },
  });

  act(() => dispatchFutureFrameDefaultsChanged({ kind: 'stepBadge', settings: stepBadge }));
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.future-frame-step-badge"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(popoverMocks.stepBadgeProps?.['settings']).toMatchObject({ style: { diameter: 30 } });

  act(() =>
    dispatchFutureFrameDefaultsChanged({
      kind: 'frame',
      settings: {
        blurSettings: { amount: 9, blurType: 'distortion', showBorder: false },
        borderSettings: { ...DEFAULT_BORDER_PRESET, width: 6 },
        effectMode: 'focus',
        focusSettings: { blurAmount: 3, opacity: 0.25, showBorder: true },
      },
    })
  );
  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.future-frame-style"]')
      ?.getAttribute('title')
  ).toBe('content.interactiveFrame.effectFocus');
  expect(popoverMocks.props).toMatchObject({ effectMode: 'focus' });
});

it('restores a tab-scoped frame fork after the toolbar remounts', async () => {
  forkSessionMocks.load.mockResolvedValueOnce({
    frame: {
      blurSettings: { amount: 12, blurType: 'gaussian', showBorder: false },
      borderSettings: { ...DEFAULT_BORDER_PRESET, sourcePresetId: undefined, width: 9 },
      effectMode: 'focus',
      focusSettings: { blurAmount: 4, opacity: 0.2, showBorder: true },
    },
  });

  renderControls(createStyle('border'), vi.fn());
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(
    container
      ?.querySelector('[data-ui="content.toolbar.future-frame-style"]')
      ?.getAttribute('title')
  ).toBe('content.interactiveFrame.effectFocus');
  expect(forkSessionMocks.persist).not.toHaveBeenCalled();
});
