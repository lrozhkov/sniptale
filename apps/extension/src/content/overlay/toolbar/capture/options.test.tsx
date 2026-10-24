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
import { useToolbarMenuState, type ToolbarMenuState } from '../state/menu';
import { Library } from 'lucide-react';
import { ImageEditorIcon } from '@sniptale/ui/editor-chrome';

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
      'save_to_library',
    ]);
  });

  it('provides a distinct icon for every after-capture action', () => {
    const options = getCaptureActionOptions();
    expect(options.every((option) => 'icon' in option)).toBe(true);
    expect(options.find((option) => option.value === 'edit')?.icon.type).toBe(ImageEditorIcon);
    expect(options.find((option) => option.value === 'save_to_library')?.icon.type).toBe(Library);
    expect(options.some((option) => option.value === 'scenario')).toBe(false);
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

  it('orders visible-area, full-page and selection capture with their arrows', () => {
    const buttons = Array.from(renderCaptureButtons().querySelectorAll('[data-ui]')).map((button) =>
      button.getAttribute('data-ui')
    );

    expect(buttons).toEqual([
      'content.toolbar.capture-visible-button',
      'content.toolbar.capture-visible-settings-button',
      'content.toolbar.capture-full-button',
      'content.toolbar.capture-full-settings-button',
      'content.toolbar.capture-selection-button',
    ]);
  });

  it('matches the popup menu screenshot icon set', () => {
    const buttons = renderCaptureButtons();

    expect(
      buttons.querySelector('[data-ui="content.toolbar.capture-visible-button"] svg')?.classList
    ).toContain('lucide-app-window');
    expect(
      buttons.querySelector('[data-ui="content.toolbar.capture-full-button"] svg')?.classList
    ).toContain('lucide-unfold-vertical');
    expect(
      buttons.querySelector('[data-ui="content.toolbar.capture-selection-button"] svg')?.classList
    ).toContain('lucide-crop');
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

function InteractiveCaptureButtons({
  onTakeScreenshot,
}: {
  onTakeScreenshot: ToolbarCaptureActionsProps['onTakeScreenshot'];
}) {
  const toolbarMenuState = useToolbarMenuState();
  return (
    <ToolbarCaptureButtons
      {...createCaptureButtonProps(onTakeScreenshot)}
      toolbarMenuState={toolbarMenuState}
    />
  );
}

it.each(['visible', 'full'] as const)(
  'runs each %s quick action only on trusted release and closes the menu',
  async (mode) => {
    const onTakeScreenshot = vi.fn();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root?.render(<InteractiveCaptureButtons onTakeScreenshot={onTakeScreenshot} />)
    );
    for (const option of getCaptureActionOptions()) {
      act(() =>
        container
          ?.querySelector<HTMLButtonElement>(
            `[data-ui="content.toolbar.capture-${mode}-settings-button"]`
          )
          ?.click()
      );
      const action = container?.querySelector<HTMLButtonElement>(
        `[data-ui="content.toolbar.capture-${mode}-action.${option.value}"]`
      );
      expect(action).not.toBeNull();
      act(() => action?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(onTakeScreenshot).not.toHaveBeenCalled();
      act(() => action?.click());
      expect(onTakeScreenshot).toHaveBeenCalledExactlyOnceWith(
        mode,
        { kind: 'trusted-content-event' },
        { captureAction: option.value }
      );
      expect(container?.querySelector('.sniptale-screenshot-menu')).toBeNull();
      onTakeScreenshot.mockClear();
    }
    act(() =>
      container
        ?.querySelector<HTMLButtonElement>(
          `[data-ui="content.toolbar.capture-${mode}-settings-button"]`
        )
        ?.click()
    );
    trustedEventMocks.isTrustedDomEvent.mockReturnValue(false);
    act(() =>
      container
        ?.querySelector<HTMLButtonElement>(
          `[data-ui="content.toolbar.capture-${mode}-action.copy"]`
        )
        ?.click()
    );
    expect(onTakeScreenshot).not.toHaveBeenCalled();
    expect(container?.querySelector('.sniptale-screenshot-menu')).not.toBeNull();
  }
);
