// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameData } from '../../../features/highlighter/contracts';
import { addCalloutPopoverSettingsChangedListener } from '../../platform/page-context/frame-events';
import {
  createDefaultCalloutSettings,
  applyCalloutSettingsPatch,
} from '../../../features/highlighter/frame-annotation/callout/model';
import { useFrameUIController } from '../frame-runtime/ui-controller';
import { useFrameUIStore } from '../frame-runtime/state/frame-ui.store';
import { initializeContentUiRoots, queryAllContentUiElements } from '../../platform/dom-host';
import { translate } from '../../../platform/i18n';
import { InteractiveFrame } from '.';

const highlighterMocks = vi.hoisted(() => ({
  clearFrameEditing: vi.fn(),
  isHighlighterEnabled: vi.fn(() => true),
  pauseHighlighter: vi.fn(),
  setFrameEditing: vi.fn(),
}));

vi.mock('../highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlighter')>()),
  ...highlighterMocks,
}));

let container: HTMLDivElement | null = null;
let contentHost: HTMLDivElement | null = null;
let root: Root | null = null;

function createCalloutFrame(): FrameData {
  return {
    callout: createDefaultCalloutSettings(),
    effectMode: 'border',
    height: 180,
    id: 'frame-1',
    width: 320,
    x: 120,
    y: 80,
  };
}

function CalloutLifecycleHarness() {
  const [frame, setFrame] = React.useState(createCalloutFrame);
  useFrameUIController({ frames: [frame] });

  React.useEffect(
    () =>
      addCalloutPopoverSettingsChangedListener(({ frameId, settings }) => {
        if (frameId !== frame.id) return;
        setFrame((current) =>
          current.callout
            ? { ...current, callout: applyCalloutSettingsPatch(current.callout, settings) }
            : current
        );
      }),
    [frame.id]
  );

  return <InteractiveFrame frame={frame} onDelete={vi.fn()} onUpdate={setFrame} zIndex={10} />;
}

function findButton(title: string): HTMLButtonElement {
  const button = queryAllContentUiElements('button').find(
    (candidate): candidate is HTMLButtonElement =>
      candidate instanceof HTMLButtonElement && candidate.title === title
  );
  expect(button).toBeInstanceOf(HTMLButtonElement);
  return button as HTMLButtonElement;
}

function performPointerClick(element: HTMLElement) {
  element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

function openManualCalloutSettings(source: 'quick' | 'selected') {
  if (source === 'selected') {
    act(() => useFrameUIStore.getState().selectFrame('frame-1'));
    act(() => performPointerClick(findButton(translate('content.interactiveFrame.calloutEdit'))));
  } else {
    const quickSettings = queryAllContentUiElements('.sniptale-callout-settings-handle')[0];
    expect(quickSettings).toBeInstanceOf(HTMLElement);
    act(() => performPointerClick(quickSettings as HTMLElement));
  }
  const modeButtons = queryAllContentUiElements('button');
  const forkButton = modeButtons.find(
    (button) => button.title === translate('content.templateFork.fork')
  );
  if (forkButton) {
    act(() => performPointerClick(forkButton));
    return;
  }
  expect(
    modeButtons.find((button) => button.title === translate('content.templateFork.backToTemplates'))
  ).toBeInstanceOf(HTMLButtonElement);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useFrameUIStore.getState().reset();
  contentHost = document.createElement('div');
  document.body.append(contentHost);
  const { appContainer } = initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  container = document.createElement('div');
  appContainer.append(container);
  root = createRoot(container);
  act(() => root?.render(<CalloutLifecycleHarness />));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  contentHost?.remove();
  contentHost = null;
  useFrameUIStore.getState().reset();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('callout settings lifecycle', () => {
  it.each(['selected', 'quick'] as const)(
    'keeps the %s settings lifecycle open after dropdown and color updates',
    (source) => {
      openManualCalloutSettings(source);

      const fontSelect = queryAllContentUiElements('[aria-label="Шрифт"]')[0];
      act(() => performPointerClick(fontSelect as HTMLButtonElement));
      const monoOption = queryAllContentUiElements('[role="option"]').find(
        (option): option is HTMLButtonElement =>
          option instanceof HTMLButtonElement && option.textContent === 'Mono'
      );
      act(() => performPointerClick(monoOption as HTMLButtonElement));

      expect(useFrameUIStore.getState().activePopover).toEqual({
        frameId: 'frame-1',
        kind: 'callout-settings',
        calloutIndex: 0,
      });
      expect(queryAllContentUiElements('.sniptale-callout-settings-popover')).toHaveLength(1);

      const pickerTrigger = queryAllContentUiElements(
        '[data-ui="shared.ui.color-selector.picker-trigger"]'
      )[0];
      act(() => performPointerClick(pickerTrigger as HTMLButtonElement));
      const applyButton = queryAllContentUiElements('button').find(
        (button) => button.textContent === 'Применить'
      );
      act(() => performPointerClick(applyButton as HTMLButtonElement));

      expect(useFrameUIStore.getState().activePopover).toEqual({
        frameId: 'frame-1',
        kind: 'callout-settings',
        calloutIndex: 0,
      });
      expect(queryAllContentUiElements('.sniptale-callout-settings-popover')).toHaveLength(1);
    }
  );
});
