// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedDomEvent: vi.fn(() => true),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../../platform/trusted-events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/trusted-events')>()),
  isTrustedDomEvent: trustedEventMocks.isTrustedDomEvent,
}));

import { getCaptureActionOptions, getCaptureActionTooltip, ToolbarCaptureButtons } from './options';
import type { ToolbarCaptureActionsProps } from '../types';
import { createBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import type { ToolbarMenuState } from '../state/menu';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createClosedToolbarMenuState(): ToolbarMenuState {
  return {
    activeMenuType: null,
    closeMenu: vi.fn(),
    closeMenus: vi.fn(),
    setActiveMenuType: vi.fn(),
    setShowCaptureMenu: vi.fn(),
    setShowTimerMenu: vi.fn(),
    setViewportMenuOpen: vi.fn(),
    showCaptureMenu: false,
    showTimerMenu: false,
    toggleMenu: vi.fn(),
    viewportMenuOpen: false,
  };
}

function createCaptureButtonProps(
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot']
) {
  return {
    compactMenus: false,
    currentViewport: null,
    displayMode: 'horizontal' as const,
    isLoading: false,
    onTakeScreenshot,
    toolbarMenuState: createClosedToolbarMenuState(),
  };
}

function renderCaptureButtons() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ToolbarCaptureButtons {...createCaptureButtonProps(vi.fn())} />);
  });

  return container;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  trustedEventMocks.isTrustedDomEvent.mockReset();
  trustedEventMocks.isTrustedDomEvent.mockReturnValue(true);
});

describe('toolbar capture options', () => {
  registerCaptureActionOptionTests();
  registerCaptureButtonIntentTests();
});

function registerCaptureActionOptionTests() {
  it('orders all after-capture actions for the toolbar menu', () => {
    expect(getCaptureActionOptions().map((option) => option.value)).toEqual([
      'download_default',
      'copy',
      'edit',
      'ask_system',
      'ask_preset',
      'scenario',
    ]);
  });

  it('provides a distinct icon for every after-capture action', () => {
    expect(getCaptureActionOptions().every((option) => 'icon' in option)).toBe(true);
  });

  it('returns the scenario tooltip label', () => {
    expect(getCaptureActionTooltip('scenario')).toBe('content.toolbar.afterCaptureScenario');
  });

  it('marks screenshot capture activation as deferred', () => {
    const buttons = renderCaptureButtons();

    expect(
      buttons
        .querySelector('[data-ui="content.toolbar.capture-visible-button"]')
        ?.getAttribute('data-sniptale-activation-bridge')
    ).toBe('defer');
    expect(
      buttons
        .querySelector('[data-ui="content.toolbar.capture-full-button"]')
        ?.getAttribute('data-sniptale-activation-bridge')
    ).toBe('defer');
    expect(
      buttons
        .querySelector('[data-ui="content.toolbar.capture-selection-button"]')
        ?.getAttribute('data-sniptale-activation-bridge')
    ).toBe('defer');
  });

  it('places selection capture immediately after visible-area capture', () => {
    const buttons = Array.from(renderCaptureButtons().querySelectorAll('[data-ui]')).map((button) =>
      button.getAttribute('data-ui')
    );

    expect(buttons).toEqual([
      'content.toolbar.capture-visible-button',
      'content.toolbar.capture-selection-button',
      'content.toolbar.capture-full-button',
      'content.toolbar.capture-full-settings-button',
    ]);
  });
}

function registerCaptureButtonIntentTests() {
  it('ignores synthetic capture button clicks', () => {
    const onTakeScreenshot = vi.fn();
    trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
    const buttons = renderCaptureButtonsWithHandler(onTakeScreenshot);

    buttons
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-visible-button"]')
      ?.click();

    expect(onTakeScreenshot).not.toHaveBeenCalled();
  });

  it('passes a trusted content intent source to capture handlers', () => {
    const onTakeScreenshot = vi.fn();
    const buttons = renderCaptureButtonsWithHandler(onTakeScreenshot);

    buttons
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-visible-button"]')
      ?.click();

    expect(onTakeScreenshot).toHaveBeenCalledWith('visible', {
      kind: 'trusted-content-event',
    });
  });

  it('passes a trusted content intent source from activation-bridge capture clicks', () => {
    const onTakeScreenshot = vi.fn();
    trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
    const buttons = renderCaptureButtonsWithHandler(onTakeScreenshot);

    buttons
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.capture-full-button"]')
      ?.dispatchEvent(createBridgedMouseEvent('click', new MouseEvent('pointerdown')));

    expect(onTakeScreenshot).toHaveBeenCalledWith('full', {
      kind: 'trusted-content-event',
    });
  });
}

function renderCaptureButtonsWithHandler(
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot']
) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ToolbarCaptureButtons {...createCaptureButtonProps(onTakeScreenshot)} />);
  });

  return container;
}
