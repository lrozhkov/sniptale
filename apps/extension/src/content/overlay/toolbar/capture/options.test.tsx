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

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCaptureButtons() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(<ToolbarCaptureButtons onTakeScreenshot={vi.fn()} />);
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
  it('exposes scenario as an after-capture action', () => {
    expect(getCaptureActionOptions().map((option) => option.value)).toContain('scenario');
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
    root?.render(<ToolbarCaptureButtons onTakeScreenshot={onTakeScreenshot} />);
  });

  return container;
}
