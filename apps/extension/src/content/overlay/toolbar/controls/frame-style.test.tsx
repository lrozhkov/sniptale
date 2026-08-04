// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { ToolbarFutureFrameStyle } from '../types';
import { useToolbarMenuState } from '../state/menu';
import { FutureFrameStyleControls } from './frame-style';
import { createDefaultCalloutSettings } from '../../../selection/callout/model';

const popoverMocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  calloutProps: null as Record<string, unknown> | null,
}));

vi.mock('../../../selection/frame-settings-popover', () => ({
  FrameSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.props = props;
    return <div data-ui="future-frame-style-popover" data-open={String(props['isOpen'])} />;
  },
}));

vi.mock('./future-callout', () => ({
  FutureCalloutSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.calloutProps = props;
    return <div data-ui="future-callout-popover" />;
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
  futureFrameCalloutActions?: {
    enable: () => ReturnType<typeof createDefaultCalloutSettings>;
    set: (settings: ReturnType<typeof createDefaultCalloutSettings> | null) => void;
  };
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
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('forwards compact menu presentation to future frame settings', () => {
  renderControls(createStyle('blur'), vi.fn(), true);

  expect(popoverMocks.props?.['compact']).toBe(true);
});

it('switches the future mode and opens its settings on the first click', () => {
  const onFutureFrameEffectModeChange = vi.fn();
  renderControls(createStyle('border'), onFutureFrameEffectModeChange);

  const blurButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-blur"]'
  );
  act(() => blurButton?.click());

  expect(onFutureFrameEffectModeChange).toHaveBeenCalledWith('blur');
  expect(blurButton?.getAttribute('aria-pressed')).toBe('true');
  expect(popoverMocks.props).toMatchObject({
    effectMode: 'blur',
    isOpen: true,
    scope: 'session',
  });

  act(() => blurButton?.click());
  expect(popoverMocks.props?.['isOpen']).toBe(false);
});

it('projects a mode change made from an existing frame', () => {
  const onFutureFrameEffectModeChange = vi.fn();
  renderControls(createStyle('border'), onFutureFrameEffectModeChange);
  renderControls(createStyle('focus'), onFutureFrameEffectModeChange);

  const focusButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-focus"]'
  );
  expect(focusButton?.getAttribute('aria-pressed')).toBe('true');
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
  act(() => button?.click());

  expect(onEnableFutureFrameCallout).toHaveBeenCalledOnce();
  expect(button?.getAttribute('aria-pressed')).toBe('true');
  expect(popoverMocks.calloutProps).toMatchObject({ isOpen: true, settings });
});
