// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import type { ToolbarFutureFrameStyle } from '../types';
import { useToolbarMenuState } from '../state/menu';
import { FutureFrameStyleControls } from './frame-style';

const popoverMocks = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock('../../../selection/frame-settings-popover', () => ({
  FrameSettingsPopover: (props: Record<string, unknown>) => {
    popoverMocks.props = props;
    return <div data-ui="future-frame-style-popover" data-open={String(props['isOpen'])} />;
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

it('switches only the future mode and opens settings on the active effect', () => {
  const onFutureFrameEffectModeChange = vi.fn();
  renderControls(createStyle('border'), onFutureFrameEffectModeChange);

  const blurButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.future-frame-blur"]'
  );
  act(() => blurButton?.click());

  expect(onFutureFrameEffectModeChange).toHaveBeenCalledWith('blur');
  expect(blurButton?.getAttribute('aria-pressed')).toBe('true');
  expect(popoverMocks.props?.['isOpen']).toBe(false);

  act(() => blurButton?.click());
  expect(popoverMocks.props).toMatchObject({
    effectMode: 'blur',
    isOpen: true,
    scope: 'session',
  });
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
